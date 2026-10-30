/**
 * Annuaire des agents d'un organisme et de leurs accès aux applications de la
 * gamme — logique pure, sans Supabase (testée dans `agentAccess.test.ts`).
 *
 * Deux sources pour un même agent :
 *  - `user_organizations` : son accès au SOCLE (rôle `admin` / `consultant`) ;
 *  - `user_application_access` : ses accès aux AUTRES applications (Iris,
 *    Clara…), avec le rôle de base déclaré par chacune (`application_roles`).
 *
 * ⚠️ Retirer l'accès à une application le rend INACTIF, il ne l'efface pas :
 * l'application doit apprendre le retrait pour bannir le compte, et le rôle
 * revient gratuitement si l'accès est rendu.
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
  users: AgentUser | null;
}

export interface AccessRow {
  id: string;
  application_id: string;
  role_code: string;
  is_active: boolean;
  users: AgentUser | null;
}

export interface AgentAccess {
  id: string;
  roleCode: string;
  isActive: boolean;
}

export interface OrgAgent {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: UserStatus;
  /** Accès au Socle sur cet organisme, ou `null`. */
  socle: { membershipId: string; role: string } | null;
  /** Accès aux autres applications sur cet organisme, par identifiant d'application. */
  access: Record<string, AgentAccess>;
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
    ensure(m.users).socle = { membershipId: m.id, role: m.role };
  }
  for (const a of accesses) {
    if (!a.users) continue;
    ensure(a.users).access[a.application_id] = { id: a.id, roleCode: a.role_code, isActive: a.is_active };
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

/** L'agent a-t-il au moins un accès en vigueur sur cet organisme ? */
export function hasAnyAccess(agent: OrgAgent): boolean {
  return agent.socle !== null || Object.values(agent.access).some((a) => a.isActive);
}

/** Rôle effectif d'une application, ou `NO_ACCESS`. */
export function currentRole(agent: OrgAgent | null, applicationId: string): string {
  if (!agent) return NO_ACCESS;
  if (applicationId === SOCLE_APPLICATION_ID) return agent.socle?.role ?? NO_ACCESS;
  const access = agent.access[applicationId];
  return access && access.isActive ? access.roleCode : NO_ACCESS;
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

export type AccessChange =
  | { kind: "insert"; applicationId: string; roleCode: string }
  | { kind: "update"; accessId: string; applicationId: string; roleCode: string; isActive: boolean };

/**
 * Ce qu'il faut écrire dans `user_application_access` pour passer de l'état
 * courant aux rôles voulus (`desired[app] = code`, ou `NO_ACCESS`).
 * Jamais de suppression : retirer = désactiver, en gardant le rôle.
 */
export function planAccessChanges(
  current: Record<string, AgentAccess>,
  desired: Record<string, string>,
): AccessChange[] {
  const changes: AccessChange[] = [];
  for (const [applicationId, roleCode] of Object.entries(desired)) {
    if (applicationId === SOCLE_APPLICATION_ID) continue;
    const existing = current[applicationId];
    if (roleCode === NO_ACCESS) {
      if (existing?.isActive) {
        changes.push({
          kind: "update",
          accessId: existing.id,
          applicationId,
          roleCode: existing.roleCode,
          isActive: false,
        });
      }
      continue;
    }
    if (!existing) {
      changes.push({ kind: "insert", applicationId, roleCode });
    } else if (!existing.isActive || existing.roleCode !== roleCode) {
      changes.push({ kind: "update", accessId: existing.id, applicationId, roleCode, isActive: true });
    }
  }
  return changes;
}
