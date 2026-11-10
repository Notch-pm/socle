import { describe, it, expect } from "vitest";
import {
  accessApplications,
  activeOrganizations,
  currentRole,
  draftFromAgent,
  hasAnyAccess,
  managedOrganizations,
  managedRootId,
  mergeAgents,
  newDraft,
  NO_ACCESS,
  planAccessChanges,
  planSocleChanges,
  readStatus,
  setDraftRole,
  toggleDraftOrganizations,
  validateDraft,
  type AccessApplication,
  type AgentUser,
  type ManagedOrganization,
} from "./agentAccess";

const alice: AgentUser = { id: "u-a", email: "alice@ville.fr", first_name: "Alice", last_name: "Martin", status: "active" };
const bob: AgentUser = { id: "u-b", email: "bob@ville.fr", first_name: null, last_name: null, status: "suspended" };

const CLARA: AccessApplication = {
  id: "clara",
  name: "Clara",
  roles: [
    { code: "administrateur", label: "Administrateur", isAdmin: true },
    { code: "gestionnaire", label: "Gestionnaire", isAdmin: false },
    { code: "elu", label: "Élu", isAdmin: false },
  ],
};
const IRIS: AccessApplication = {
  id: "iris",
  name: "Iris",
  roles: [
    { code: "acces", label: "Accès", isAdmin: false },
    { code: "administrateur", label: "Administrateur", isAdmin: true },
  ],
};
const APPS = [CLARA, IRIS];

const MANAGED: ManagedOrganization[] = [
  { id: "root", name: "Ville", parentId: null, depth: 0 },
  { id: "svc-a", name: "État civil", parentId: "root", depth: 1 },
  { id: "svc-b", name: "Urbanisme", parentId: "root", depth: 1 },
];

describe("mergeAgents", () => {
  it("fusionne l'accès Socle et les accès aux applications d'un même agent, sur tous les organismes", () => {
    const agents = mergeAgents(
      [
        { id: "m-1", role: "admin", organization_id: "root", users: alice },
        { id: "m-2", role: "admin", organization_id: "svc-a", users: alice },
      ],
      [
        { id: "x-1", application_id: "clara", organization_id: "root", role_code: "gestionnaire", is_active: true, users: alice },
        { id: "x-2", application_id: "clara", organization_id: "svc-a", role_code: "gestionnaire", is_active: true, users: alice },
        { id: "x-3", application_id: "iris", organization_id: "root", role_code: "acces", is_active: false, users: alice },
      ],
    );
    expect(agents).toHaveLength(1);
    expect(agents[0].socle).toEqual({
      role: "admin",
      memberships: [
        { id: "m-1", organizationId: "root" },
        { id: "m-2", organizationId: "svc-a" },
      ],
    });
    expect(currentRole(agents[0], "socle")).toBe("admin");
    expect(currentRole(agents[0], "clara")).toBe("gestionnaire");
    expect(activeOrganizations(agents[0], "clara")).toEqual(["root", "svc-a"]);
    // Accès retiré = aucun accès, même si le rôle est conservé.
    expect(currentRole(agents[0], "iris")).toBe(NO_ACCESS);
    expect(activeOrganizations(agents[0], "iris")).toEqual([]);
  });

  it("garde un agent sans accès au Socle, et lit son statut", () => {
    const agents = mergeAgents(
      [],
      [{ id: "x-3", application_id: "clara", organization_id: "svc-b", role_code: "elu", is_active: true, users: bob }],
    );
    expect(agents[0].socle).toBeNull();
    expect(agents[0].status).toBe("suspended");
    expect(hasAnyAccess(agents[0])).toBe(true);
  });

  it("un agent dont tous les accès sont retirés n'a plus d'accès", () => {
    const agents = mergeAgents(
      [],
      [{ id: "x-4", application_id: "iris", organization_id: "root", role_code: "acces", is_active: false, users: bob }],
    );
    expect(hasAnyAccess(agents[0])).toBe(false);
  });

  it("ignore les lignes sans utilisateur lisible (RLS) et trie par nom", () => {
    const agents = mergeAgents(
      [
        { id: "m-2", role: "consultant", organization_id: "root", users: null },
        { id: "m-3", role: "consultant", organization_id: "root", users: alice },
        { id: "m-4", role: "consultant", organization_id: "root", users: bob },
      ],
      [],
    );
    expect(agents.map((a) => a.userId)).toEqual(["u-a", "u-b"]);
  });

  it("rôles hérités divergents : celui de la racine l'emporte", () => {
    const [agent] = mergeAgents(
      [],
      [
        { id: "x-1", application_id: "clara", organization_id: "svc-a", role_code: "elu", is_active: true, users: alice },
        { id: "x-2", application_id: "clara", organization_id: "root", role_code: "gestionnaire", is_active: true, users: alice },
      ],
    );
    expect(currentRole(agent, "clara", "root")).toBe("gestionnaire");
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
    { application_id: "iris", code: "administrateur", label: "Administrateur", is_admin: true, sort_order: 20 },
    { application_id: "iris", code: "acces", label: "Accès", is_admin: false, sort_order: 10 },
    { application_id: "clara", code: "elu", label: "Élu", is_admin: false, sort_order: 40 },
  ];

  it("ne propose que les applications abonnées qui déclarent des rôles, jamais le Socle", () => {
    const apps = accessApplications(applications, roles, ["socle", "nora", "iris"]);
    expect(apps.map((a) => a.id)).toEqual(["iris"]);
    expect(apps[0].roles.map((r) => r.code)).toEqual(["acces", "administrateur"]);
  });

  it("aucun abonnement, aucune application", () => {
    expect(accessApplications(applications, roles, [])).toEqual([]);
  });
});

describe("managedOrganizations", () => {
  const orgs = [
    { id: "root", name: "Ville", parent_id: null },
    { id: "svc-b", name: "Urbanisme", parent_id: "root" },
    { id: "svc-a", name: "État civil", parent_id: "root" },
    { id: "sub", name: "Accueil", parent_id: "svc-a" },
    { id: "other", name: "Autre ville", parent_id: null },
  ];

  it("met l'organisme de la page en tête, puis ses services dans l'ordre de l'arbre", () => {
    const managed = managedOrganizations(orgs, "root");
    expect(managed.map((o) => [o.id, o.depth])).toEqual([
      ["root", 0],
      ["svc-a", 1],
      ["sub", 2],
      ["svc-b", 1],
    ]);
    expect(managedRootId(managed)).toBe("root");
  });

  it("un administrateur de service ne gère pas la racine", () => {
    const managed = managedOrganizations(orgs, "svc-a");
    expect(managed.map((o) => o.id)).toEqual(["svc-a", "sub"]);
    expect(managedRootId(managed)).toBeNull();
  });

  it("organisme absent : rien", () => {
    expect(managedOrganizations(orgs, "inconnu")).toEqual([]);
  });
});

describe("brouillon d'accès", () => {
  it("création : Socle en consultant, l'organisme de la page coché partout", () => {
    expect(newDraft(APPS, "root")).toEqual({
      socle: { role: "consultant", organizationIds: ["root"] },
      clara: { role: NO_ACCESS, organizationIds: ["root"] },
      iris: { role: NO_ACCESS, organizationIds: ["root"] },
    });
  });

  it("choisir un rôle d'administration d'application coche la racine", () => {
    const draft = toggleDraftOrganizations(newDraft(APPS, "root"), "iris", ["root"], false);
    const next = setDraftRole(draft, APPS, "iris", "administrateur", "root");
    expect(next.iris).toEqual({ role: "administrateur", organizationIds: ["root"] });
    // Le Socle n'a pas de règle de racine : son administrateur gère un sous-arbre.
    const socle = setDraftRole(toggleDraftOrganizations(draft, "socle", ["root"], false), APPS, "socle", "admin", "root");
    expect(socle.socle.organizationIds).toEqual([]);
  });

  it("modification : reprend rôle et organismes actifs de l'agent", () => {
    const [agent] = mergeAgents(
      [{ id: "m-1", role: "consultant", organization_id: "svc-a", users: alice }],
      [
        { id: "x-1", application_id: "clara", organization_id: "root", role_code: "elu", is_active: true, users: alice },
        { id: "x-2", application_id: "clara", organization_id: "svc-b", role_code: "elu", is_active: true, users: alice },
      ],
    );
    expect(draftFromAgent(agent, APPS, "root", "root")).toEqual({
      socle: { role: "consultant", organizationIds: ["svc-a"] },
      clara: { role: "elu", organizationIds: ["root", "svc-b"] },
      iris: { role: NO_ACCESS, organizationIds: ["root"] },
    });
  });
});

describe("validateDraft", () => {
  it("exige au moins un accès", () => {
    const draft = { ...newDraft(APPS, "root"), socle: { role: NO_ACCESS, organizationIds: ["root"] } };
    expect(validateDraft(draft, APPS, MANAGED)).toBe("Ouvrez l'accès à au moins une application.");
  });

  it("exige au moins un organisme par accès", () => {
    const draft = toggleDraftOrganizations(newDraft(APPS, "root"), "socle", ["root"], false);
    expect(validateDraft(draft, APPS, MANAGED)).toBe("Cochez au moins un organisme pour Socle.");
  });

  it("refuse un organisme hors du sous-arbre géré", () => {
    const draft = toggleDraftOrganizations(newDraft(APPS, "root"), "socle", ["ailleurs"], true);
    expect(validateDraft(draft, APPS, MANAGED)).toMatch(/hors de votre périmètre/);
  });

  it("l'administration d'une application exige la racine ; les services en plus sont permis", () => {
    let draft = setDraftRole(newDraft(APPS, "root"), APPS, "clara", "administrateur", "root");
    draft = toggleDraftOrganizations(draft, "clara", ["svc-a"], true);
    expect(validateDraft(draft, APPS, MANAGED)).toBeNull();
    draft = toggleDraftOrganizations(draft, "clara", ["root"], false);
    expect(validateDraft(draft, APPS, MANAGED)).toMatch(/exige l'accès sur la collectivité/);
  });

  it("un administrateur de service ne peut pas donner l'administration d'une application", () => {
    const managed = MANAGED.slice(1).map((o) => ({ ...o, depth: 0 }));
    const draft = {
      socle: { role: NO_ACCESS, organizationIds: [] },
      clara: { role: "administrateur", organizationIds: ["svc-a"] },
    };
    expect(validateDraft(draft, APPS, managed)).toMatch(/exige l'accès sur la collectivité/);
  });
});

describe("planSocleChanges", () => {
  const current = {
    role: "consultant",
    memberships: [
      { id: "m-1", organizationId: "root" },
      { id: "m-2", organizationId: "svc-a" },
    ],
  };

  it("ajoute et retire des organismes à rôle constant", () => {
    expect(planSocleChanges(current, { role: "consultant", organizationIds: ["root", "svc-b"] })).toEqual({
      deleteMembershipIds: ["m-2"],
      insertOrganizationIds: ["svc-b"],
      role: "consultant",
    });
  });

  it("change de rôle : supprime puis recrée (pas de policy UPDATE)", () => {
    expect(planSocleChanges(current, { role: "admin", organizationIds: ["root"] })).toEqual({
      deleteMembershipIds: ["m-1", "m-2"],
      insertOrganizationIds: ["root"],
      role: "admin",
    });
  });

  it("retire l'accès au Socle", () => {
    expect(planSocleChanges(current, { role: NO_ACCESS, organizationIds: ["root"] }).deleteMembershipIds).toEqual([
      "m-1",
      "m-2",
    ]);
    expect(planSocleChanges(null, { role: NO_ACCESS, organizationIds: ["root"] })).toEqual({
      deleteMembershipIds: [],
      insertOrganizationIds: [],
      role: NO_ACCESS,
    });
  });
});

describe("planAccessChanges", () => {
  const current = {
    clara: [
      { id: "x-1", organizationId: "root", roleCode: "gestionnaire", isActive: true },
      { id: "x-2", organizationId: "svc-a", roleCode: "gestionnaire", isActive: true },
    ],
    iris: [{ id: "x-3", organizationId: "root", roleCode: "acces", isActive: false }],
  };

  it("n'écrit rien quand rien ne change", () => {
    const draft = {
      clara: { role: "gestionnaire", organizationIds: ["root", "svc-a"] },
      iris: { role: NO_ACCESS, organizationIds: ["root"] },
    };
    expect(planAccessChanges(current, draft, APPS, "root")).toEqual([]);
  });

  it("retirer = désactiver en gardant le rôle, jamais supprimer", () => {
    expect(planAccessChanges(current, { clara: { role: NO_ACCESS, organizationIds: [] } }, APPS, "root")).toEqual([
      { kind: "update", accessId: "x-2", applicationId: "clara", organizationId: "svc-a", roleCode: "gestionnaire", isActive: false },
      { kind: "update", accessId: "x-1", applicationId: "clara", organizationId: "root", roleCode: "gestionnaire", isActive: false },
    ]);
  });

  it("décocher un service le désactive ; cocher un nouveau service crée l'accès", () => {
    const draft = { clara: { role: "gestionnaire", organizationIds: ["root", "svc-b"] } };
    expect(planAccessChanges(current, draft, APPS, "root")).toEqual([
      { kind: "update", accessId: "x-2", applicationId: "clara", organizationId: "svc-a", roleCode: "gestionnaire", isActive: false },
      { kind: "insert", applicationId: "clara", organizationId: "svc-b", roleCode: "gestionnaire" },
    ]);
  });

  it("rendre un accès retiré le réactive, avec le rôle choisi ; ignore le Socle", () => {
    const draft = {
      iris: { role: "acces", organizationIds: ["root"] },
      socle: { role: "admin", organizationIds: ["root"] },
    };
    expect(planAccessChanges(current, draft, APPS, "root")).toEqual([
      { kind: "update", accessId: "x-3", applicationId: "iris", organizationId: "root", roleCode: "acces", isActive: true },
    ]);
  });

  it("promotion administrateur : la racine d'abord, les services ensuite", () => {
    const draft = { clara: { role: "administrateur", organizationIds: ["svc-a", "root", "svc-b"] } };
    expect(planAccessChanges(current, draft, APPS, "root").map((c) => c.organizationId)).toEqual([
      "root",
      "svc-a",
      "svc-b",
    ]);
  });

  it("rétrogradation : les services d'abord, la racine ensuite", () => {
    const admin = {
      clara: [
        { id: "x-1", organizationId: "root", roleCode: "administrateur", isActive: true },
        { id: "x-2", organizationId: "svc-a", roleCode: "administrateur", isActive: true },
      ],
    };
    const draft = { clara: { role: "elu", organizationIds: ["root", "svc-a"] } };
    expect(planAccessChanges(admin, draft, APPS, "root").map((c) => c.organizationId)).toEqual(["svc-a", "root"]);
  });
});
