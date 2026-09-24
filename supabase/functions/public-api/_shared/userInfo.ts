/**
 * Informations à destination des usagers — ce que `GET /v1/portal/organizations`
 * sert. Logique pure, testée.
 *
 * ⚠️ **Miroir volontaire** de `src/features/organizations/userInfo.ts` (motif
 * `agentGuidance.ts`) : une edge function ne peut rien importer de `src/`. Les
 * deux lisent le même JSON avec la même tolérance — mêmes clés, questions
 * entièrement vides écartées, jamais un texte tronqué — et les tests des deux
 * côtés l'épinglent.
 *
 * ⚠️ **Whitelist** : seules les trois rubriques du contrat sortent du JSON
 * stocké, sous leurs noms exacts. Et seuls les organismes que le portail
 * AFFICHE sortent de la liste : ni service interne, ni organisation obsolète,
 * ni organisme qui n'a rien écrit.
 */
import type { PortalOrganizationInfoDto, UserInfoBody } from "./dto.ts";

type Row = Record<string, unknown>;

function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function objects(raw: unknown): Row[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

/** Miroir de `parseUserInfo` (et, pour la FAQ, de `parseFaq`). */
export function parseUserInfo(raw: unknown): UserInfoBody {
  const stored: Row = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Row) : {};
  return {
    description: coerceString(stored.description),
    openingHours: coerceString(stored.openingHours),
    faq: objects(stored.faq)
      .map((item) => ({ question: coerceString(item.question), answer: coerceString(item.answer) }))
      .filter((item) => item.question.trim() !== "" || item.answer.trim() !== ""),
  };
}

/** Rien d'écrit ? Des blancs ne sont pas un texte. */
export function isUserInfoEmpty(info: UserInfoBody): boolean {
  return info.description.trim() === "" && info.openingHours.trim() === "" && info.faq.length === 0;
}

/** Organisation de l'arbre du tenant, telle que la route la lit. */
export interface UserInfoOrganization {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  status: string | null;
  is_internal_service: boolean | null;
}

/**
 * Organismes du portail et leurs informations usagers. Ne sort qu'un organisme
 * **affiché** (actif, pas service interne) qui a **écrit** quelque chose. Le
 * tenant en tête, puis les autres par nom : c'est l'ordre dans lequel un
 * usager (ou un assistant) les lit.
 */
export function serializePortalOrganizationsInfo(
  tenantId: string,
  organizations: UserInfoOrganization[],
  rows: Array<{ organization_id: unknown; info: unknown; updated_at: unknown }>,
): PortalOrganizationInfoDto[] {
  const byOrg = new Map(rows.map((row) => [String(row.organization_id), row]));
  const out: PortalOrganizationInfoDto[] = [];
  for (const org of organizations) {
    if (org.status !== "active" || org.is_internal_service === true) continue;
    const row = byOrg.get(org.id);
    if (!row) continue;
    const info = parseUserInfo(row.info);
    if (isUserInfoEmpty(info)) continue;
    out.push({
      id: org.id,
      name: org.name,
      slug: typeof org.slug === "string" && org.slug !== "" ? org.slug : null,
      is_tenant: org.id === tenantId,
      updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
      info,
    });
  }
  return out.sort((a, b) =>
    a.is_tenant !== b.is_tenant ? (a.is_tenant ? -1 : 1) : a.name.localeCompare(b.name, "fr"),
  );
}
