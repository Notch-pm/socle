import { describe, it, expect } from "vitest";
import {
  cleanUserInfo,
  dayDraftErrors,
  dayHoursError,
  defaultUserInfo,
  fromDayDrafts,
  isUserInfoEmpty,
  parseOpeningHours,
  parseUserInfo,
  toDayDrafts,
  type DayOpeningHours,
} from "./userInfo";

const MONDAY: DayOpeningHours = {
  day: "monday",
  morningOpen: "08:30",
  morningClose: "12:00",
  afternoonOpen: "13:30",
  afternoonClose: "17:00",
};
const SATURDAY: DayOpeningHours = {
  day: "saturday",
  morningOpen: "09:00",
  morningClose: null,
  afternoonOpen: null,
  afternoonClose: "12:00",
};

describe("parseUserInfo — robustesse", () => {
  it("rend des informations vierges pour une entrée nulle, un tableau ou un scalaire", () => {
    const empty = defaultUserInfo();
    for (const raw of [null, undefined, [], "texte", 12]) {
      expect(parseUserInfo(raw)).toEqual(empty);
    }
  });

  it("complète les champs manquants et ignore les clés inconnues", () => {
    const info = parseUserInfo({ openingHours: [MONDAY], physicalReception: "interne" });
    expect(info).toEqual({ description: "", openingHours: [MONDAY], openingHoursNotes: "", faq: [] });
    expect(info).not.toHaveProperty("physicalReception");
  });

  it("corrige les types et écarte les questions entièrement vides", () => {
    const info = parseUserInfo({
      description: 12,
      faq: [{ question: "Rendez-vous ?", answer: "Non." }, { question: " ", answer: "" }, "texte", null],
    });
    expect(info.description).toBe("");
    expect(info.faq).toEqual([{ question: "Rendez-vous ?", answer: "Non." }]);
  });

  it("ne tronque jamais un texte", () => {
    const long = "x".repeat(20_000);
    expect(parseUserInfo({ description: long }).description).toBe(long);
  });

  it("un ancien texte libre d'horaires ne vaut pas des horaires", () => {
    expect(parseUserInfo({ openingHours: "Lundi : 9 h – 12 h" }).openingHours).toEqual([]);
  });
});

describe("parseOpeningHours — on écarte, on ne répare pas", () => {
  it("garde les jours valides, dans l'ordre de la semaine", () => {
    expect(parseOpeningHours([SATURDAY, MONDAY])).toEqual([MONDAY, SATURDAY]);
  });

  it("une pause vide (\"\") se lit comme une absence de pause", () => {
    expect(parseOpeningHours([{ ...SATURDAY, morningClose: "", afternoonOpen: "" }])).toEqual([SATURDAY]);
  });

  it("écarte jour inconnu, doublon, heure manquante ou mal formée, pause à moitié, désordre", () => {
    expect(
      parseOpeningHours([
        { ...MONDAY, day: "lundi" },
        MONDAY,
        { ...MONDAY, afternoonClose: "18:00" }, // doublon du lundi : le premier gagne
        { ...MONDAY, day: "tuesday", morningOpen: "" },
        { ...MONDAY, day: "wednesday", afternoonClose: "8h" },
        { ...MONDAY, day: "thursday", afternoonOpen: null },
        { ...MONDAY, day: "friday", morningClose: "14:00" },
        { ...MONDAY, day: "saturday", morningClose: 12 },
        { ...SATURDAY, day: "sunday", morningOpen: "24:00" },
        "texte",
      ]),
    ).toEqual([MONDAY]);
  });
});

describe("dayHoursError", () => {
  it("accepte une journée continue ou coupée", () => {
    expect(dayHoursError(MONDAY)).toBeNull();
    expect(dayHoursError(SATURDAY)).toBeNull();
  });

  it("exige l'ouverture du matin et la fermeture de l'après-midi", () => {
    expect(dayHoursError({ ...MONDAY, morningOpen: "" })).toMatch(/ouverture du matin est obligatoire/);
    expect(dayHoursError({ ...MONDAY, afternoonClose: "" })).toMatch(/fermeture de l'après-midi/);
  });

  it("la pause va par paire, et les heures se suivent", () => {
    expect(dayHoursError({ ...MONDAY, afternoonOpen: "" })).toMatch(/pause de midi/);
    expect(dayHoursError({ ...MONDAY, morningClose: "13:30" })).toMatch(/se suivre/);
    expect(dayHoursError({ ...SATURDAY, afternoonClose: "09:00" })).toMatch(/se suivre/);
  });
});

describe("lignes de saisie", () => {
  it("aller-retour : sept lignes, les jours absents fermés", () => {
    const drafts = toDayDrafts([MONDAY, SATURDAY]);
    expect(drafts).toHaveLength(7);
    expect(drafts.filter((d) => d.open).map((d) => d.day)).toEqual(["monday", "saturday"]);
    expect(drafts[5]).toMatchObject({ morningClose: "", afternoonOpen: "" });
    expect(fromDayDrafts(drafts)).toEqual([MONDAY, SATURDAY]);
  });

  it("ne signale que les jours ouverts", () => {
    const drafts = toDayDrafts([]);
    expect(dayDraftErrors(drafts)).toEqual({});
    drafts[1] = { ...drafts[1], open: true };
    expect(Object.keys(dayDraftErrors(drafts))).toEqual(["tuesday"]);
  });
});

describe("cleanUserInfo / isUserInfoEmpty", () => {
  it("nettoie avant persistance avec les mêmes règles que la lecture", () => {
    const cleaned = cleanUserInfo({
      description: "Mairie",
      openingHours: [MONDAY, { ...MONDAY, day: "tuesday", morningOpen: "" }],
      openingHoursNotes: "",
      faq: [{ question: "", answer: "" }],
    });
    expect(cleaned.faq).toEqual([]);
    expect(cleaned.openingHours).toEqual([MONDAY]);
  });

  it("des blancs ne sont pas un texte", () => {
    expect(isUserInfoEmpty(defaultUserInfo())).toBe(true);
    expect(isUserInfoEmpty({ description: "  ", openingHours: [], openingHoursNotes: " \n", faq: [] })).toBe(true);
    expect(isUserInfoEmpty({ ...defaultUserInfo(), openingHoursNotes: "Fermé le 15 août" })).toBe(false);
    expect(isUserInfoEmpty({ ...defaultUserInfo(), openingHours: [SATURDAY] })).toBe(false);
    expect(isUserInfoEmpty({ ...defaultUserInfo(), faq: [{ question: "Q", answer: "" }] })).toBe(false);
  });
});
