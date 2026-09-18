import { describe, it, expect } from "vitest";
import {
  MAX_PROCESSING_TIME,
  cleanUserCommunication,
  defaultUserCommunication,
  emptyRequiredPiece,
  emptyUserFaqItem,
  parseUserCommunication,
  processingTimeError,
  processingTimeLabel,
  processingTimeUnitLabel,
  requiredPiecesError,
  userFaqError,
} from "./userCommunication";

describe("defaultUserCommunication", () => {
  it("⚠️ part entièrement VIDE : une colonne NULL veut dire « rien d'écrit »", () => {
    // L'inverse des défauts de `communication_config`, dont le bloc `visibility`
    // part actif pour ne pas dépublier un catalogue entier. Ici, composer un
    // texte à la place de la collectivité, ce serait publier en son nom.
    expect(defaultUserCommunication()).toEqual({
      delays: { processingTimeValue: null, processingTimeUnit: "jour" },
      audience: { note: "", translations: {} },
      attachments: { items: [] },
      faq: { items: [] },
    });
  });
});

describe("parseUserCommunication", () => {
  it("retombe sur les défauts pour une valeur absente ou aberrante", () => {
    for (const raw of [null, undefined, 42, "usager", [], {}, true]) {
      expect(parseUserCommunication(raw), JSON.stringify(raw) ?? "undefined").toEqual(
        defaultUserCommunication(),
      );
    }
  });

  it("relit les quatre blocs enregistrés", () => {
    expect(
      parseUserCommunication({
        delays: { processingTimeValue: 3, processingTimeUnit: "semaine" },
        audience: { note: "Réservée aux résidents." },
        attachments: { items: [{ label: "Justificatif de domicile", description: "3 mois" }] },
        faq: { items: [{ question: "Où déposer ?", answer: "En ligne." }] },
      }),
    ).toEqual({
      delays: { processingTimeValue: 3, processingTimeUnit: "semaine" },
      audience: { note: "Réservée aux résidents.", translations: {} },
      attachments: {
        items: [{ label: "Justificatif de domicile", description: "3 mois", translations: {} }],
      },
      faq: { items: [{ question: "Où déposer ?", answer: "En ligne.", translations: {} }] },
    });
  });

  it("⚠️ un bloc abîmé revient au défaut SANS emporter ses voisins", () => {
    const parsed = parseUserCommunication({
      delays: "oui",
      audience: 42,
      faq: { items: [{ question: "Q", answer: "R" }] },
    });
    expect(parsed.delays).toEqual({ processingTimeValue: null, processingTimeUnit: "jour" });
    expect(parsed.audience).toEqual({ note: "", translations: {} });
    expect(parsed.faq.items).toEqual([{ question: "Q", answer: "R", translations: {} }]);
  });

  it("ignore les clés inconnues", () => {
    const parsed = parseUserCommunication({ delays: { couleur: "bleu" }, autreBloc: { a: 1 } });
    expect(parsed).not.toHaveProperty("autreBloc");
    expect(parsed.delays).not.toHaveProperty("couleur");
  });

  it("⚠️ n'invente pas de délai : 0, négatif, décimal, chaîne ou hors bornes → null", () => {
    // « 0 jour » promettrait une réponse immédiate ; `"3"` relu comme 3 ici mais
    // refusé ailleurs ferait diverger le Socle de ses consommateurs.
    for (const value of [0, -3, 3.5, "3", "trois", null, true, MAX_PROCESSING_TIME + 1, 1e9]) {
      const parsed = parseUserCommunication({ delays: { processingTimeValue: value } });
      expect(parsed.delays.processingTimeValue, JSON.stringify(value) ?? "undefined").toBeNull();
    }
  });

  it("accepte les deux bornes du délai", () => {
    for (const value of [1, MAX_PROCESSING_TIME]) {
      expect(
        parseUserCommunication({ delays: { processingTimeValue: value } }).delays
          .processingTimeValue,
      ).toBe(value);
    }
  });

  it("⚠️ une unité inconnue retombe sur « jour », la plus neutre", () => {
    for (const unit of ["jours", "JOUR", "an", 42, null, undefined, {}]) {
      expect(
        parseUserCommunication({ delays: { processingTimeValue: 2, processingTimeUnit: unit } })
          .delays.processingTimeUnit,
        JSON.stringify(unit) ?? "undefined",
      ).toBe("jour");
    }
  });

  it("⚠️ garde une pièce à moitié remplie (saisie en cours), écarte la vide", () => {
    const parsed = parseUserCommunication({
      attachments: {
        items: [
          { label: "Pièce d'identité" },
          { description: "précision orpheline" },
          { label: "   ", description: "" },
          "pas un objet",
          null,
        ],
      },
    });
    expect(parsed.attachments.items).toEqual([
      { label: "Pièce d'identité", description: "", translations: {} },
      { label: "", description: "précision orpheline", translations: {} },
    ]);
  });

  it("⚠️ garde une question à moitié remplie, écarte la vide, conserve l'ordre", () => {
    const parsed = parseUserCommunication({
      faq: {
        items: [
          { question: "Combien de temps ?" },
          { question: "", answer: "" },
          { answer: "Réponse orpheline" },
        ],
      },
    });
    expect(parsed.faq.items).toEqual([
      { question: "Combien de temps ?", answer: "", translations: {} },
      { question: "", answer: "Réponse orpheline", translations: {} },
    ]);
  });

  it("une liste qui n'est pas un tableau vaut liste vide", () => {
    const parsed = parseUserCommunication({
      attachments: { items: "CNI" },
      faq: { items: { question: "Q" } },
    });
    expect(parsed.attachments.items).toEqual([]);
    expect(parsed.faq.items).toEqual([]);
  });
});

describe("parseUserCommunication — traductions (2026-09-18)", () => {
  it("relit la traduction de la note, de chaque pièce et de chaque question", () => {
    const parsed = parseUserCommunication({
      audience: {
        note: "Réservée aux résidents.",
        translations: { en: { note: "Residents only." } },
      },
      attachments: {
        items: [
          {
            label: "Justificatif de domicile",
            description: "De moins de 3 mois",
            translations: { en: { label: "Proof of address" }, br: { description: "Nevez" } },
          },
        ],
      },
      faq: {
        items: [
          {
            question: "Où déposer ?",
            answer: "En ligne.",
            translations: { en: { question: "Where?", answer: "Online." } },
          },
        ],
      },
    });
    expect(parsed.audience.translations).toEqual({ en: { note: "Residents only." } });
    // ⚠️ Champ par champ : l'anglais porte l'intitulé sans la précision, le
    // breton l'inverse — c'est le cas normal, pas une traduction inachevée.
    expect(parsed.attachments.items[0].translations).toEqual({
      en: { label: "Proof of address" },
      br: { description: "Nevez" },
    });
    expect(parsed.faq.items[0].translations).toEqual({
      en: { question: "Where?", answer: "Online." },
    });
  });

  it("⚠️ applique les trois règles de la maison : ni `fr`, ni vide, ni langue creuse", () => {
    const parsed = parseUserCommunication({
      faq: {
        items: [
          {
            question: "Q",
            answer: "R",
            translations: {
              fr: { question: "Q bis" },
              en: { question: "  ", answer: "" },
              es: { question: "  ¿Dónde?  " },
            },
          },
        ],
      },
    });
    // `fr` écarté (le français est le champ de même nom), `en` n'a plus aucun
    // texte et disparaît, `es` est élagué.
    expect(parsed.faq.items[0].translations).toEqual({ es: { question: "¿Dónde?" } });
  });

  it("⚠️ une entrée ne porte QUE ses propres champs traduits", () => {
    // Une réponse égarée dans la traduction d'une pièce n'a nulle part où
    // s'afficher : elle est écartée comme une clé inconnue.
    const parsed = parseUserCommunication({
      audience: { note: "N", translations: { en: { note: "N", label: "x" } } },
      attachments: {
        items: [{ label: "L", translations: { en: { label: "L", answer: "x" } } }],
      },
      faq: { items: [{ question: "Q", answer: "R", translations: { en: { note: "x" } } }] },
    });
    expect(parsed.audience.translations).toEqual({ en: { note: "N" } });
    expect(parsed.attachments.items[0].translations).toEqual({ en: { label: "L" } });
    expect(parsed.faq.items[0].translations).toEqual({});
  });

  it("une table de traductions abîmée est vide, sans emporter l'entrée", () => {
    const parsed = parseUserCommunication({
      audience: { note: "N", translations: "en" },
      faq: { items: [{ question: "Q", answer: "R", translations: [1, 2] }] },
    });
    expect(parsed.audience).toEqual({ note: "N", translations: {} });
    expect(parsed.faq.items).toEqual([{ question: "Q", answer: "R", translations: {} }]);
  });

  it("⚠️ une entrée sans français est écartée, traductions comprises", () => {
    // Une traduction sans texte pivot n'aurait rien sur quoi se replier.
    const parsed = parseUserCommunication({
      faq: { items: [{ question: "", answer: "", translations: { en: { question: "Q" } } }] },
    });
    expect(parsed.faq.items).toEqual([]);
  });
});

describe("cleanUserCommunication", () => {
  it("est idempotent", () => {
    const once = cleanUserCommunication(
      parseUserCommunication({
        delays: { processingTimeValue: 2, processingTimeUnit: "mois" },
        audience: { note: "Une précision.", translations: { en: { note: "A detail." } } },
        attachments: { items: [{ label: "CNI", description: "" }] },
        faq: { items: [{ question: "Q", answer: "R", translations: { en: { answer: "A" } } }] },
      }),
    );
    expect(cleanUserCommunication(once)).toEqual(once);
  });

  it("⚠️ élague les traductions saisies frappe par frappe, et laisse l'identité d'écran en route", () => {
    // L'écran stocke la saisie telle quelle (espaces compris, pour qu'on puisse
    // les taper) et porte une clé de ligne : ni l'une ni l'autre ne s'enregistre.
    const config = defaultUserCommunication();
    config.faq.items = [
      Object.assign(
        { question: "Q", answer: "R", translations: { en: { question: " Q ", answer: "  " } } },
        { key: "ligne-1" },
      ),
    ];
    const cleaned = cleanUserCommunication(config);
    expect(cleaned.faq.items).toEqual([
      { question: "Q", answer: "R", translations: { en: { question: "Q" } } },
    ]);
  });

  it("écarte à l'enregistrement les lignes restées entièrement vides", () => {
    const config = defaultUserCommunication();
    config.attachments.items = [emptyRequiredPiece()];
    config.faq.items = [emptyUserFaqItem()];
    const cleaned = cleanUserCommunication(config);
    expect(cleaned.attachments.items).toEqual([]);
    expect(cleaned.faq.items).toEqual([]);
  });
});

describe("processingTimeError", () => {
  it("accepte un délai absent ou dans les bornes", () => {
    expect(processingTimeError({ processingTimeValue: null, processingTimeUnit: "jour" })).toBeNull();
    expect(processingTimeError({ processingTimeValue: 1, processingTimeUnit: "jour" })).toBeNull();
    expect(
      processingTimeError({ processingTimeValue: MAX_PROCESSING_TIME, processingTimeUnit: "mois" }),
    ).toBeNull();
  });

  it("refuse un délai nul, négatif, décimal ou hors borne haute", () => {
    for (const value of [0, -1, 2.5]) {
      expect(processingTimeError({ processingTimeValue: value, processingTimeUnit: "jour" })).toMatch(
        /entier/,
      );
    }
    expect(
      processingTimeError({
        processingTimeValue: MAX_PROCESSING_TIME + 1,
        processingTimeUnit: "jour",
      }),
    ).toMatch(/dépasser/);
  });
});

describe("requiredPiecesError", () => {
  it("laisse passer une liste vide ou entièrement intitulée", () => {
    expect(requiredPiecesError([])).toBeNull();
    expect(requiredPiecesError([{ label: "CNI", description: "" }])).toBeNull();
  });

  it("refuse une précision sans intitulé — elle s'afficherait en puce orpheline", () => {
    expect(requiredPiecesError([{ label: "  ", description: "De moins de 3 mois" }])).toMatch(
      /intitulé/,
    );
  });
});

describe("userFaqError", () => {
  it("laisse passer une FAQ vide ou complète", () => {
    expect(userFaqError([])).toBeNull();
    expect(userFaqError([{ question: "Q", answer: "R" }])).toBeNull();
  });

  it("⚠️ refuse une question sans réponse : elle resterait en l'air sur le site", () => {
    expect(userFaqError([{ question: "Combien de temps ?", answer: "  " }])).toMatch(/réponse/);
  });

  it("refuse une réponse sans question", () => {
    expect(userFaqError([{ question: "", answer: "En ligne." }])).toMatch(/question/);
  });
});

describe("processingTimeLabel", () => {
  it("rend « null » quand le délai n'est pas renseigné", () => {
    expect(processingTimeLabel({ processingTimeValue: null, processingTimeUnit: "semaine" })).toBeNull();
  });

  it("accorde le pluriel sur la valeur", () => {
    expect(processingTimeLabel({ processingTimeValue: 1, processingTimeUnit: "jour_ouvre" })).toBe(
      "1 jour ouvré",
    );
    expect(processingTimeLabel({ processingTimeValue: 3, processingTimeUnit: "jour_ouvre" })).toBe(
      "3 jours ouvrés",
    );
    expect(processingTimeLabel({ processingTimeValue: 2, processingTimeUnit: "semaine" })).toBe(
      "2 semaines",
    );
  });

  it("« mois » est invariable", () => {
    expect(processingTimeUnitLabel("mois", 1)).toBe("mois");
    expect(processingTimeUnitLabel("mois", 6)).toBe("mois");
  });
});
