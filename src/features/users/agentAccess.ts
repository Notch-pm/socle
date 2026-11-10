/**
 * Annuaire des agents et de leurs accès aux applications de la gamme — logique
 * pure, sans Supabase (testée dans `agentAccess.test.ts`).
 *
 * Deux sources pour un même agent :
 *  - `user_organizations` : son accès au SOCLE (rôle `admin` / `consultant`) ;
 *  - `user_application_access` : ses accès aux AUTRES applications (Iris,
 *    Clara…), avec le rôle de base déclaré par chacune (`application_roles`).
 *
 * L'écran lit TOUT le sous-arbre que l'administrateur gère (l'organisme de la
 * page et ses services) : un agent y a, par application, UN rôle et un ou
 * plusieurs organismes ouverts (décision du 2026-11-10 — vérifié en base : aucun
 * agent n'avait deux rôles différents dans une même application).
 *
 * ⚠️ Retirer l'accès à une application le rend INACTIF, il ne l'efface pas :
 * l'application doit apprendre le retrait pour bannir le compte, et le rôle
 * revient gratuitement si l'accès est rendu.
 *
 * ⚠️ Un rôle d'ADMINISTRATION d'une application (`application_roles.is_admin`)
 * vaut pour toute la collectivité dans l'application : il exige l'accès sur la
 * RACINE (contrainte `enforce_application_admin_on_root` en base). Les services
 * cochés en plus restent permis : ils servent d'affectations (Clara).
 */

export const SOCLE_APPLICATION_ID = "socle";

/** Le Socle a ses rôles en dur (`user_organizations.role`). */
export const SOCLE_ROLES: ApplicationRole[] = [
  { code: "admin", label: "Administrateur", isAdmin: true },
  { code: "consultant", label: "Consultant", isAdmin: false },
];

/** Valeur des sélecteurs pour « aucun accès ». */
export const NO_ACCESS = "";

export type UserStatus = "active" | "suspended";

export interface ApplicationRole {
  code: string;
  label: string;
  isAdmin: boolean;
}

export interface AccessApplication {
  id: string;
  name: string;
  roles: ApplicationRole[];
}

export interface AgentUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
}

export interface MembershipRow {
  id: string;
  role: string;
  organization_id: string;
  users: AgentUser | null;
}

export interface AccessRow {
  id: string;
  application_id: string;
  organization_id: string;
  role_code: string;
  is_active: boolean;
  users: AgentUser | null;
}

/** Une ligne `user_application_access` de l'agent. */
export interface AccessGrant {
  id: string;
  organizationId: string;
  roleCode: string;
  isActive: boolean;
}

export interface OrgAgent {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: UserStatus;
  /** Accès au Socle dans le sous-arbre, ou `null`. */
  socle: { role: string; memberships: { id: string; organizationId: string }[] } | null;
  /** Lignes d'accès aux autres applications dans le sous-arbre, par application. */
  access: Record<string, AccessGrant[]>;
}

/** Ce que l'administrateur veut : par application, un rôle et des organismes. */
export type AccessDraft = Record<string, { role: string; organizationIds: string[] }>;

/** Un organisme du sous-arbre géré, à plat, dans l'ordre de l'arbre. */
export interface ManagedOrganization {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
}

export function readStatus(value: string | null | undefined): UserStatus {
  return value === "suspended" ? "suspended" : "active";
}

/** Fusionne les deux sources en une ligne par agent, triée par nom puis e-mail. */
export function mergeAgents(memberships: MembershipRow[], accesses: AccessRow[]): OrgAgent[] {
  const byId = new Map<string, OrgAgent>();
  const ensure = (u: AgentUser): OrgAgent => {
    let agent = byId.get(u.id);
    if (!agent) {
      agent = {
        userId: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        status: readStatus(u.status),
        socle: null,
        access: {},
      };
      byId.set(u.id, agent);
    }
    return agent;
  };

  for (const m of memberships) {
    if (!m.users) continue;
    const agent = ensure(m.users);
    const membership = { id: m.id, organizationId: m.organization_id };
    if (!agent.socle) agent.socle = { role: m.role, memberships: [membership] };
    else {
      agent.socle.memberships.push(membership);
      // Rôle le plus fort si deux rôles coexistent (cas hérité, l'écran les réaligne).
      if (m.role === "admin") agent.socle.role = "admin";
    }
  }
  for (const a of accesses) {
    if (!a.users) continue;
    const agent = ensure(a.users);
    (agent.access[a.application_id] ??= []).push({
      id: a.id,
      organizationId: a.organization_id,
      roleCode: a.role_code,
      isActive: a.is_active,
    });
  }

  return [...byId.values()].sort((x, y) => {
    const nx = displayName(x).toLocaleLowerCase("fr");
    const ny = displayName(y).toLocaleLowerCase("fr");
    return nx.localeCompare(ny, "fr") || x.email.localeCompare(y.email, "fr");
  });
}

export function displayName(agent: Pick<OrgAgent, "firstName" | "lastName" | "email">): string {
  return [agent.firstName, agent.lastName].filter(Boolean).join(" ") || agent.email;
}

/** L'agent a-t-il au moins un accès en vigueur dans le sous-arbre ? */
export function hasAnyAccess(agent: OrgAgent): boolean {
  return agent.socle !== null || Object.values(agent.access).some((rows) => rows.some((r) => r.isActive));
}

/** Organismes ouverts à l'agent pour une application (accès actifs seulement). */
export function activeOrganizations(agent: OrgAgent | null, applicationId: string): string[] {
  if (!agent) return [];
  if (applicationId === SOCLE_APPLICATION_ID) return agent.socle?.memberships.map((m) => m.organizationId) ?? [];
  return (agent.access[applicationId] ?? []).filter((r) => r.isActive).map((r) => r.organizationId);
}

/**
 * Rôle effectif d'une application, ou `NO_ACCESS`. Un seul rôle par
 * application ; si des lignes héritées divergent, celui de la racine (ou de la
 * première ligne active) l'emporte, et l'enregistrement réaligne les autres.
 */
export function currentRole(agent: OrgAgent | null, applicationId: string, rootId?: string | null): string {
  if (!agent) return NO_ACCESS;
  if (applicationId === SOCLE_APPLICATION_ID) return agent.socle?.role ?? NO_ACCESS;
  const active = (agent.access[applicationId] ?? []).filter((r) => r.isActive);
  if (active.length === 0) return NO_ACCESS;
  return (active.find((r) => r.organizationId === rootId) ?? active[0]).roleCode;
}

/**
 * Les applications dont l'organisme peut ouvrir l'accès : celles auxquelles sa
 * RACINE est abonnée et qui déclarent des rôles (Nora n'en déclare pas : elle
 * n'a pas d'agents). Le Socle n'y figure pas — ses rôles sont à part.
 */
export function accessApplications(
  applications: { id: string; name: string }[],
  roles: { application_id: string; code: string; label: string; is_admin: boolean; sort_order: number }[],
  subscribed: string[],
): AccessApplication[] {
  const subscribedSet = new Set(subscribed);
  return applications
    .filter((app) => app.id !== SOCLE_APPLICATION_ID && subscribedSet.has(app.id))
    .map((app) => ({
      id: app.id,
      name: app.name,
      roles: roles
        .filter((r) => r.application_id === app.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
        .map((r) => ({ code: r.code, label: r.label, isAdmin: r.is_admin })),
    }))
    .filter((app) => app.roles.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/**
 * Le sous-arbre que gère l'administrateur, à plat dans l'ordre de l'arbre
 * (parent puis enfants triés par nom), à partir de la liste visible par RLS.
 * `orgId` en tête ; vide s'il n'est pas dans la liste.
 */
export function managedOrganizations(
  orgs: { id: string; name: string; parent_id: string | null }[],
  orgId: string,
): ManagedOrganization[] {
  const top = orgs.find((o) => o.id === orgId);
  if (!top) return [];
  const children = new Map<string, typeof orgs>();
  for (const o of orgs) {
    if (!o.parent_id) continue;
    const list = children.get(o.parent_id) ?? [];
    list.push(o);
    children.set(o.parent_id, list);
  }
  const out: ManagedOrganization[] = [];
  const seen = new Set<string>();
  const walk = (o: (typeof orgs)[number], depth: number) => {
    if (seen.has(o.id)) return;
    seen.add(o.id);
    out.push({ id: o.id, name: o.name, parentId: o.parent_id, depth });
    const kids = [...(children.get(o.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    for (const k of kids) walk(k, depth + 1);
  };
  walk(top, 0);
  return out;
}

/**
 * La racine de la collectivité si l'administrateur la gère (organisme de la
 * page sans parent), sinon `null` : un administrateur de service ne peut pas
 * donner de rôle d'administration d'application.
 */
export function managedRootId(managed: ManagedOrganization[]): string | null {
  const top = managed[0];
  return top && top.parentId === null ? top.id : null;
}

/** Rôle d'administration d'une application (hors Socle) ? */
export function isApplicationAdminRole(applications: AccessApplication[], applicationId: string, role: string): boolean {
  if (applicationId === SOCLE_APPLICATION_ID || role === NO_ACCESS) return false;
  return applications.find((a) => a.id === applicationId)?.roles.find((r) => r.code === role)?.isAdmin ?? false;
}

/** Formulaire de création : Socle en consultant, l'organisme de la page coché partout. */
export function newDraft(applications: AccessApplication[], organizationId: string): AccessDraft {
  const draft: AccessDraft = { [SOCLE_APPLICATION_ID]: { role: "consultant", organizationIds: [organizationId] } };
  for (const app of applications) draft[app.id] = { role: NO_ACCESS, organizationIds: [organizationId] };
  return draft;
}

/** Formulaire de modification : l'état actuel de l'agent dans le sous-arbre. */
export function draftFromAgent(
  agent: OrgAgent,
  applications: AccessApplication[],
  organizationId: string,
  rootId: string | null,
): AccessDraft {
  const draft: AccessDraft = {};
  for (const id of [SOCLE_APPLICATION_ID, ...applications.map((a) => a.id)]) {
    const role = currentRole(agent, id, rootId);
    draft[id] = { role, organizationIds: role === NO_ACCESS ? [organizationId] : activeOrganizations(agent, id) };
  }
  return draft;
}

/**
 * Applique un changement de rôle au brouillon. Choisir un rôle
 * d'administration d'application coche la racine (règle de la base).
 */
export function setDraftRole(
  draft: AccessDraft,
  applications: AccessApplication[],
  applicationId: string,
  role: string,
  rootId: string | null,
): AccessDraft {
  const entry = draft[applicationId] ?? { role: NO_ACCESS, organizationIds: [] };
  let organizationIds = entry.organizationIds;
  if (rootId && isApplicationAdminRole(applications, applicationId, role) && !organizationIds.includes(rootId)) {
    organizationIds = [rootId, ...organizationIds];
  }
  return { ...draft, [applicationId]: { role, organizationIds } };
}

/** Coche ou décoche des organismes pour une application. */
export function toggleDraftOrganizations(
  draft: AccessDraft,
  applicationId: string,
  organizationIds: string[],
  checked: boolean,
): AccessDraft {
  const entry = draft[applicationId] ?? { role: NO_ACCESS, organizationIds: [] };
  const set = new Set(entry.organizationIds);
  for (const id of organizationIds) {
    if (checked) set.add(id);
    else set.delete(id);
  }
  return { ...draft, [applicationId]: { ...entry, organizationIds: [...set] } };
}

/** Accès demandés (rôle choisi). */
export function grantedEntries(draft: AccessDraft): [string, { role: string; organizationIds: string[] }][] {
  return Object.entries(draft).filter(([, e]) => e.role !== NO_ACCESS);
}

/**
 * Le motif du refus, ou `null` : au moins un accès, au moins un organisme
 * par accès, organismes dans le sous-arbre géré, et rôle d'administration
 * d'application seulement avec la racine.
 */
export function validateDraft(
  draft: AccessDraft,
  applications: AccessApplication[],
  managed: ManagedOrganization[],
): string | null {
  const granted = grantedEntries(draft);
  if (granted.length === 0) return "Ouvrez l'accès à au moins une application.";
  const rootId = managedRootId(managed);
  const managedIds = new Set(managed.map((o) => o.id));
  const nameOf = (id: string) =>
    id === SOCLE_APPLICATION_ID ? "Socle" : (applications.find((a) => a.id === id)?.name ?? id);
  for (const [applicationId, { role, organizationIds }] of granted) {
    if (organizationIds.length === 0) return `Cochez au moins un organisme pour ${nameOf(applicationId)}.`;
    if (organizationIds.some((id) => !managedIds.has(id))) {
      return `Un organisme coché pour ${nameOf(applicationId)} est hors de votre périmètre.`;
    }
    if (isApplicationAdminRole(applications, applicationId, role) && (!rootId || !organizationIds.includes(rootId))) {
      return `L'administration de ${nameOf(applicationId)} vaut pour toute la collectivité : elle exige l'accès sur la collectivité elle-même.`;
    }
  }
  return null;
}

export interface SoclePlan {
  deleteMembershipIds: string[];
  insertOrganizationIds: string[];
  role: string;
}

/**
 * Accès au Socle : `user_organizations` n'a pas de policy UPDATE, un
 * changement de rôle se fait donc en supprimant puis en recréant.
 */
export function planSocleChanges(
  current: OrgAgent["socle"],
  desired: { role: string; organizationIds: string[] },
): SoclePlan {
  const currentOrgs = new Map((current?.memberships ?? []).map((m) => [m.organizationId, m.id]));
  if (desired.role === NO_ACCESS) {
    return { deleteMembershipIds: [...currentOrgs.values()], insertOrganizationIds: [], role: NO_ACCESS };
  }
  if (current && current.role !== desired.role) {
    return {
      deleteMembershipIds: [...currentOrgs.values()],
      insertOrganizationIds: [...new Set(desired.organizationIds)],
      role: desired.role,
    };
  }
  const wanted = new Set(desired.organizationIds);
  return {
    deleteMembershipIds: [...currentOrgs.entries()].filter(([org]) => !wanted.has(org)).map(([, id]) => id),
    insertOrganizationIds: [...wanted].filter((org) => !currentOrgs.has(org)),
    role: desired.role,
  };
}

export type AccessChange =
  | { kind: "insert"; applicationId: string; organizationId: string; roleCode: string }
  | {
      kind: "update";
      accessId: string;
      applicationId: string;
      organizationId: string;
      roleCode: string;
      isActive: boolean;
    };

/**
 * Ce qu'il faut écrire dans `user_application_access` pour passer de l'état
 * courant au brouillon. Jamais de suppression : retirer = désactiver, en
 * gardant le rôle.
 *
 * ⚠️ L'ORDRE compte (une requête par changement, chacune vérifiée par la base) :
 * d'abord les services qui ne seront pas administrateurs, puis la racine, puis
 * les services administrateurs — ainsi un administrateur n'existe jamais sur un
 * service sans l'être sur la racine.
 */
export function planAccessChanges(
  current: Record<string, AccessGrant[]>,
  draft: AccessDraft,
  applications: AccessApplication[],
  rootId: string | null,
): AccessChange[] {
  const changes: AccessChange[] = [];
  for (const [applicationId, { role, organizationIds }] of Object.entries(draft)) {
    if (applicationId === SOCLE_APPLICATION_ID) continue;
    const rows = current[applicationId] ?? [];
    const wanted = role === NO_ACCESS ? new Set<string>() : new Set(organizationIds);
    for (const row of rows) {
      if (wanted.has(row.organizationId)) {
        if (!row.isActive || row.roleCode !== role) {
          changes.push({
            kind: "update",
            accessId: row.id,
            applicationId,
            organizationId: row.organizationId,
            roleCode: role,
            isActive: true,
          });
        }
      } else if (row.isActive) {
        changes.push({
          kind: "update",
          accessId: row.id,
          applicationId,
          organizationId: row.organizationId,
          roleCode: row.roleCode,
          isActive: false,
        });
      }
    }
    const existing = new Set(rows.map((r) => r.organizationId));
    for (const organizationId of wanted) {
      if (!existing.has(organizationId)) changes.push({ kind: "insert", applicationId, organizationId, roleCode: role });
    }
  }

  const phase = (c: AccessChange): number => {
    if (c.organizationId === rootId) return 1;
    const active = c.kind === "insert" || c.isActive;
    return active && isApplicationAdminRole(applications, c.applicationId, c.roleCode) ? 2 : 0;
  };
  return changes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => phase(a.c) - phase(b.c) || a.i - b.i)
    .map(({ c }) => c);
}
