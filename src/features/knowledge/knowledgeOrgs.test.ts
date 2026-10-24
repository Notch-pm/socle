import { describe, it, expect } from "vitest";
import { knowledgeOrgEntries, selectedKnowledgeOrg } from "./knowledgeOrgs";
import type { Organization } from "@/features/superadmin/organizations/orgTree";

const org = (id: string, name: string, parent_id: string | null = null) =>
  ({ id, name, parent_id }) as Organization;

const ORGS = [
  org("urba", "Service urbanisme", "ville"),
  org("ville", "Ville de Cahors"),
  org("annexe", "Mairie annexe", "ville"),
  org("guichet", "Guichet", "annexe"),
];

describe("knowledgeOrgEntries", () => {
  it("suit l'ordre de l'arbre : chaque organisme suivi des siens, frères par nom", () => {
    expect(knowledgeOrgEntries(ORGS).map((e) => [e.organization.id, e.depth])).toEqual([
      ["ville", 1],
      ["annexe", 2],
      ["guichet", 3],
      ["urba", 2],
    ]);
  });

  it("rend des organisations sans les champs de l'arbre", () => {
    const [first] = knowledgeOrgEntries(ORGS);
    expect(first.organization).not.toHaveProperty("children");
    expect(first.organization).not.toHaveProperty("depth");
  });

  it("promeut au sommet un organisme dont le parent est écarté", () => {
    // Les informations usagers écartent les services internes : leurs enfants
    // restent dans la liste.
    const entries = knowledgeOrgEntries(ORGS.filter((o) => o.id !== "annexe"));
    expect(entries.find((e) => e.organization.id === "guichet")?.depth).toBe(1);
  });
});

describe("selectedKnowledgeOrg", () => {
  const entries = knowledgeOrgEntries(ORGS);

  it("prend l'organisme demandé par l'URL", () => {
    expect(selectedKnowledgeOrg(entries, "urba")?.id).toBe("urba");
  });

  it("retombe sur le premier quand l'identifiant est inconnu ou absent", () => {
    expect(selectedKnowledgeOrg(entries, "disparu")?.id).toBe("ville");
    expect(selectedKnowledgeOrg(entries, null)?.id).toBe("ville");
  });

  it("ne rend rien sur une liste vide", () => {
    expect(selectedKnowledgeOrg([], "ville")).toBeNull();
  });
});
