import { describe, it, expect } from "vitest";
import {
  localizedField,
  localizedName,
  parseTranslations,
  translatedLanguageCodes,
  translationInput,
  translationsForWrite,
} from "./translations";

const NAME_ONLY = ["name"] as const;
const BOTH = ["name", "short_description"] as const;

describe("parseTranslations", () => {
  it("lit la forme objet et la forme chaîne", () => {
    expect(parseTranslations({ br: { name: "Breizh" }, en: "Birth certificate" })).toEqual({
      br: { name: "Breizh" },
      en: { name: "Birth certificate" },
    });
  });

  it("lit les deux champs traduisibles", () => {
    expect(
      parseTranslations({ en: { name: "Birth certificate", short_description: "Get a copy." } }),
    ).toEqual({ en: { name: "Birth certificate", short_description: "Get a copy." } });
  });

  it("garde une langue qui n'a que le descriptif : chaque champ est indépendant", () => {
    expect(parseTranslations({ en: { short_description: "Get a copy." } })).toEqual({
      en: { short_description: "Get a copy." },
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

  it("écarte un champ illisible sans emporter l'autre champ de la même langue", () => {
    expect(parseTranslations({ en: { name: "Birth", short_description: 42 } })).toEqual({
      en: { name: "Birth" },
    });
  });

  it("ne laisse pas d'entrée vide : « traduit en anglais » se compterait à tort", () => {
    expect(parseTranslations({ en: { name: "  ", short_description: "" } })).toEqual({});
  });

  it("écarte le français : la colonne `name` est la seule source du libellé pivot", () => {
    expect(parseTranslations({ fr: "Acte de naissance", br: "Breizh" })).toEqual({
      br: { name: "Breizh" },
    });
  });

  it("normalise le code et élague les textes", () => {
    expect(parseTranslations({ " BR ": "  Breizh  " })).toEqual({ br: { name: "Breizh" } });
  });
});

describe("translationInput", () => {
  it("rend la saisie de toutes les traductions enregistrées", () => {
    expect(
      translationInput({ br: "Breizh", en: { name: "Birth", short_description: "Copy." } }),
    ).toEqual({
      br: { name: "Breizh" },
      en: { name: "Birth", short_description: "Copy." },
    });
  });

  it("rend une saisie vide quand rien n'est enregistré", () => {
    expect(translationInput(null)).toEqual({});
    expect(translationInput({})).toEqual({});
  });
});

describe("translationsForWrite", () => {
  it("enregistre les traductions saisies, champ par champ", () => {
    expect(
      translationsForWrite(
        {},
        { en: { name: "Birth certificate", short_description: "Get a copy." } },
        ["fr", "en"],
        BOTH,
      ),
    ).toEqual({ en: { name: "Birth certificate", short_description: "Get a copy." } });
  });

  it("ne stocke pas une saisie vide : c'est l'absence de traduction", () => {
    expect(translationsForWrite({ en: "Birth" }, { en: { name: "   " } }, ["fr", "en"], BOTH))
      .toEqual({});
  });

  it("efface un champ vidé sans emporter l'autre", () => {
    expect(
      translationsForWrite(
        { en: { name: "Birth", short_description: "Copy." } },
        { en: { name: "Birth", short_description: "  " } },
        ["fr", "en"],
        BOTH,
      ),
    ).toEqual({ en: { name: "Birth" } });
  });

  it("ne touche pas à un champ que l'écran ne gouverne pas", () => {
    // L'écran des catégories n'affiche que le libellé : un descriptif traduit
    // (venu d'ailleurs, ou d'une version antérieure) lui survit.
    expect(
      translationsForWrite(
        { en: { name: "Birth", short_description: "Copy." } },
        { en: { name: "Birth certificate" } },
        ["fr", "en"],
        NAME_ONLY,
      ),
    ).toEqual({ en: { name: "Birth certificate", short_description: "Copy." } });
  });

  it("conserve les traductions d'une langue désactivée", () => {
    // Le réglage des langues gouverne l'USAGE, pas la donnée : désactiver le
    // breton puis le réactiver doit rendre le travail déjà fait.
    expect(
      translationsForWrite(
        { br: "Breizh", en: "Birth" },
        { en: { name: "Birth c." } },
        ["fr", "en"],
        BOTH,
      ),
    ).toEqual({ br: { name: "Breizh" }, en: { name: "Birth c." } });
  });

  it("n'écrit jamais le français, même s'il est activé et saisi", () => {
    expect(
      translationsForWrite(
        {},
        { fr: { name: "Acte" }, en: { name: "Birth" } },
        ["fr", "en"],
        BOTH,
      ),
    ).toEqual({ en: { name: "Birth" } });
  });

  it("part d'un existant illisible sans échouer", () => {
    expect(
      translationsForWrite("n'importe quoi", { en: { name: "Birth" } }, ["fr", "en"], BOTH),
    ).toEqual({ en: { name: "Birth" } });
  });
});

describe("translatedLanguageCodes", () => {
  it("rend les langues traduites dans l'ordre du catalogue", () => {
    expect(translatedLanguageCodes({ br: "Breizh", en: "Birth" })).toEqual(["en", "br"]);
    expect(translatedLanguageCodes({})).toEqual([]);
  });
});

describe("localizedName / localizedField", () => {
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

  it("replie CHAQUE champ séparément", () => {
    // Le libellé est traduit, le descriptif non : l'un s'affiche en breton,
    // l'autre en français. Un repli global masquerait la traduction faite.
    const translations = { br: { name: "Testeni ganedigezh" } };
    expect(localizedField("Acte de naissance", translations, "br", "name")).toBe(
      "Testeni ganedigezh",
    );
    expect(localizedField("Pour obtenir une copie.", translations, "br", "short_description")).toBe(
      "Pour obtenir une copie.",
    );
  });

  it("traite une colonne française nulle comme un texte vide", () => {
    expect(localizedField(null, {}, "br", "short_description")).toBe("");
  });
});
