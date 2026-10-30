/**
 * Agents d'une application — `GET /v1/users?tenant_id=&updated_since=`
 * (contrat 1.43.0). Les accès que le Socle ouvre à l'application de la clé
 * (`api_keys.consumer`) sur le sous-arbre d'une collectivité, regroupés par
 * agent.
 *
 * ⚠️ Une application ne voit JAMAIS les accès d'une autre : le filtre par
 * application se fait à la lecture (index.ts), ce module ne reçoit que les
 * lignes de l'application appelante.
 *
 * ⚠️ Un accès retiré reste servi (`is_active: false`) : c'est ainsi que
 * l'application apprend qu'elle doit bannir le compte. `is_active` de l'agent
 * résume tout : statut actif ET au moins un accès actif.
 *
 * Pur, sans Deno : testé par vitest, déployé avec `index.ts`.
 */
import type { AgentAccessDto, AgentDto } from "./dto.ts";

export interface AgentAccessRow {
  organization_id: unknown;
  role_code: unknown;
  is_active: unknown;
  updated_at: unknown;
  users: {
    id: unknown;
    email: unknown;
    first_name: unknown;
    last_name: unknown;
    status: unknown;
    updated_at: unknown;
  } | null;
}

export interface AgentRoleRow {
  code: unknown;
  label: unknown;
  is_admin: unknown;
}

/** `updated_since` : instant ISO 8601, ou `null` (liste complète) ; `undefined` = invalide. */
export function parseUpdatedSince(value: string | null): Date | null | undefined {
  if (value === null || value === "") return null;
  // Une date seule (« 2026-10-30 ») serait lue en UTC : on exige l'heure.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const time = (v: unknown): number => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Une entrée par agent, avec TOUS ses accès à l'application sur le sous-arbre
 * (l'état complet de l'agent, même si un seul accès a changé). Avec `since`,
 * seuls les agents dont le compte ou un accès a changé après cet instant
 * (strictement). Tri par e-mail : stable d'un appel à l'autre.
 */
export function serializeAgents(
  rows: AgentAccessRow[],
  roles: AgentRoleRow[],
  since: Date | null,
): AgentDto[] {
  const roleByCode = new Map(roles.map((r) => [String(r.code), r]));
  const byUser = new Map<string, { user: NonNullable<AgentAccessRow["users"]>; rows: AgentAccessRow[] }>();
  for (const row of rows) {
    if (!row.users || typeof row.users.id !== "string") continue;
    const entry = byUser.get(row.users.id) ?? { user: row.users, rows: [] };
    entry.rows.push(row);
    byUser.set(row.users.id, entry);
  }

  const sinceTime = since?.getTime() ?? null;
  const out: AgentDto[] = [];
  for (const { user, rows: userRows } of byUser.values()) {
    const latest = Math.max(time(user.updated_at), ...userRows.map((r) => time(r.updated_at)));
    if (sinceTime !== null && latest <= sinceTime) continue;

    const status = user.status === "suspended" ? "suspended" : "active";
    const accesses: AgentAccessDto[] = userRows
      .map((r) => {
        const role = roleByCode.get(String(r.role_code));
        return {
          organization_id: String(r.organization_id),
          role: String(r.role_code),
          role_label: text(role?.label) ?? String(r.role_code),
          is_admin: role?.is_admin === true,
          is_active: r.is_active === true,
          updated_at: text(r.updated_at),
        };
      })
      .sort((a, b) => a.organization_id.localeCompare(b.organization_id));

    out.push({
      socle_user_id: user.id as string,
      email: String(user.email ?? ""),
      first_name: text(user.first_name),
      last_name: text(user.last_name),
      status,
      is_active: status === "active" && accesses.some((a) => a.is_active),
      accesses,
      updated_at: latest > 0 ? new Date(latest).toISOString() : null,
    });
  }
  return out.sort((a, b) => a.email.localeCompare(b.email));
}
