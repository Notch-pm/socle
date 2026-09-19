import { describe, expect, it } from "vitest";
import { isAgentGuidanceEmpty, parseAgentGuidance, serializeAgentGuidance } from "./agentGuidance.ts";
// Le test, lui, peut lire `src/` : c'est la seule façon d'épingler que le
// miroir ne dérive pas (la fonction déployée, elle, n'en importe rien).
import { parseAgentGuidance as parseFront } from "../../../../src/features/organizations/agentGuidance.ts";

const STORED = {
  roleDescription: "Accueillir, **orienter**, instruire.",
  physicalReception: "Guichet ouvert de 8 h 30 à 12 h.",
  guidelines: [
    { title: "Confidentialité", text: "Aucun dossier lu à voix haute." },
    { title: " ", text: "" },
    { title: 4, text: "Sans titre" },
  ],
  faq: [{ question: "Q", answer: "R" }, { question: "", answer: "" }, "texte"],
  recommendedSources: [{ url: " https://www.service-public.fr ", description: "Fiches" }, {}],
  interne: "ne sort pas",
};

describe("parseAgentGuidance (miroir edge)", () => {
  it("lit exactement comme l'écran du Socle", () => {
    for (const raw of [STORED, null, undefined, [], "texte", { guidelines: "pas une liste" }]) {
      expect(parseAgentGuidance(raw)).toEqual(parseFront(raw));
    }
  });

  it("ne laisse sortir que les cinq rubriques du contrat", () => {
    expect(Object.keys(parseAgentGuidance(STORED))).toEqual([
      "roleDescription",
      "physicalReception",
      "guidelines",
      "faq",
      "recommendedSources",
    ]);
  });

  it("est idempotente après un aller-retour JSON — le consommateur re-parse", () => {
    const once = parseAgentGuidance(STORED);
    expect(parseAgentGuidance(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});

describe("serializeAgentGuidance", () => {
  it("sert les recommandations de la racine à une sous-organisation, source nommée", () => {
    const dto = serializeAgentGuidance("org-fille", {
      source_organization_id: "org-racine",
      guidance: STORED,
      updated_at: "2026-09-19T08:00:00+00:00",
    });
    expect(dto.organization_id).toBe("org-fille");
    expect(dto.source_organization_id).toBe("org-racine");
    expect(dto.configured).toBe(true);
    expect(dto.updated_at).toBe("2026-09-19T08:00:00+00:00");
    expect(dto.guidance.guidelines).toEqual([
      { title: "Confidentialité", text: "Aucun dossier lu à voix haute." },
      { title: "", text: "Sans titre" },
    ]);
    expect(JSON.stringify(dto)).not.toContain("ne sort pas");
  });

  it("rien d'écrit : 200 avec des rubriques VIDES, jamais absentes", () => {
    for (const row of [null, { source_organization_id: "org-racine", guidance: {}, updated_at: "2026-09-19" }]) {
      const dto = serializeAgentGuidance("org-racine", row);
      expect(dto.configured).toBe(false);
      // Une ligne vide n'est pas une source.
      expect(dto.source_organization_id).toBeNull();
      expect(dto.updated_at).toBeNull();
      expect(dto.guidance).toEqual({
        roleDescription: "",
        physicalReception: "",
        guidelines: [],
        faq: [],
        recommendedSources: [],
      });
    }
  });

  it("des blancs ne sont pas un texte", () => {
    expect(
      isAgentGuidanceEmpty(parseAgentGuidance({ roleDescription: "  ", physicalReception: "\n" })),
    ).toBe(true);
  });
});
