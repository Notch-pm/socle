import { describe, it, expect } from "vitest";
import {
  defaultKnowledgeBase,
  parseKnowledgeBase,
  cleanKnowledgeBase,
  type KnowledgeBase,
} from "./knowledgeBase";

describe("parseKnowledgeBase — robustesse", () => {
  it("renvoie une base vierge complète pour une entrée nulle ou non-objet", () => {
    const empty = defaultKnowledgeBase();
    expect(parseKnowledgeBase(null)).toEqual(empty);
    expect(parseKnowledgeBase(undefined)).toEqual(empty);
    expect(parseKnowledgeBase("nope")).toEqual(empty);
    expect(parseKnowledgeBase(42)).toEqual(empty);
  });

  it("complète les champs manquants et ignore les clés inconnues", () => {
    const kb = parseKnowledgeBase({ agentHelpText: "Bonjour", extra: "ignore" });
    expect(kb.agentHelpText).toBe("Bonjour");
    expect(kb.proceduresText).toBe("");
    expect(kb.agentLinks).toEqual([]);
    expect(kb.faq).toEqual([]);
    expect(kb.guardrails).toEqual([]);
    expect(kb).not.toHaveProperty("extra");
  });

  it("coerce les types invalides vers des valeurs sûres", () => {
    const kb = parseKnowledgeBase({
      agentHelpText: 123,
      proceduresText: null,
      agentLinks: "pas un tableau",
      faq: { not: "array" },
      guardrails: [1, "valide", null, "  "],
    });
    expect(kb.agentHelpText).toBe("");
    expect(kb.proceduresText).toBe("");
    expect(kb.agentLinks).toEqual([]);
    expect(kb.faq).toEqual([]);
    // Seules les chaînes non vides sont conservées.
    expect(kb.guardrails).toEqual(["valide"]);
  });

  it("nettoie les liens : garde ceux ayant une URL ou une description, retire les vides", () => {
    const kb = parseKnowledgeBase({
      agentLinks: [
        { url: " https://a.fr ", description: "Site A" },
        { url: "", description: "  " },
        { description: "Sans URL" },
        "invalide",
        { url: "https://b.fr" },
      ],
    });
    expect(kb.agentLinks).toEqual([
      { url: "https://a.fr", description: "Site A" },
      { url: "", description: "Sans URL" },
      { url: "https://b.fr", description: "" },
    ]);
  });

  it("nettoie la FAQ : garde une entrée dès qu'une question ou une réponse est renseignée", () => {
    const kb = parseKnowledgeBase({
      faq: [
        { question: "Q1", answer: "R1" },
        { question: "", answer: "" },
        { question: "Sans réponse" },
      ],
    });
    expect(kb.faq).toEqual([
      { question: "Q1", answer: "R1" },
      { question: "Sans réponse", answer: "" },
    ]);
  });

  it("ne garde que les documents ayant un chemin, avec un nom par défaut", () => {
    const kb = parseKnowledgeBase({
      agentDocuments: [
        { path: "org/proc/a.pdf", name: "Notice.pdf" },
        { path: "org/proc/b.pdf" },
        { name: "sans chemin" },
        { path: "  " },
      ],
    });
    expect(kb.agentDocuments).toEqual([
      { path: "org/proc/a.pdf", name: "Notice.pdf" },
      { path: "org/proc/b.pdf", name: "org/proc/b.pdf" },
    ]);
  });
});

describe("cleanKnowledgeBase — normalisation avant persistance", () => {
  it("retire les lignes de liste laissées vides par l'utilisateur", () => {
    const dirty: KnowledgeBase = {
      ...defaultKnowledgeBase(),
      agentLinks: [
        { url: "", description: "" },
        { url: "https://ok.fr", description: "OK" },
      ],
      faq: [{ question: "", answer: "" }],
      guardrails: ["", "règle"],
    };
    const clean = cleanKnowledgeBase(dirty);
    expect(clean.agentLinks).toEqual([{ url: "https://ok.fr", description: "OK" }]);
    expect(clean.faq).toEqual([]);
    expect(clean.guardrails).toEqual(["règle"]);
  });

  it("est idempotent", () => {
    const once = cleanKnowledgeBase({
      ...defaultKnowledgeBase(),
      agentHelpText: "x",
      guardrails: ["a", "  ", "b"],
    });
    expect(cleanKnowledgeBase(once)).toEqual(once);
  });
});
