import { describe, it, expect } from "vitest";
import { parseUpdatedSince, serializeAgents, type AgentAccessRow } from "./agents";

const ROLES = [
  { code: "administrateur", label: "Administrateur", is_admin: true },
  { code: "elu", label: "Élu", is_admin: false },
];

const alice = {
  id: "u-a",
  email: "alice@ville.fr",
  first_name: "Alice",
  last_name: "Martin",
  status: "active",
  updated_at: "2026-10-30T10:00:00.000Z",
  // Colonnes que la sérialisation ne doit jamais laisser passer.
  global_role: "super_admin",
};

function row(overrides: Partial<AgentAccessRow>): AgentAccessRow {
  return {
    organization_id: "org-1",
    role_code: "elu",
    is_active: true,
    updated_at: "2026-10-30T10:00:00.000Z",
    users: alice,
    ...overrides,
  };
}

describe("serializeAgents", () => {
  it("regroupe les accès par agent, en liste blanche", () => {
    const [agent, ...rest] = serializeAgents(
      [row({}), row({ organization_id: "org-2", role_code: "administrateur" })],
      ROLES,
      null,
    );
    expect(rest).toEqual([]);
    expect(Object.keys(agent).sort()).toEqual(
      ["accesses", "email", "first_name", "is_active", "last_name", "socle_user_id", "status", "updated_at"].sort(),
    );
    expect(agent.socle_user_id).toBe("u-a");
    expect(agent.is_active).toBe(true);
    expect(agent.accesses).toEqual([
      { organization_id: "org-1", role: "elu", role_label: "Élu", is_admin: false, is_active: true, updated_at: "2026-10-30T10:00:00.000Z" },
      { organization_id: "org-2", role: "administrateur", role_label: "Administrateur", is_admin: true, is_active: true, updated_at: "2026-10-30T10:00:00.000Z" },
    ]);
  });

  it("un accès retiré reste servi ; sans accès actif, l'agent est inactif", () => {
    const [agent] = serializeAgents([row({ is_active: false })], ROLES, null);
    expect(agent.accesses[0].is_active).toBe(false);
    expect(agent.is_active).toBe(false);
  });

  it("un agent suspendu est inactif, quels que soient ses accès", () => {
    const [agent] = serializeAgents([row({ users: { ...alice, status: "suspended" } })], ROLES, null);
    expect(agent.status).toBe("suspended");
    expect(agent.is_active).toBe(false);
  });

  it("updated_since : ne rend que les agents changés après, avec leur état complet", () => {
    const rows = [
      row({ organization_id: "org-1", updated_at: "2026-10-30T09:00:00.000Z", users: { ...alice, updated_at: "2026-10-30T09:00:00.000Z" } }),
      row({ organization_id: "org-2", updated_at: "2026-10-30T11:00:00.000Z", users: { ...alice, updated_at: "2026-10-30T09:00:00.000Z" } }),
    ];
    const [agent] = serializeAgents(rows, ROLES, new Date("2026-10-30T10:00:00.000Z"));
    expect(agent.accesses.map((a) => a.organization_id)).toEqual(["org-1", "org-2"]);
    expect(agent.updated_at).toBe("2026-10-30T11:00:00.000Z");
    expect(serializeAgents(rows, ROLES, new Date("2026-10-30T11:00:00.000Z"))).toEqual([]);
  });

  it("un changement du compte seul (suspension) suffit", () => {
    const rows = [row({ updated_at: "2026-10-30T09:00:00.000Z", users: { ...alice, status: "suspended", updated_at: "2026-10-30T12:00:00.000Z" } })];
    expect(serializeAgents(rows, ROLES, new Date("2026-10-30T10:00:00.000Z"))).toHaveLength(1);
  });

  it("rôle inconnu du catalogue : le code tient lieu de libellé, jamais admin", () => {
    const [agent] = serializeAgents([row({ role_code: "inconnu" })], ROLES, null);
    expect(agent.accesses[0]).toMatchObject({ role: "inconnu", role_label: "inconnu", is_admin: false });
  });

  it("ignore les lignes sans compte", () => {
    expect(serializeAgents([row({ users: null })], ROLES, null)).toEqual([]);
  });
});

describe("parseUpdatedSince", () => {
  it("absent = liste complète, invalide = undefined", () => {
    expect(parseUpdatedSince(null)).toBeNull();
    expect(parseUpdatedSince("")).toBeNull();
    expect(parseUpdatedSince("2026-10-30")).toBeUndefined();
    expect(parseUpdatedSince("n'importe quoi")).toBeUndefined();
    expect(parseUpdatedSince("2026-10-30T10:00:00Z")?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
  });
});
