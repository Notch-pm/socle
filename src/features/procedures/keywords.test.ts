import { describe, it, expect } from "vitest";
import { parseKeywords } from "./keywords";

describe("parseKeywords", () => {
  it("découpe une saisie CSV simple", () => {
    expect(parseKeywords("permis, urbanisme, voirie")).toEqual([
      "permis",
      "urbanisme",
      "voirie",
    ]);
  });

  it("retire les espaces superflus autour de chaque mot-clé", () => {
    expect(parseKeywords("  permis  ,urbanisme ")).toEqual(["permis", "urbanisme"]);
  });

  it("ignore les entrées vides (virgules multiples, fin de chaîne)", () => {
    expect(parseKeywords("permis,,urbanisme,")).toEqual(["permis", "urbanisme"]);
  });

  it("dédoublonne en conservant l'ordre de première apparition", () => {
    expect(parseKeywords("a, b, a, c, b")).toEqual(["a", "b", "c"]);
  });

  it("renvoie un tableau vide pour une chaîne vide ou uniquement des séparateurs", () => {
    expect(parseKeywords("")).toEqual([]);
    expect(parseKeywords("   ")).toEqual([]);
    expect(parseKeywords(", ,")).toEqual([]);
  });
});
