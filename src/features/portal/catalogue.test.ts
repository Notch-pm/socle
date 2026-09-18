import { describe, expect, it } from "vitest";
import type { Procedure } from "@/features/procedures/useProcedures";
import type { Organization } from "@/features/superadmin/organizations/orgTree";
import type { Audience } from "@/features/procedures/requesterFields";
import {
  CATALOGUE_VISIBILITY_LABELS,
  buildCatalogue,
  catalogueAudiences,
  catalogueOrganizations,
  catalogueVisibility,
  isoDay,
  offersByProcedure,
  portalTreeOrganizations,
  toCatalogueEntry,
  type CatalogueBinding,
} from "./catalogue";

const TODAY = "2026-09-05";

/** Une démarche prête, externe, visible, sans période : le cas ordinaire. */
function procedure(over: Partial<Procedure> = {}): Procedure {
  return {
    id: "p1",
    organization_id: "org",
    category_id: null,
    name: "Acte de naissance",
    type: "externe",
    status: "production",
    keywords: [],
    short_description: "En ligne, sous 3 jours.",
    user_description: null,
    user_communication: null,
    agent_description: null,
    input_duration_minutes: null,
    order_index: null,
    requester_config: null,
    form_schema: null,
    knowledge_base: null,
    communication_config: null,
    translations: null,
    created_at: null,
    updated_at: null,
    ...over,
  } as Procedure;
}

function organization(
  id: string,
  name: string,
  parent_id: string | null,
  status = "active",
  is_internal_service = false,
): Organization {
  return { id, name, parent_id, status, is_internal_service } as Organization;
}

/** Un organisme affiché sur une carte du portail. */
function offer(id: string, name: string, handlingOrganizationId: string | null = null) {
  return { id, name, handlingOrganizationId };
}

function binding(procedure_id: string, organization_id: string, is_enabled = true): CatalogueBinding {
  return { procedure_id, organization_id, is_enabled };
}

/** Un organisme qui propose la démarche : le cas ordinaire des tests de visibilité. */
const ACCM = { id: "accm", name: "ACCM", handlingOrganizationId: null };

describe("catalogueVisibility — les règles du Socle, dans leur ordre", () => {
  it("visible : prête, externe, sans période, proposée par au moins un organisme", () => {
    expect(catalogueVisibility(procedure(), TODAY, [ACCM])).toBe("visible");
    // Jamais passée par l'étape Communication : le défaut du contrat est VISIBLE.
    expect(catalogueVisibility(procedure({ communication_config: null }), TODAY, [ACCM])).toBe("visible");
  });

  it("brouillon passe avant tout le reste", () => {
    expect(catalogueVisibility(procedure({ status: "brouillon", type: "interne" }), TODAY, [])).toBe("brouillon");
    // Fail closed : un statut inattendu est un brouillon.
    expect(catalogueVisibility(procedure({ status: "bizarre" }), TODAY, [ACCM])).toBe("brouillon");
  });

  it("interne : pas de guichet en ligne", () => {
    expect(catalogueVisibility(procedure({ type: "interne" }), TODAY, [ACCM])).toBe("interne");
  });

  it("masquée : retirée du portail par le bloc communication", () => {
    const config = { visibility: { portalVisible: false } };
    expect(catalogueVisibility(procedure({ communication_config: config }), TODAY, [ACCM])).toBe("masquee");
  });

  it("hors période : bornes incluses, dans les deux sens", () => {
    const period = (publicationStart: string | null, publicationEnd: string | null) =>
      procedure({
        communication_config: {
          visibility: { publicationPeriodEnabled: true, publicationStart, publicationEnd },
        },
      });
    expect(catalogueVisibility(period("2026-09-06", null), TODAY, [ACCM])).toBe("hors-periode");
    expect(catalogueVisibility(period(null, "2026-09-04"), TODAY, [ACCM])).toBe("hors-periode");
    expect(catalogueVisibility(period("2026-09-05", "2026-09-05"), TODAY, [ACCM])).toBe("visible");
  });

  it("ignore les dates quand la période est désactivée", () => {
    // Le Socle CONSERVE les dates quand le commutateur est éteint : les
    // appliquer masquerait une démarche dont la période a été levée.
    const config = {
      visibility: { publicationPeriodEnabled: false, publicationStart: "2020-01-01", publicationEnd: "2020-12-31" },
    };
    expect(catalogueVisibility(procedure({ communication_config: config }), TODAY, [ACCM])).toBe("visible");
  });

  it("non activée : parfaitement publiable, mais aucun organisme ne la propose — la règle vient en dernier", () => {
    expect(catalogueVisibility(procedure(), TODAY, [])).toBe("non-activee");
    // Une raison de paramétrage prime : elle se corrige dans l'outil Démarches.
    expect(catalogueVisibility(procedure({ type: "interne" }), TODAY, [])).toBe("interne");
  });
});

describe("toCatalogueEntry / libellés", () => {
  it("ne porte de badge que sur les cas anormaux", () => {
    expect(CATALOGUE_VISIBILITY_LABELS.visible).toBeNull();
    for (const key of ["brouillon", "interne", "masquee", "hors-periode", "non-activee"] as const) {
      expect(CATALOGUE_VISIBILITY_LABELS[key]).toBeTruthy();
    }
  });

  it("recopie l'essentiel, les organismes, et rien du paramétrage d'instruction", () => {
    const entry = toCatalogueEntry(procedure({ form_schema: { secret: true } }), TODAY, [ACCM]);
    expect(entry).toEqual({
      id: "p1",
      name: "Acte de naissance",
      shortDescription: "En ligne, sous 3 jours.",
      visibility: "visible",
      organizations: [ACCM],
      // Jamais paramétrée : aucun public déclaré. Voir `enabledAudiences`.
      audiences: [],
    });
  });

  it("porte les publics déclarés, dans l'ordre du paramétrage", () => {
    const config = {
      association: { enabled: true, fields: {} },
      citoyen: { enabled: true, fields: {} },
      entreprise: { enabled: false, fields: {} },
    };
    const entry = toCatalogueEntry(procedure({ requester_config: config }), TODAY, [ACCM]);
    // L'ordre est celui d'`AUDIENCES`, pas celui des clés du JSON : deux
    // démarches paramétrées dans un ordre différent doivent se filtrer pareil.
    expect(entry.audiences).toEqual(["citoyen", "association"]);
  });
});

describe("catalogueAudiences — le filtre « Je suis… » a-t-il un sens ?", () => {
  const entry = (audiences: Audience[], id: string) => ({
    ...toCatalogueEntry(procedure({ id }), TODAY, [ACCM]),
    audiences,
  });

  it("réunit les publics des démarches affichées, sans doublon et dans l'ordre", () => {
    expect(
      catalogueAudiences([entry(["association"], "a"), entry(["citoyen", "association"], "b")]),
    ).toEqual(["citoyen", "association"]);
  });

  it("ne rend qu'un seul public quand toutes visent le même — le filtre ne s'affichera pas", () => {
    // Un filtre à un choix n'en est pas un : c'est ce que le canevas vérifie
    // avant d'afficher la pastille.
    expect(catalogueAudiences([entry(["citoyen"], "a"), entry(["citoyen"], "b")])).toEqual(["citoyen"]);
  });

  it("ignore les démarches sans public déclaré plutôt que d'inventer « tous publics »", () => {
    expect(catalogueAudiences([entry([], "a")])).toEqual([]);
  });
});

describe("portalTreeOrganizations — l'arbre que le portail sert", () => {
  const all = [
    organization("autre", "Autre client", null),
    organization("cabinet", "Direction du Cabinet", "crau"),
    organization("crau", "Mairie de Saint-Martin", "accm"),
    organization("arles", "Mairie d'Arles", "accm"),
    organization("old", "Ancienne mairie", "accm", "obsolete"),
    organization("accm", "ACCM", null),
  ];

  it("garde la racine et TOUTE sa descendance, dans l'ordre de l'arbre", () => {
    // L'obsolète y figure : c'est `offersByProcedure` qui l'écarte, pour ne
    // pas couper la chaîne des parents sous elle.
    expect(portalTreeOrganizations(all, "accm").map((o) => o.id)).toEqual([
      "accm",
      "old",
      "arles",
      "crau",
      "cabinet",
    ]);
  });

  it("ne mélange pas les clients : une autre racine n'y figure pas", () => {
    expect(portalTreeOrganizations(all, "accm").map((o) => o.id)).not.toContain("autre");
  });
});

describe("offersByProcedure / buildCatalogue — qui propose quoi", () => {
  const tree = [
    organization("accm", "ACCM", null),
    organization("arles", "Mairie d'Arles", "accm"),
    organization("crau", "Mairie de Saint-Martin", "accm"),
  ];

  it("liste les organismes de chaque démarche dans l'ordre de l'arbre, sans les liaisons désactivées", () => {
    const offers = offersByProcedure(
      [binding("p1", "crau"), binding("p1", "accm"), binding("p1", "arles", false), binding("p2", "ailleurs")],
      tree,
    );
    expect(offers.get("p1")).toEqual([offer("accm", "ACCM"), offer("crau", "Mairie de Saint-Martin")]);
    // Une organisation hors de l'arbre ne propose rien sur ce portail.
    expect(offers.has("p2")).toBe(false);
  });

  it("marque « non activée » la démarche que personne ne propose, et garde l'ordre du catalogue", () => {
    const catalogue = buildCatalogue(
      [procedure({ id: "p1" }), procedure({ id: "p2", name: "Voirie" })],
      [binding("p2", "arles")],
      tree,
      TODAY,
    );
    expect(catalogue.map((entry) => [entry.id, entry.visibility])).toEqual([
      ["p1", "non-activee"],
      ["p2", "visible"],
    ]);
    expect(catalogue[1].organizations).toEqual([offer("arles", "Mairie d'Arles")]);
  });

  it("un service interne s'efface derrière sa mairie, qui instruit par lui", () => {
    const tree = [
      organization("accm", "ACCM", null),
      organization("crau", "Mairie de Saint-Martin", "accm"),
      organization("ec", "État civil", "crau", "active", true),
    ];
    const offers = offersByProcedure([binding("p1", "ec")], tree);
    expect(offers.get("p1")).toEqual([offer("crau", "Mairie de Saint-Martin", "ec")]);
  });

  it("ne nomme la mairie qu'une fois quand elle active aussi la démarche", () => {
    const tree = [
      organization("accm", "ACCM", null),
      organization("crau", "Mairie de Saint-Martin", "accm"),
      organization("ec", "État civil", "crau", "active", true),
    ];
    const offers = offersByProcedure([binding("p1", "ec"), binding("p1", "crau")], tree);
    expect(offers.get("p1")).toEqual([offer("crau", "Mairie de Saint-Martin")]);
  });

  it("un service interne dont le porteur est obsolète ne propose rien", () => {
    // Remonter d'un cran de plus rattacherait la démarche à l'agglomération,
    // qui ne l'instruit pas.
    const tree = [
      organization("accm", "ACCM", null),
      organization("crau", "Mairie de Saint-Martin", "accm", "obsolete"),
      organization("ec", "État civil", "crau", "active", true),
    ];
    expect(offersByProcedure([binding("p1", "ec")], tree).has("p1")).toBe(false);
  });

  it("catalogueOrganizations : l'union dédoublonnée, dans l'ordre de première apparition", () => {
    const catalogue = buildCatalogue(
      [procedure({ id: "p1" }), procedure({ id: "p2", name: "Voirie" })],
      [binding("p1", "crau"), binding("p2", "crau"), binding("p2", "accm")],
      tree,
      TODAY,
    );
    expect(catalogueOrganizations(catalogue).map((o) => o.id)).toEqual(["crau", "accm"]);
  });
});

describe("isoDay", () => {
  it("formate le jour civil local", () => {
    expect(isoDay(new Date(2026, 8, 5, 23, 59))).toBe("2026-09-05");
    expect(isoDay(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});
