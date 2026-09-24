import { describe, it, expect } from "vitest";
import { cleanUserInfo, defaultUserInfo, isUserInfoEmpty, parseUserInfo } from "./userInfo";

describe("parseUserInfo — robustesse", () => {
  it("rend des informations vierges pour une entrée nulle, un tableau ou un scalaire", () => {
    const empty = defaultUserInfo();
    for (const raw of [null, undefined, [], "texte", 12]) {
      expect(parseUserInfo(raw)).toEqual(empty);
    }
  });

  it("complète les champs manquants et ignore les clés inconnues", () => {
    const info = parseUserInfo({ openingHours: "Lundi : 9 h – 12 h", physicalReception: "interne" });
    expect(info).toEqual({ description: "", openingHours: "Lundi : 9 h – 12 h", faq: [] });
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
});

describe("cleanUserInfo / isUserInfoEmpty", () => {
  it("nettoie avant persistance avec les mêmes règles que la lecture", () => {
    const cleaned = cleanUserInfo({
      description: "Mairie",
      openingHours: "",
      faq: [{ question: "", answer: "" }],
    });
    expect(cleaned.faq).toEqual([]);
  });

  it("des blancs ne sont pas un texte", () => {
    expect(isUserInfoEmpty(defaultUserInfo())).toBe(true);
    expect(isUserInfoEmpty({ description: "  ", openingHours: "\n", faq: [] })).toBe(true);
    expect(isUserInfoEmpty({ ...defaultUserInfo(), openingHours: "Lundi" })).toBe(false);
    expect(isUserInfoEmpty({ ...defaultUserInfo(), faq: [{ question: "Q", answer: "" }] })).toBe(false);
  });
});
