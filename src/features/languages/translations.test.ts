import { describe, it, expect } from "vitest";
import {
  localizedName,
  parseTranslations,
  translatedLanguageCodes,
  translationInput,
  translationsForWrite,
} from "./translations";

describe("parseTranslations", () => {
  it("lit la forme objet et la forme chaîne", () => {
    expect(parseTranslations({ br: { name: "Breizh" }, en: "Birth certificate" })).toEqual({
      br: { name: "Breizh" },
      en: { name: "Birth certificate" },
    });
  });

  it("rend un objet vide quand ce n'est pas une table de traductions", () => {
    expect(parseTranslations(null)).toEqual({});
    expect(parseTranslations("br")).toEqual({});
    expect(parseTranslations([{ br: "Breizh" }])).toEqual({});
    expect(parseTranslations({})).toEqual({});
  });

  it("écarte les entrées illisibles une à une, sans emporter les autres", () => {
    expect(
      parseTranslations({ br: "Breizh", en: 42, es: { name: "" }, it: null, de: { nom: "x" } }),
    ).toEqual({ br: { name: "Breizh" } });
  });

  it("écarte le français : la colonne `name` est la seule source du libellé pivot", () => {
    expect(parseTranslations({ fr: "Acte de naissance", br: "Breizh" })).toEqual({
      br: { name: "Breizh" },
    });
  });

  it("normalise le code et élague le libellé", () => {
    expect(parseTranslations({ " BR ": "  Breizh  " })).toEqual({ br: { name: "Breizh" } });
  });
});

describe("translationInput", () => {
  it("rend la saisie de toutes les traductions enregistrées", () => {
    expect(translationInput({ br: "Breizh", en: { name: "Birth" } })).toEqual({
      br: "Breizh",
      en: "Birth",
    });
  });

  it("rend une saisie vide quand rien n'est enregistré", () => {
    expect(translationInput(null)).toEqual({});
    expect(translationInput({})).toEqual({});
  });
});

describe("translationsForWrite", () => {
  it("enregistre les traductions saisies", () => {
    expect(translationsForWrite({}, { en: "Birth certificate" }, ["fr", "en"])).toEqual({
      en: { name: "Birth certificate" },
    });
  });

  it("ne stocke pas une saisie vide : c'est l'absence de traduction", () => {
    expect(translationsForWrite({ en: "Birth" }, { en: "   " }, ["fr", "en"])).toEqual({});
  });

  it("conserve les traductions d'une langue désactivée", () => {
    // Le réglage des langues gouverne l'USAGE, pas la donnée : désactiver le
    // breton puis le réactiver doit rendre le travail déjà fait.
    expect(translationsForWrite({ br: "Breizh", en: "Birth" }, { en: "Birth c." }, ["fr", "en"]))
      .toEqual({ br: { name: "Breizh" }, en: { name: "Birth c." } });
  });

  it("n'écrit jamais le français, même s'il est activé et saisi", () => {
    expect(translationsForWrite({}, { fr: "Acte", en: "Birth" }, ["fr", "en"])).toEqual({
      en: { name: "Birth" },
    });
  });

  it("part d'un existant illisible sans échouer", () => {
    expect(translationsForWrite("n'importe quoi", { en: "Birth" }, ["fr", "en"])).toEqual({
      en: { name: "Birth" },
    });
  });
});

describe("translatedLanguageCodes", () => {
  it("rend les langues traduites dans l'ordre du catalogue", () => {
    expect(translatedLanguageCodes({ br: "Breizh", en: "Birth" })).toEqual(["en", "br"]);
    expect(translatedLanguageCodes({})).toEqual([]);
  });
});

describe("localizedName", () => {
  it("rend la traduction quand elle existe", () => {
    expect(localizedName("Acte de naissance", { br: "Testeni ganedigezh" }, "br")).toBe(
      "Testeni ganedigezh",
    );
  });

  it("retombe sur le français quand elle manque", () => {
    expect(localizedName("Acte de naissance", { br: "Testeni" }, "en")).toBe("Acte de naissance");
    expect(localizedName("Acte de naissance", null, "br")).toBe("Acte de naissance");
    expect(localizedName("Acte de naissance", { br: "Testeni" }, "fr")).toBe("Acte de naissance");
  });
});
