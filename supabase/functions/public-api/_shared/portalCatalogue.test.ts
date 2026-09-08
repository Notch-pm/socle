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
function org(
  id: string,
  name: string,
  parent_id: string | null,
  over: Partial<TreeOrganization> = {},
): TreeOrganization {
  return { id, name, parent_id, status: "active", is_internal_service: false, ...over };
}

const ACCM = org("accm", "ACCM", null);
const ARLES = org("arles", "Mairie d'Arles", "accm");
const CRAU = org("crau", "Mairie de Saint-Martin", "accm");
const CABINET = org("cabinet", "Direction du Cabinet", "crau");
const TREE = [CABINET, CRAU, ARLES, ACCM];

/** Le même arbre, mais la Direction du Cabinet est un service interne. */
const CABINET_INTERNE = org("cabinet", "Direction du Cabinet", "crau", { is_internal_service: true });
const TREE_AVEC_SERVICE = [CABINET_INTERNE, CRAU, ARLES, ACCM];

/** Un organisme affiché sur une carte du portail. */
function offer(id: string, name: string, handlingOrganizationId: string | null = null) {
  return { id, name, handlingOrganizationId };
}

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
    expect(offers.get("p1")).toEqual([offer("accm", "ACCM"), offer("crau", "Mairie de Saint-Martin")]);
    // Un service ORDINAIRE se nomme lui-même : c'est un guichet comme un autre.
    expect(offers.get("p2")).toEqual([offer("cabinet", "Direction du Cabinet")]);
  });

  it("ignore une liaison désactivée — l'activation est en opt-in", () => {
    const offers = offersByProcedure([binding("p1", "arles", false)], TREE);
    expect(offers.has("p1")).toBe(false);
  });

  it("ignore une organisation obsolète ou hors de l'arbre", () => {
    const obsolete = org("old", "Ancienne mairie", "accm", { status: "obsolete" });
    const offers = offersByProcedure(
      [binding("p1", "old"), binding("p1", "ailleurs"), binding("p1", "arles")],
      [...TREE, obsolete],
    );
    expect(offers.get("p1")).toEqual([offer("arles", "Mairie d'Arles")]);
  });
});

describe("offersByProcedure — les services internes s'effacent derrière leur porteur", () => {
  it("nomme la mairie, et dit quel service instruit", () => {
    const offers = offersByProcedure([binding("p1", "cabinet")], TREE_AVEC_SERVICE);
    expect(offers.get("p1")).toEqual([offer("crau", "Mairie de Saint-Martin", "cabinet")]);
  });

  it("remonte une chaîne de services internes jusqu'au premier qui n'en est pas un", () => {
    const bureau = org("bureau", "Bureau des actes", "cabinet", { is_internal_service: true });
    const offers = offersByProcedure([binding("p1", "bureau")], [...TREE_AVEC_SERVICE, bureau]);
    expect(offers.get("p1")).toEqual([offer("crau", "Mairie de Saint-Martin", "bureau")]);
  });

  it("ne nomme la mairie qu'une fois, quand elle active aussi la démarche", () => {
    // Le paramétrage l'interdit (un seul instructeur par porteur), mais un
    // doublon rendrait deux cartes identiques au portail.
    const offers = offersByProcedure(
      [binding("p1", "cabinet"), binding("p1", "crau")],
      TREE_AVEC_SERVICE,
    );
    // La mairie l'active en propre : c'est elle qui instruit, pas le service.
    expect(offers.get("p1")).toEqual([offer("crau", "Mairie de Saint-Martin")]);
  });

  it("n'apparaît nulle part si son porteur est obsolète", () => {
    // Remonter d'un cran de plus rattacherait la démarche à l'agglomération,
    // qui ne l'instruit pas.
    const tree = [CABINET_INTERNE, org("crau", "Mairie de Saint-Martin", "accm", { status: "obsolete" }), ARLES, ACCM];
    const offers = offersByProcedure([binding("p1", "cabinet")], tree);
    expect(offers.has("p1")).toBe(false);
  });

  it("un tenant marqué interne reste lui-même : la remontée ne sort pas de l'arbre servi", () => {
    // L'arbre servi descend du tenant (`org_subtree_ids`) : son parent n'y est
    // pas, et c'est son nom que le portail doit porter.
    const tenant = org("crau", "Mairie de Saint-Martin", "accm", { is_internal_service: true });
    const offers = offersByProcedure([binding("p1", "crau")], [tenant, CABINET_INTERNE]);
    expect(offers.get("p1")).toEqual([offer("crau", "Mairie de Saint-Martin")]);
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
    expect(result[0].organizations).toEqual([offer("arles", "Mairie d'Arles")]);
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
