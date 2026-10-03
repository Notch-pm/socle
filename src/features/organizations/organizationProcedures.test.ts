import { describe, it, expect } from "vitest";
import {
  bearerGroupSiblings,
  buildEnabledProcedureIds,
  groupProceduresByCategory,
  offersHeldBySiblings,
  procedureIdsToEnable,
  UNCATEGORIZED_LABEL,
  type BearerGroupOrganization,
  type OrganizationProcedure,
} from "./organizationProcedures";

/** Fabrique une liaison minimale mais complète pour les tests. */
function binding(
  procedure_id: string | null,
  is_enabled: boolean | null,
): OrganizationProcedure {
  return {
    id: `${procedure_id}-binding`,
    organization_id: "org-1",
    procedure_id,
    is_enabled,
    custom_name: null,
    custom_order: null,
    metadata: null,
  };
}

describe("buildEnabledProcedureIds", () => {
  it("ne garde que les liaisons is_enabled === true", () => {
    const set = buildEnabledProcedureIds([
      binding("p1", true),
      binding("p2", false),
      binding("p3", null),
      binding("p4", true),
    ]);
    expect([...set].sort()).toEqual(["p1", "p4"]);
  });

  it("ignore les liaisons sans procedure_id", () => {
    const set = buildEnabledProcedureIds([binding(null, true)]);
    expect(set.size).toBe(0);
  });

  it("renvoie un ensemble vide pour une liste vide", () => {
    expect(buildEnabledProcedureIds([]).size).toBe(0);
  });
});

/** Une agglo, une mairie, deux services internes sous la mairie. */
function orgOf(
  id: string,
  name: string,
  parent_id: string | null,
  is_internal_service = false,
): BearerGroupOrganization {
  return { id, name, parent_id, is_internal_service };
}

const ARBRE = [
  orgOf("accm", "ACCM", null),
  orgOf("crau", "Mairie de Saint-Martin", "accm"),
  orgOf("ec", "État civil", "crau", true),
  orgOf("urba", "Urbanisme", "crau", true),
  orgOf("arles", "Mairie d'Arles", "accm"),
];

describe("bearerGroupSiblings — qui instruit au nom du même porteur", () => {
  it("depuis un service interne : sa mairie et les services frères", () => {
    expect(bearerGroupSiblings(ARBRE, "ec").map((o) => o.id).sort()).toEqual(["crau", "urba"]);
  });

  it("depuis la mairie : ses propres services internes", () => {
    // La règle vaut dans les deux sens — la mairie ne peut pas doubler l'un
    // de ses services, pas plus que l'inverse.
    expect(bearerGroupSiblings(ARBRE, "crau").map((o) => o.id).sort()).toEqual(["ec", "urba"]);
  });

  it("une mairie sans service interne n'a personne avec qui se cogner", () => {
    expect(bearerGroupSiblings(ARBRE, "arles")).toEqual([]);
  });

  it("ne franchit pas les porteurs : les services d'une autre mairie ne comptent pas", () => {
    const autre = [...ARBRE, orgOf("ec-arles", "État civil", "arles", true)];
    expect(bearerGroupSiblings(autre, "ec").map((o) => o.id).sort()).toEqual(["crau", "urba"]);
  });

  it("renvoie une liste vide pour une organisation absente", () => {
    expect(bearerGroupSiblings(ARBRE, "inconnue")).toEqual([]);
  });
});

describe("offersHeldBySiblings — ce qui est déjà pris ailleurs dans le groupe", () => {
  const siblings = [orgOf("ec", "État civil", "crau", true), orgOf("urba", "Urbanisme", "crau", true)];
  const held = (organization_id: string | null, procedure_id: string | null, is_enabled: boolean | null) => ({
    organization_id,
    procedure_id,
    is_enabled,
  });

  it("nomme l'organisation qui porte déjà la démarche", () => {
    const map = offersHeldBySiblings([held("ec", "p1", true)], siblings);
    expect(map.get("p1")).toBe("État civil");
  });

  it("ignore une liaison désactivée : elle ne prend rien", () => {
    const map = offersHeldBySiblings([held("ec", "p1", false), held("urba", "p2", null)], siblings);
    expect(map.size).toBe(0);
  });

  it("ignore une organisation hors du groupe", () => {
    // Le RLS peut très bien n'avoir rien renvoyé pour elle : on ne nomme que
    // ce qu'on a effectivement sous la main.
    const map = offersHeldBySiblings([held("ailleurs", "p1", true)], siblings);
    expect(map.size).toBe(0);
  });

  it("ignore les liaisons sans identifiant", () => {
    expect(offersHeldBySiblings([held(null, "p1", true), held("ec", null, true)], siblings).size).toBe(0);
  });
});

describe("groupProceduresByCategory — l'écran « Démarches activées »", () => {
  const categories = [
    { id: "c-urba", name: "urbanisme (Arpège)" },
    { id: "c-etat", name: "Actes d'état civil (Arpège)" },
  ];

  it("catégories par ordre alphabétique (casse ignorée), « Sans catégorie » en dernier", () => {
    const groups = groupProceduresByCategory(
      [
        { id: "p1", category_id: "c-urba" },
        { id: "p2", category_id: null },
        { id: "p3", category_id: "c-etat" },
        { id: "p4", category_id: "c-urba" },
      ],
      categories,
    );
    expect(groups.map((g) => [g.name, g.procedures.map((p) => p.id)])).toEqual([
      ["Actes d'état civil (Arpège)", ["p3"]],
      ["urbanisme (Arpège)", ["p1", "p4"]],
      [UNCATEGORIZED_LABEL, ["p2"]],
    ]);
  });

  it("une catégorie inconnue rejoint « Sans catégorie » au lieu de disparaître", () => {
    const groups = groupProceduresByCategory([{ id: "p1", category_id: "c-supprimee" }], categories);
    expect(groups).toEqual([{ categoryId: null, name: UNCATEGORIZED_LABEL, procedures: [{ id: "p1", category_id: "c-supprimee" }] }]);
  });
});

describe("procedureIdsToEnable — ce que « Tout activer » active", () => {
  it("écarte les démarches déjà activées ici et celles tenues par le groupe", () => {
    expect(
      procedureIdsToEnable(
        [{ id: "a" }, { id: "b" }, { id: "c" }],
        new Set(["a"]),
        new Map([["c", "Services techniques"]]),
      ),
    ).toEqual(["b"]);
  });
});
