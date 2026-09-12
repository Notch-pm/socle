import { describe, expect, it } from "vitest";
import { slugIssue, slugPathPreview, SLUG_RESERVED } from "./organizationSlug";

describe("slugIssue — ce qu'un agent lit avant que la base refuse", () => {
  it("accepte un slug bien formé", () => {
    expect(slugIssue("mairie-de-cahors")).toBeNull();
    expect(slugIssue("mairie2")).toBeNull();
    // Les espaces autour ne comptent pas : le formulaire les retire à
    // l'enregistrement.
    expect(slugIssue("  mairie-de-cahors  ")).toBeNull();
  });

  // La colonne est facultative : un organisme sans slug n'a pas de page, et ce
  // n'est pas une erreur de saisie.
  it("accepte un slug vide", () => {
    expect(slugIssue("")).toBeNull();
    expect(slugIssue("   ")).toBeNull();
  });

  it("refuse ce qui ne peut pas tenir dans une adresse", () => {
    expect(slugIssue("Mairie De Cahors")).not.toBeNull();
    expect(slugIssue("mairie_de_cahors")).not.toBeNull();
    expect(slugIssue("mairie--de-cahors")).not.toBeNull();
    expect(slugIssue("-mairie")).not.toBeNull();
    expect(slugIssue("mairie-")).not.toBeNull();
    expect(slugIssue("saint-rémy")).not.toBeNull();
  });

  // ⚠️ Le cas qui justifie la règle : trois caractères ou moins, et le portail
  // lit l'adresse comme un code de langue.
  it("refuse un slug trop court pour ne pas être lu comme une langue", () => {
    expect(slugIssue("cae")).not.toBeNull();
    expect(slugIssue("cc")).not.toBeNull();
    expect(slugIssue("caen")).toBeNull();
  });

  it("refuse les segments de route du portail", () => {
    for (const reserved of SLUG_RESERVED) {
      expect(slugIssue(reserved), reserved).not.toBeNull();
    }
  });
});

describe("slugPathPreview — l'adresse montrée pendant la saisie", () => {
  it("montre le chemin d'un slug acceptable", () => {
    expect(slugPathPreview("mairie-de-cahors")).toBe("/mairie-de-cahors");
  });

  it("ne montre rien tant que le slug ne tient pas dans une adresse", () => {
    expect(slugPathPreview("")).toBeNull();
    expect(slugPathPreview("cc")).toBeNull();
    expect(slugPathPreview("Mairie")).toBeNull();
  });
});
