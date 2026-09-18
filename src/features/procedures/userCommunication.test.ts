import { describe, it, expect } from "vitest";
import {
  MAX_PROCESSING_TIME,
  cleanUserCommunication,
  defaultUserCommunication,
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
      audience: { note: "" },
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
      audience: { note: "Réservée aux résidents." },
      attachments: { items: [{ label: "Justificatif de domicile", description: "3 mois" }] },
      faq: { items: [{ question: "Où déposer ?", answer: "En ligne." }] },
    });
  });

  it("⚠️ un bloc abîmé revient au défaut SANS emporter ses voisins", () => {
    const parsed = parseUserCommunication({
      delays: "oui",
      audience: 42,
      faq: { items: [{ question: "Q", answer: "R" }] },
    });
    expect(parsed.delays).toEqual({ processingTimeValue: null, processingTimeUnit: "jour" });
    expect(parsed.audience).toEqual({ note: "" });
    expect(parsed.faq.items).toEqual([{ question: "Q", answer: "R" }]);
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
      { label: "Pièce d'identité", description: "" },
      { label: "", description: "précision orpheline" },
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
      { question: "Combien de temps ?", answer: "" },
      { question: "", answer: "Réponse orpheline" },
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

describe("cleanUserCommunication", () => {
  it("est idempotent", () => {
    const once = cleanUserCommunication(
      parseUserCommunication({
        delays: { processingTimeValue: 2, processingTimeUnit: "mois" },
        audience: { note: "Une précision." },
        attachments: { items: [{ label: "CNI", description: "" }] },
        faq: { items: [{ question: "Q", answer: "R" }] },
      }),
    );
    expect(cleanUserCommunication(once)).toEqual(once);
  });

  it("écarte à l'enregistrement les lignes restées entièrement vides", () => {
    const config = defaultUserCommunication();
    config.attachments.items = [{ label: "", description: "" }];
    config.faq.items = [{ question: "", answer: "" }];
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
