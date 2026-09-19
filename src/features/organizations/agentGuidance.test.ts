import { describe, it, expect } from "vitest";
import {
  cleanAgentGuidance,
  defaultAgentGuidance,
  isAgentGuidanceEmpty,
  parseAgentGuidance,
} from "./agentGuidance";

describe("parseAgentGuidance — robustesse", () => {
  it("rend des recommandations vierges pour une entrée nulle, un tableau ou un scalaire", () => {
    const empty = defaultAgentGuidance();
    expect(parseAgentGuidance(null)).toEqual(empty);
    expect(parseAgentGuidance(undefined)).toEqual(empty);
    expect(parseAgentGuidance([])).toEqual(empty);
    expect(parseAgentGuidance("texte")).toEqual(empty);
  });

  it("complète les champs manquants et ignore les clés inconnues", () => {
    const guidance = parseAgentGuidance({ roleDescription: "Accueillir", extra: 1 });
    expect(guidance.roleDescription).toBe("Accueillir");
    expect(guidance.physicalReception).toBe("");
    expect(guidance.guidelines).toEqual([]);
    expect(guidance).not.toHaveProperty("extra");
  });

  it("corrige les types et écarte les lignes entièrement vides", () => {
    const guidance = parseAgentGuidance({
      roleDescription: 12,
      guidelines: [
        { title: "Confidentialité", text: "Ne jamais lire un dossier à voix haute." },
        { title: "  ", text: "" },
        "pas un objet",
        { title: 3, text: "Texte sans titre" },
      ],
      faq: [{ question: "Q", answer: "R" }, { question: "", answer: " " }],
      recommendedSources: [{ url: " https://www.service-public.fr ", description: "Fiches" }, {}],
    });
    expect(guidance.roleDescription).toBe("");
    expect(guidance.guidelines).toEqual([
      { title: "Confidentialité", text: "Ne jamais lire un dossier à voix haute." },
      { title: "", text: "Texte sans titre" },
    ]);
    expect(guidance.faq).toEqual([{ question: "Q", answer: "R" }]);
    expect(guidance.recommendedSources).toEqual([
      { url: "https://www.service-public.fr", description: "Fiches" },
    ]);
  });

  it("garde l'ordre de saisie des consignes (c'est un ordre de lecture)", () => {
    const guidance = parseAgentGuidance({
      guidelines: [
        { title: "B", text: "2" },
        { title: "A", text: "1" },
      ],
    });
    expect(guidance.guidelines.map((g) => g.title)).toEqual(["B", "A"]);
  });

  it("est idempotente, y compris après un aller-retour JSON", () => {
    const once = parseAgentGuidance({
      roleDescription: "Rôle",
      guidelines: [{ title: "T", text: "X" }],
      faq: [{ question: "Q", answer: "R" }],
      recommendedSources: [{ url: "https://a.fr", description: "" }],
    });
    expect(parseAgentGuidance(once)).toEqual(once);
    expect(parseAgentGuidance(JSON.parse(JSON.stringify(once)))).toEqual(once);
    expect(cleanAgentGuidance(once)).toEqual(once);
  });
});

describe("isAgentGuidanceEmpty", () => {
  it("des blancs ne sont pas un texte", () => {
    expect(isAgentGuidanceEmpty(defaultAgentGuidance())).toBe(true);
    expect(
      isAgentGuidanceEmpty({ ...defaultAgentGuidance(), roleDescription: "  \n", physicalReception: " " }),
    ).toBe(true);
  });

  it("une seule rubrique remplie suffit", () => {
    expect(
      isAgentGuidanceEmpty({ ...defaultAgentGuidance(), recommendedSources: [{ url: "https://a.fr", description: "" }] }),
    ).toBe(false);
    expect(isAgentGuidanceEmpty({ ...defaultAgentGuidance(), physicalReception: "Accueil" })).toBe(false);
  });
});
