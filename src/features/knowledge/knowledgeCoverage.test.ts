import { describe, it, expect } from "vitest";
import { coverageLabel, isCoverageComplete, knowledgeCoverage } from "./knowledgeCoverage";

describe("knowledgeCoverage", () => {
  it("rend quatre zéros pour une base absente ou illisible", () => {
    const zero = { agentHelp: 0, faq: 0, aiSources: 0, guardrails: 0 };
    expect(knowledgeCoverage(null)).toEqual(zero);
    expect(knowledgeCoverage("pas un objet")).toEqual(zero);
  });

  it("regroupe les huit champs en quatre colonnes", () => {
    expect(
      knowledgeCoverage({
        agentHelpText: "Vérifier la pièce d'identité.",
        proceduresText: "",
        agentDocuments: [{ path: "racine/a.pdf", name: "a.pdf" }],
        agentLinks: [{ url: "https://service-public.fr", description: "" }],
        faq: [{ question: "Délai ?", answer: "Quinze jours." }],
        aiSources: [{ url: "https://legifrance.gouv.fr", description: "Code civil" }],
        trainingDocuments: [{ path: "racine/b.md", name: "b.md" }],
        guardrails: ["Ne jamais promettre une date."],
      }),
    ).toEqual({ agentHelp: 3, faq: 1, aiSources: 2, guardrails: 1 });
  });

  it("ne compte ni le blanc ni les entrées ébauchées puis abandonnées", () => {
    expect(
      knowledgeCoverage({
        agentHelpText: "   ",
        faq: [{ question: " ", answer: "" }],
        aiSources: [{ url: "", description: "" }],
        guardrails: ["  "],
      }),
    ).toEqual({ agentHelp: 0, faq: 0, aiSources: 0, guardrails: 0 });
  });
});

describe("isCoverageComplete", () => {
  it("exige les quatre colonnes", () => {
    expect(isCoverageComplete({ agentHelp: 1, faq: 2, aiSources: 1, guardrails: 1 })).toBe(true);
    expect(isCoverageComplete({ agentHelp: 1, faq: 2, aiSources: 1, guardrails: 0 })).toBe(false);
  });
});

describe("coverageLabel", () => {
  it("dit « Vide » sans rien, et accorde le nombre", () => {
    expect(coverageLabel("faq", 0)).toBe("Vide");
    expect(coverageLabel("faq", 1)).toBe("1 question");
    expect(coverageLabel("faq", 3)).toBe("3 questions");
    expect(coverageLabel("guardrails", 2)).toBe("2 garde-fous");
    // L'aide à l'agent mêle textes, documents et liens : un nombre n'y voudrait rien dire.
    expect(coverageLabel("agentHelp", 4)).toBe("Rédigée");
  });
});
