import { describe, it, expect } from "vitest";
import {
  accessApplications,
  currentRole,
  hasAnyAccess,
  mergeAgents,
  NO_ACCESS,
  planAccessChanges,
  readStatus,
  type AgentUser,
} from "./agentAccess";

const alice: AgentUser = { id: "u-a", email: "alice@ville.fr", first_name: "Alice", last_name: "Martin", status: "active" };
const bob: AgentUser = { id: "u-b", email: "bob@ville.fr", first_name: null, last_name: null, status: "suspended" };

describe("mergeAgents", () => {
  it("fusionne l'accès Socle et les accès aux applications d'un même agent", () => {
    const agents = mergeAgents(
      [{ id: "m-1", role: "admin", users: alice }],
      [
        { id: "x-1", application_id: "clara", role_code: "gestionnaire", is_active: true, users: alice },
        { id: "x-2", application_id: "iris", role_code: "agent", is_active: false, users: alice },
      ],
    );
    expect(agents).toHaveLength(1);
    expect(agents[0].socle).toEqual({ membershipId: "m-1", role: "admin" });
    expect(agents[0].access.clara).toEqual({ id: "x-1", roleCode: "gestionnaire", isActive: true });
    expect(currentRole(agents[0], "socle")).toBe("admin");
    expect(currentRole(agents[0], "clara")).toBe("gestionnaire");
    // Accès retiré = aucun accès, même si le rôle est conservé.
    expect(currentRole(agents[0], "iris")).toBe(NO_ACCESS);
  });

  it("garde un agent sans accès au Socle, et lit son statut", () => {
    const agents = mergeAgents([], [{ id: "x-3", application_id: "clara", role_code: "elu", is_active: true, users: bob }]);
    expect(agents[0].socle).toBeNull();
    expect(agents[0].status).toBe("suspended");
    expect(hasAnyAccess(agents[0])).toBe(true);
  });

  it("un agent dont tous les accès sont retirés n'a plus d'accès", () => {
    const agents = mergeAgents([], [{ id: "x-4", application_id: "iris", role_code: "agent", is_active: false, users: bob }]);
    expect(hasAnyAccess(agents[0])).toBe(false);
  });

  it("ignore les lignes sans utilisateur lisible (RLS) et trie par nom", () => {
    const agents = mergeAgents(
      [
        { id: "m-2", role: "consultant", users: null },
        { id: "m-3", role: "consultant", users: alice },
        { id: "m-4", role: "consultant", users: bob },
      ],
      [],
    );
    expect(agents.map((a) => a.userId)).toEqual(["u-a", "u-b"]);
  });
});

describe("readStatus", () => {
  it("au doute, actif", () => {
    expect(readStatus(undefined)).toBe("active");
    expect(readStatus("n'importe quoi")).toBe("active");
    expect(readStatus("suspended")).toBe("suspended");
  });
});

describe("accessApplications", () => {
  const applications = [
    { id: "socle", name: "Socle" },
    { id: "nora", name: "Nora" },
    { id: "iris", name: "Iris" },
    { id: "clara", name: "Clara" },
  ];
  const roles = [
    { application_id: "iris", code: "agent", label: "Agent", is_admin: false, sort_order: 30 },
    { application_id: "iris", code: "admin", label: "Administrateur", is_admin: true, sort_order: 10 },
    { application_id: "clara", code: "elu", label: "Élu", is_admin: false, sort_order: 40 },
  ];

  it("ne propose que les applications abonnées qui déclarent des rôles, jamais le Socle", () => {
    const apps = accessApplications(applications, roles, ["socle", "nora", "iris"]);
    expect(apps.map((a) => a.id)).toEqual(["iris"]);
    expect(apps[0].roles.map((r) => r.code)).toEqual(["admin", "agent"]);
  });

  it("aucun abonnement, aucune application", () => {
    expect(accessApplications(applications, roles, [])).toEqual([]);
  });
});

describe("planAccessChanges", () => {
  const current = {
    clara: { id: "x-1", roleCode: "gestionnaire", isActive: true },
    iris: { id: "x-2", roleCode: "agent", isActive: false },
  };

  it("n'écrit rien quand rien ne change", () => {
    expect(planAccessChanges(current, { clara: "gestionnaire", iris: NO_ACCESS })).toEqual([]);
  });

  it("retirer = désactiver en gardant le rôle, jamais supprimer", () => {
    expect(planAccessChanges(current, { clara: NO_ACCESS })).toEqual([
      { kind: "update", accessId: "x-1", applicationId: "clara", roleCode: "gestionnaire", isActive: false },
    ]);
  });

  it("rendre un accès retiré le réactive, avec le rôle choisi", () => {
    expect(planAccessChanges(current, { iris: "lecteur" })).toEqual([
      { kind: "update", accessId: "x-2", applicationId: "iris", roleCode: "lecteur", isActive: true },
    ]);
  });

  it("change de rôle, crée un nouvel accès, ignore le Socle", () => {
    expect(planAccessChanges(current, { clara: "elu", ariane: "agent", socle: "admin" })).toEqual([
      { kind: "update", accessId: "x-1", applicationId: "clara", roleCode: "elu", isActive: true },
      { kind: "insert", applicationId: "ariane", roleCode: "agent" },
    ]);
  });
});
