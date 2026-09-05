import { describe, expect, it } from "vitest";
import type { Procedure } from "@/features/procedures/useProcedures";
import { CATALOGUE_VISIBILITY_LABELS, catalogueVisibility, isoDay, toCatalogueEntry } from "./catalogue";

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

describe("catalogueVisibility — les règles du Socle, dans leur ordre", () => {
  it("visible : prête, externe, sans période", () => {
    expect(catalogueVisibility(procedure(), TODAY)).toBe("visible");
    // Jamais passée par l'étape Communication : le défaut du contrat est VISIBLE.
    expect(catalogueVisibility(procedure({ communication_config: null }), TODAY)).toBe("visible");
  });

  it("brouillon passe avant tout le reste", () => {
    expect(catalogueVisibility(procedure({ status: "brouillon", type: "interne" }), TODAY)).toBe("brouillon");
    // Fail closed : un statut inattendu est un brouillon.
    expect(catalogueVisibility(procedure({ status: "bizarre" }), TODAY)).toBe("brouillon");
  });

  it("interne : pas de guichet en ligne", () => {
    expect(catalogueVisibility(procedure({ type: "interne" }), TODAY)).toBe("interne");
  });

  it("masquée : retirée du portail par le bloc communication", () => {
    const config = { visibility: { portalVisible: false } };
    expect(catalogueVisibility(procedure({ communication_config: config }), TODAY)).toBe("masquee");
  });

  it("hors période : bornes incluses, dans les deux sens", () => {
    const period = (publicationStart: string | null, publicationEnd: string | null) =>
      procedure({
        communication_config: {
          visibility: { publicationPeriodEnabled: true, publicationStart, publicationEnd },
        },
      });
    expect(catalogueVisibility(period("2026-09-06", null), TODAY)).toBe("hors-periode");
    expect(catalogueVisibility(period(null, "2026-09-04"), TODAY)).toBe("hors-periode");
    expect(catalogueVisibility(period("2026-09-05", "2026-09-05"), TODAY)).toBe("visible");
  });

  it("ignore les dates quand la période est désactivée", () => {
    // Le Socle CONSERVE les dates quand le commutateur est éteint : les
    // appliquer masquerait une démarche dont la période a été levée.
    const config = {
      visibility: { publicationPeriodEnabled: false, publicationStart: "2020-01-01", publicationEnd: "2020-12-31" },
    };
    expect(catalogueVisibility(procedure({ communication_config: config }), TODAY)).toBe("visible");
  });
});

describe("toCatalogueEntry / libellés", () => {
  it("ne porte de badge que sur les cas anormaux", () => {
    expect(CATALOGUE_VISIBILITY_LABELS.visible).toBeNull();
    for (const key of ["brouillon", "interne", "masquee", "hors-periode"] as const) {
      expect(CATALOGUE_VISIBILITY_LABELS[key]).toBeTruthy();
    }
  });

  it("recopie l'essentiel, et rien du paramétrage d'instruction", () => {
    const entry = toCatalogueEntry(procedure({ form_schema: { secret: true } }), TODAY);
    expect(entry).toEqual({
      id: "p1",
      name: "Acte de naissance",
      shortDescription: "En ligne, sous 3 jours.",
      visibility: "visible",
    });
  });
});

describe("isoDay", () => {
  it("formate le jour civil local", () => {
    expect(isoDay(new Date(2026, 8, 5, 23, 59))).toBe("2026-09-05");
    expect(isoDay(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});
