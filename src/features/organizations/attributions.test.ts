import { describe, it, expect } from "vitest";
import {
  MAX_ATTRIBUTIONS_LENGTH,
  cleanAttributions,
  isAttributionsEmpty,
  parseAttributions,
} from "./attributions";

describe("parseAttributions — robustesse", () => {
  it("rend la chaîne telle quelle, blancs compris (champ contrôlé)", () => {
    expect(parseAttributions("Voirie \n")).toBe("Voirie \n");
  });

  it("rend un texte vide pour tout ce qui n'est pas une chaîne", () => {
    for (const raw of [null, undefined, 42, {}, ["a"]]) expect(parseAttributions(raw)).toBe("");
  });

  it("ne tronque pas : la borne est tenue par la saisie et par la base", () => {
    const long = "x".repeat(MAX_ATTRIBUTIONS_LENGTH + 10);
    expect(parseAttributions(long)).toBe(long);
  });
});

describe("cleanAttributions / isAttributionsEmpty", () => {
  it("retire les blancs de bord à l'écriture seulement", () => {
    expect(cleanAttributions("  Urbanisme\n")).toBe("Urbanisme");
  });

  it("un texte blanc est vide", () => {
    expect(isAttributionsEmpty(" \n\t")).toBe(true);
    expect(isAttributionsEmpty("État civil")).toBe(false);
  });

  it("borne de 2 000 caractères (CHECK de la table)", () => {
    expect(MAX_ATTRIBUTIONS_LENGTH).toBe(2000);
  });
});
