/**
 * Lecture et vérification de la demande d'accès d'`invite-user` — logique
 * pure, sans Deno ni Supabase (testée par vitest, déployée avec `index.ts`).
 *
 * Depuis le 2026-11-10, l'administrateur choisit les organismes ouverts à
 * l'agent, par application : `socle_organization_ids` pour le Socle, et
 * `organization_ids` sur chaque entrée de `applications`. Absents, ils valent
 * l'organisme de la page (`organization_id`) — l'ancien contrat reste lu.
 */

export interface ApplicationAccessInput {
  application_id: string;
  role_code: string;
  organization_ids: string[];
}

export interface AccessRequest {
  /** Rôle Socle (`admin` / `consultant`), ou vide. */
  socleRole: string;
  socleOrganizationIds: string[];
  applications: ApplicationAccessInput[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ORGANIZATIONS = 200;
const MAX_APPLICATIONS = 20;

/** Liste d'organismes : absente = l'organisme de la page ; mal formée = `null`. */
function parseOrganizationIds(value: unknown, pageOrganizationId: string): string[] | null {
  if (value === undefined || value === null) return [pageOrganizationId];
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ORGANIZATIONS) return null;
  if (!value.every((v) => typeof v === "string" && UUID.test(v))) return null;
  return [...new Set(value as string[])];
}

/** La demande du corps, ou `null` si elle est mal formée (400). */
export function parseAccessRequest(
  body: Record<string, unknown>,
  pageOrganizationId: string,
): AccessRequest | null {
  const socleRole = typeof body.role === "string" ? body.role : "";
  if (!["", "admin", "consultant"].includes(socleRole)) return null;
  const socleOrganizationIds = socleRole ? parseOrganizationIds(body.socle_organization_ids, pageOrganizationId) : [];
  if (socleOrganizationIds === null) return null;

  const raw = body.applications;
  const applications: ApplicationAccessInput[] = [];
  if (raw !== undefined && raw !== null) {
    if (!Array.isArray(raw) || raw.length > MAX_APPLICATIONS) return null;
    const seen = new Set<string>();
    for (const item of raw) {
      const entry = (item ?? {}) as Record<string, unknown>;
      const applicationId = entry.application_id;
      const roleCode = entry.role_code;
      if (typeof applicationId !== "string" || typeof roleCode !== "string" || !applicationId || !roleCode) {
        return null;
      }
      if (seen.has(applicationId)) return null;
      seen.add(applicationId);
      const organizationIds = parseOrganizationIds(entry.organization_ids, pageOrganizationId);
      if (organizationIds === null) return null;
      applications.push({ application_id: applicationId, role_code: roleCode, organization_ids: organizationIds });
    }
  }
  return { socleRole, socleOrganizationIds, applications };
}

/** Tous les organismes demandés, sans doublon. */
export function requestedOrganizationIds(request: AccessRequest): string[] {
  return [...new Set([...request.socleOrganizationIds, ...request.applications.flatMap((a) => a.organization_ids)])];
}

/**
 * Rôles et abonnements, et règle de la racine : un rôle d'administration
 * d'application vaut pour toute la collectivité, il exige donc la racine
 * parmi les organismes cochés (même règle que la contrainte
 * `enforce_application_admin_on_root`, vérifiée ici AVANT de créer le compte).
 * Rend le motif du refus, ou `null`.
 */
export function applicationAccessRefusal(
  request: AccessRequest,
  rootId: string,
  subscribed: Set<string>,
  roles: { application_id: string; code: string; is_admin: boolean }[],
): string | null {
  for (const a of request.applications) {
    if (!subscribed.has(a.application_id)) {
      return `La collectivité n'est pas abonnée à l'application « ${a.application_id} ».`;
    }
    const role = roles.find((r) => r.application_id === a.application_id && r.code === a.role_code);
    if (!role) return `Rôle inconnu pour l'application « ${a.application_id} ».`;
    if (role.is_admin && !a.organization_ids.includes(rootId)) {
      return `L'administration de l'application « ${a.application_id} » vaut pour toute la collectivité : elle exige l'accès sur la collectivité elle-même.`;
    }
  }
  return null;
}

/**
 * Lignes `user_application_access` à insérer, la racine en tête (lisible ; la
 * règle de la racine est de toute façon vérifiée en fin de transaction).
 */
export function accessRows(
  request: AccessRequest,
  userId: string,
  rootId: string,
  createdBy: string,
): { user_id: string; organization_id: string; application_id: string; role_code: string; created_by: string }[] {
  return request.applications.flatMap((a) =>
    [...a.organization_ids]
      .sort((x, y) => Number(y === rootId) - Number(x === rootId))
      .map((organization_id) => ({
        user_id: userId,
        organization_id,
        application_id: a.application_id,
        role_code: a.role_code,
        created_by: createdBy,
      })),
  );
}
