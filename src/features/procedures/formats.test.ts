import { describe, it, expect } from "vitest";
import { normalizeFormat, addFormats } from "./formats";

describe("normalizeFormat", () => {
  it("met en minuscules et retire le point de tête et les espaces", () => {
    expect(normalizeFormat("  .PDF ")).toBe("pdf");
    expect(normalizeFormat("JPG")).toBe("jpg");
    expect(normalizeFormat("do cx")).toBe("docx");
  });

  it("renvoie une chaîne vide pour une entrée vide", () => {
    expect(normalizeFormat("   ")).toBe("");
    expect(normalizeFormat(".")).toBe("");
  });
});

describe("addFormats", () => {
  it("ajoute un format normalisé sans doublon", () => {
    expect(addFormats(["pdf"], "JPG")).toEqual(["pdf", "jpg"]);
    expect(addFormats(["pdf"], ".pdf")).toEqual(["pdf"]);
  });

  it("découpe les virgules et ignore les entrées vides", () => {
    expect(addFormats([], "pdf, .JPG , , png")).toEqual(["pdf", "jpg", "png"]);
  });

  it("conserve l'ordre existant", () => {
    expect(addFormats(["zip", "pdf"], "png")).toEqual(["zip", "pdf", "png"]);
  });
});
