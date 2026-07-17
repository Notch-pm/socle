import { describe, it, expect } from "vitest";
import {
  extractFeatures,
  guessName,
  dedupeNames,
  prepareImportRows,
  readableTextColor,
  QUARTIER_COLOR_PALETTE,
} from "./quartiersGeojson";

const square = {
  type: "Polygon" as const,
  coordinates: [
    [
      [1.9, 47.9],
      [2.1, 47.9],
      [2.1, 48.1],
      [1.9, 48.1],
      [1.9, 47.9],
    ],
  ],
};

describe("guessName", () => {
  it("reconnaît les clés usuelles des exports opendata", () => {
    expect(guessName({ nom: "Centre" })).toBe("Centre");
    expect(guessName({ NOM_QUARTIER: " Les Halles " })).toBe("Les Halles");
    expect(guessName({ libelle: "Bourg" })).toBe("Bourg");
  });

  it("renvoie null sans propriété exploitable", () => {
    expect(guessName(null)).toBeNull();
    expect(guessName({ population: 1200 })).toBeNull();
    expect(guessName({ name: "   " })).toBeNull();
  });
});

describe("extractFeatures", () => {
  it("extrait les polygones d'une FeatureCollection", () => {
    const result = extractFeatures({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: square, properties: { nom: "Centre" } },
        { type: "Feature", geometry: { type: "MultiPolygon", coordinates: [] }, properties: null },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0].properties).toEqual({ nom: "Centre" });
  });

  it("ignore les géométries non surfaciques (points, lignes)", () => {
    const result = extractFeatures({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [2, 48] }, properties: null },
        { type: "Feature", geometry: square, properties: null },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].geometry.type).toBe("Polygon");
  });

  it("accepte une Feature seule ou une géométrie nue", () => {
    expect(extractFeatures({ type: "Feature", geometry: square, properties: { nom: "A" } })).toHaveLength(1);
    expect(extractFeatures(square)).toHaveLength(1);
  });

  it("renvoie une liste vide pour un contenu inexploitable", () => {
    expect(extractFeatures({ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } })).toEqual([]);
    expect(extractFeatures({ foo: "bar" })).toEqual([]);
    expect(extractFeatures(null)).toEqual([]);
  });
});

describe("dedupeNames", () => {
  it("suffixe les collisions, insensible à la casse", () => {
    const result = dedupeNames([{ name: "Centre" }, { name: "centre" }, { name: "Centre" }]);
    expect(result.map((r) => r.name)).toEqual(["Centre", "centre (2)", "Centre (3)"]);
  });

  it("laisse les noms distincts intacts", () => {
    const result = dedupeNames([{ name: "Bourg" }, { name: "Centre" }]);
    expect(result.map((r) => r.name)).toEqual(["Bourg", "Centre"]);
  });
});

describe("prepareImportRows", () => {
  it("devine le nom, sinon « Quartier n », et cycle la palette", () => {
    const features = Array.from({ length: 9 }, (_, i) => ({
      geometry: square,
      properties: i === 0 ? { nom: "Centre" } : null,
    }));
    const rows = prepareImportRows(features);
    expect(rows[0].name).toBe("Centre");
    expect(rows[1].name).toBe("Quartier 2");
    expect(rows[0].color).toBe(QUARTIER_COLOR_PALETTE[0].value);
    expect(rows[8].color).toBe(QUARTIER_COLOR_PALETTE[0].value);
  });

  it("dédoublonne les noms devinés identiques", () => {
    const rows = prepareImportRows([
      { geometry: square, properties: { nom: "Centre" } },
      { geometry: square, properties: { nom: "Centre" } },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Centre", "Centre (2)"]);
  });
});

describe("readableTextColor", () => {
  it("texte sombre sur fond clair (jaune)", () => {
    expect(readableTextColor("hsl(43 100% 67%)")).toBe("#111827");
    expect(readableTextColor("#ffe08a")).toBe("#111827");
  });

  it("texte blanc sur fond soutenu (vert, bleu, rouge)", () => {
    expect(readableTextColor("hsl(152 83% 42%)")).toBe("#ffffff");
    expect(readableTextColor("hsl(212, 92%, 55%)")).toBe("#ffffff");
    expect(readableTextColor("#dc2626")).toBe("#ffffff");
  });

  it("blanc par défaut pour un format inconnu", () => {
    expect(readableTextColor("tomato")).toBe("#ffffff");
  });
});
