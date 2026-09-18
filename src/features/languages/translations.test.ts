import { describe, it, expect } from "vitest";
import {
  applyTranslations,
  localizedField,
  localizedName,
  parseTranslations,
  setTranslation,
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

/**
 * Le second jeu de champs : les textes d'une section de page composée.
 *
 * Les trois règles sont écrites une seule fois dans ce module ; ce qui suit
 * vérifie qu'elles valent aussi pour ce jeu-là, et surtout que les deux ne se
 * mélangent pas.
 */
describe("deux jeux de champs, une seule implémentation", () => {
  const SECTION = ["title", "subtitle", "placeholder", "body"] as const;

  it("lit les textes d'une section", () => {
    expect(
      parseTranslations({ en: { title: "Our services", body: "Open Monday to Friday." } }, SECTION),
    ).toEqual({ en: { title: "Our services", body: "Open Monday to Friday." } });
  });

  it("écarte ce que la colonne ne porte pas", () => {
    // Un `name` égaré dans les traductions d'une section n'y a pas plus sa
    // place qu'une colonne inconnue — et réciproquement.
    expect(parseTranslations({ en: { title: "T", name: "N" } }, SECTION)).toEqual({
      en: { title: "T" },
    });
    expect(parseTranslations({ en: { title: "T", name: "N" } })).toEqual({ en: { name: "N" } });
  });

  it("ne lit PAS la forme plate là où `name` n'existe pas", () => {
    // `{"br": "Breizh"}` est un libellé — pour une section, ce serait fabriquer
    // un champ que rien n'affiche.
    expect(parseTranslations({ br: "Breizh" }, SECTION)).toEqual({});
    expect(parseTranslations({ br: "Breizh" })).toEqual({ br: { name: "Breizh" } });
  });

  it("n'efface que les champs gouvernés, et relit la colonne EN ENTIER", () => {
    // ⚠️ C'est la garde qui distingue `known` de `fields` : une section
    // `recherche` gouverne trois champs, et ne doit pas emporter un `body` que
    // la colonne porterait (composition importée, ou kind changé en chemin).
    expect(
      translationsForWrite(
        { en: { title: "Old", body: "Kept" } },
        { en: { title: "New" } },
        ["fr", "en"],
        ["title", "subtitle", "placeholder"],
        SECTION,
      ),
    ).toEqual({ en: { title: "New", body: "Kept" } });
  });

  it("supprime la langue quand plus aucun texte ne reste", () => {
    expect(
      translationsForWrite({ en: { title: "T" } }, { en: { title: "  " } }, ["fr", "en"], SECTION, SECTION),
    ).toEqual({});
  });

  it("replie un texte de section sur son français", () => {
    const translations = { en: { title: "Our services" } };
    expect(localizedField("Nos démarches", translations, "en", "title")).toBe("Our services");
    expect(localizedField("Un paragraphe.", translations, "en", "body")).toBe("Un paragraphe.");
  });
});

/**
 * Le descriptif usager (`user_description`) rejoint la colonne le 2026-09-18 —
 * écrit par un AUTRE écran que le libellé. C'est exactement le cas que le
 * quatrième argument de `translationsForWrite` existe pour protéger.
 */
describe("descriptif usager : deux écrans, une colonne", () => {
  const existing = {
    en: { name: "Birth certificate", short_description: "Get a copy.", user_description: "Long." },
  };

  it("est lu comme les autres champs de la colonne", () => {
    expect(parseTranslations(existing)).toEqual(existing);
    expect(localizedField("Long texte.", existing, "en", "user_description")).toBe("Long.");
  });

  it("⚠️ l'étape « Descriptif » ne l'efface pas", () => {
    expect(translationsForWrite(existing, { en: { name: "Birth" } }, ["fr", "en"], BOTH)).toEqual({
      en: { name: "Birth", user_description: "Long." },
    });
  });

  it("⚠️ l'étape « Communication usager » n'efface ni le libellé ni le descriptif court", () => {
    expect(
      translationsForWrite(existing, { en: { user_description: "  " } }, ["fr", "en"], [
        "user_description",
      ]),
    ).toEqual({ en: { name: "Birth certificate", short_description: "Get a copy." } });
  });
});

describe("setTranslation / applyTranslations — l'état EST le JSON", () => {
  const FAQ = ["question", "answer"] as const;

  it("garde la frappe telle quelle, espaces compris", () => {
    // Élaguer à chaque frappe rendrait l'espace impossible à taper.
    expect(setTranslation({}, "en", "question", "Where ")).toEqual({ en: { question: "Where " } });
  });

  it("un texte vide est une absence, et la langue vide disparaît", () => {
    expect(setTranslation({ en: { question: "Q" } }, "en", "question", "  ")).toEqual({});
    expect(
      setTranslation<"question" | "answer">({ en: { question: "Q", answer: "A" } }, "en", "question", ""),
    ).toEqual({ en: { answer: "A" } });
  });

  it("n'écrit jamais le français", () => {
    expect(setTranslation({}, "fr", "question", "Q")).toEqual({});
  });

  it("applique une réponse entière d'un geste, sans poser ce que l'entrée ne porte pas", () => {
    expect(
      applyTranslations(
        { br: { question: "Kept" } },
        { en: { question: "Where?", answer: "Online.", note: "stray" }, es: { answer: "En línea." } },
        FAQ,
      ),
    ).toEqual({
      br: { question: "Kept" },
      en: { question: "Where?", answer: "Online." },
      es: { answer: "En línea." },
    });
  });
});
