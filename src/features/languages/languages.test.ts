import { describe, it, expect } from "vitest";
import {
  FRANCE_LANGUAGES,
  LANGUAGES,
  LANGUAGE_CODE_RE,
  PIVOT_LANGUAGE,
  WORLD_LANGUAGES,
  enabledLanguagesForWrite,
  languageByCode,
  languageLabel,
  parseEnabledLanguages,
  sortLanguageCodes,
  sortedLanguages,
  translatableLanguages,
} from "./languages";

describe("catalogue", () => {
  it("n'a aucun code en double", () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("n'a que des codes de la forme attendue par la base", () => {
    for (const language of LANGUAGES) {
      expect(LANGUAGE_CODE_RE.test(language.code), language.code).toBe(true);
    }
  });

  it("porte un libellé français non vide pour chaque langue", () => {
    for (const language of LANGUAGES) {
      expect(language.label.trim(), language.code).not.toBe("");
    }
  });

  it("contient le français, langue pivot, parmi les langues mondiales", () => {
    expect(WORLD_LANGUAGES.some((language) => language.code === PIVOT_LANGUAGE)).toBe(true);
  });

  it("propose les langues régionales de France attendues", () => {
    const codes = FRANCE_LANGUAGES.map((language) => language.code);
    // Un échantillon représentatif : métropole, Antilles-Guyane, océan Indien,
    // Pacifique. La liste complète vit dans le module.
    expect(codes).toEqual(
      expect.arrayContaining(["br", "eu", "oc", "co", "gsw", "gcr", "rcf", "swb", "ty", "dhv"]),
    );
  });

  it("ne mélange pas les deux groupes", () => {
    expect(WORLD_LANGUAGES.every((language) => language.group === "monde")).toBe(true);
    expect(FRANCE_LANGUAGES.every((language) => language.group === "france")).toBe(true);
  });
});

describe("languageLabel", () => {
  it("rend le libellé français d'un code connu", () => {
    expect(languageLabel("br")).toBe("Breton");
    expect(languageByCode("br")?.group).toBe("france");
  });

  it("rend le code lui-même quand il est inconnu", () => {
    // Un code posé par SQL ou par une version plus récente du catalogue reste
    // lisible à l'écran plutôt que de disparaître.
    expect(languageLabel("xx-inconnu")).toBe("xx-inconnu");
    expect(languageByCode("xx-inconnu")).toBeUndefined();
  });
});

describe("sortedLanguages", () => {
  it("classe un groupe par libellé, accents ignorés", () => {
    const labels = sortedLanguages("france").map((language) => language.label);
    expect(labels[0]).toBe("Ajië");
    expect(labels).toContain("Breton");
    expect([...labels].sort((a, b) => a.localeCompare(b, "fr"))).toEqual(labels);
  });
});

describe("parseEnabledLanguages", () => {
  it("ajoute toujours le français, en tête", () => {
    expect(parseEnabledLanguages(["br"])).toEqual(["fr", "br"]);
    expect(parseEnabledLanguages([])).toEqual(["fr"]);
    expect(parseEnabledLanguages(null)).toEqual(["fr"]);
    expect(parseEnabledLanguages("br")).toEqual(["fr"]);
  });

  it("normalise, dédoublonne et écarte ce qui n'est pas un code", () => {
    expect(parseEnabledLanguages([" BR ", "br", 42, null, "", "!!"])).toEqual(["fr", "br"]);
  });

  it("conserve un code hors catalogue, rangé après les autres", () => {
    // La base ne valide que la forme : un code inconnu de cette version du
    // catalogue est une donnée, pas une erreur.
    expect(parseEnabledLanguages(["zzz", "br"])).toEqual(["fr", "br", "zzz"]);
  });

  it("range dans l'ordre du catalogue, quel que soit l'ordre reçu", () => {
    expect(parseEnabledLanguages(["br", "en"])).toEqual(["fr", "en", "br"]);
    expect(parseEnabledLanguages(["en", "br"])).toEqual(["fr", "en", "br"]);
  });
});

describe("enabledLanguagesForWrite", () => {
  it("produit le même tableau pour la même sélection, quel que soit l'ordre des cases", () => {
    expect(enabledLanguagesForWrite(["oc", "en"])).toEqual(enabledLanguagesForWrite(["en", "oc"]));
  });

  it("réintroduit le français même s'il a été retiré de la sélection", () => {
    expect(enabledLanguagesForWrite(new Set(["br"]))).toEqual(["fr", "br"]);
  });
});

describe("sortLanguageCodes", () => {
  it("met le français en tête et les codes inconnus en fin", () => {
    expect(sortLanguageCodes(["zzz", "br", "fr", "en"])).toEqual(["fr", "en", "br", "zzz"]);
  });
});

describe("translatableLanguages", () => {
  it("retire le français : il est déjà saisi dans le champ « libellé »", () => {
    expect(translatableLanguages(["fr", "en", "br"])).toEqual(["en", "br"]);
    expect(translatableLanguages(["fr"])).toEqual([]);
  });
});
