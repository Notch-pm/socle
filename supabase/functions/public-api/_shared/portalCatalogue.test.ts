import { describe, expect, it } from "vitest";
import {
  offersByProcedure,
  orderTreeOrganizations,
  publishedCatalogue,
  type ProcedureBinding,
  type TreeOrganization,
} from "./portalCatalogue.ts";

const TODAY = "2026-09-06";

/** L'arbre d'une agglomération : la racine, deux mairies, un service sous l'une d'elles. */
const ACCM: TreeOrganization = { id: "accm", name: "ACCM", parent_id: null, status: "active" };
const ARLES: TreeOrganization = { id: "arles", name: "Mairie d'Arles", parent_id: "accm", status: "active" };
const CRAU: TreeOrganization = { id: "crau", name: "Mairie de Saint-Martin", parent_id: "accm", status: "active" };
const CABINET: TreeOrganization = { id: "cabinet", name: "Direction du Cabinet", parent_id: "crau", status: "active" };
const TREE = [CABINET, CRAU, ARLES, ACCM];

function procedure(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: "Démarche " + id,
    status: "production",
    type: "externe",
    communication_config: null,
    order_index: 0,
    ...over,
  };
}

function binding(procedure_id: string, organization_id: string, is_enabled = true): ProcedureBinding {
  return { procedure_id, organization_id, is_enabled };
}

describe("orderTreeOrganizations — l'ordre de l'arbre", () => {
  it("place le tenant d'abord, puis chaque niveau, frères par nom", () => {
    expect(orderTreeOrganizations(TREE).map((o) => o.id)).toEqual(["accm", "arles", "crau", "cabinet"]);
  });

  it("promeut en sommet une organisation dont le parent n'est pas dans la liste", () => {
    // Le tenant est une sous-organisation : son parent n'est pas dans son arbre.
    expect(orderTreeOrganizations([CABINET, CRAU]).map((o) => o.id)).toEqual(["crau", "cabinet"]);
  });

  it("classe les frères sans tenir compte de la casse ni des accents", () => {
    const orgs: TreeOrganization[] = [
      { id: "z", name: "Éguilles", parent_id: null, status: "active" },
      { id: "a", name: "arles", parent_id: null, status: "active" },
      { id: "b", name: "Beaucaire", parent_id: null, status: "active" },
    ];
    expect(orderTreeOrganizations(orgs).map((o) => o.id)).toEqual(["a", "b", "z"]);
  });
});

describe("offersByProcedure — qui propose quoi", () => {
  it("liste, pour chaque démarche, les organismes qui l'ont activée, dans l'ordre de l'arbre", () => {
    const offers = offersByProcedure(
      [binding("p1", "crau"), binding("p1", "accm"), binding("p2", "cabinet")],
      TREE,
    );
    expect(offers.get("p1")).toEqual([
      { id: "accm", name: "ACCM" },
      { id: "crau", name: "Mairie de Saint-Martin" },
    ]);
    expect(offers.get("p2")).toEqual([{ id: "cabinet", name: "Direction du Cabinet" }]);
  });

  it("ignore une liaison désactivée — l'activation est en opt-in", () => {
    const offers = offersByProcedure([binding("p1", "arles", false)], TREE);
    expect(offers.has("p1")).toBe(false);
  });

  it("ignore une organisation obsolète ou hors de l'arbre", () => {
    const obsolete: TreeOrganization = { id: "old", name: "Ancienne mairie", parent_id: "accm", status: "obsolete" };
    const offers = offersByProcedure(
      [binding("p1", "old"), binding("p1", "ailleurs"), binding("p1", "arles")],
      [...TREE, obsolete],
    );
    expect(offers.get("p1")).toEqual([{ id: "arles", name: "Mairie d'Arles" }]);
  });
});

describe("publishedCatalogue — les deux règles, ensemble", () => {
  it("sert une démarche activée par une seule mairie enfant, pas par la racine", () => {
    const result = publishedCatalogue({
      procedures: [procedure("p1")],
      bindings: [binding("p1", "arles")],
      organizations: TREE,
      today: TODAY,
    });
    expect(result).toHaveLength(1);
    expect(result[0].organizations).toEqual([{ id: "arles", name: "Mairie d'Arles" }]);
  });

  it("écarte une démarche que personne n'active, même parfaitement publiable", () => {
    const result = publishedCatalogue({
      procedures: [procedure("p1")],
      bindings: [],
      organizations: TREE,
      today: TODAY,
    });
    expect(result).toEqual([]);
  });

  it("écarte ce que le paramétrage ne publie pas, même activé partout", () => {
    const everywhere = TREE.flatMap((org) => ["draft", "interne", "hidden", "future"].map((id) => binding(id, org.id)));
    const result = publishedCatalogue({
      procedures: [
        procedure("draft", { status: "brouillon" }),
        procedure("interne", { type: "interne" }),
        procedure("hidden", { communication_config: { visibility: { portalVisible: false } } }),
        procedure("future", {
          communication_config: {
            visibility: { publicationPeriodEnabled: true, publicationStart: "2027-01-01", publicationEnd: null },
          },
        }),
      ],
      bindings: everywhere,
      organizations: TREE,
      today: TODAY,
    });
    expect(result).toEqual([]);
  });

  it("rend l'ordre d'affichage de la collectivité : order_index, puis le nom", () => {
    const result = publishedCatalogue({
      procedures: [
        procedure("c", { order_index: 2, name: "Zèbre" }),
        procedure("b", { order_index: 2, name: "Âne" }),
        procedure("a", { order_index: 1 }),
        procedure("d", { order_index: null }),
      ],
      bindings: ["a", "b", "c", "d"].map((id) => binding(id, "accm")),
      organizations: TREE,
      today: TODAY,
    });
    expect(result.map((entry) => entry.row.id)).toEqual(["a", "b", "c", "d"]);
  });
});
