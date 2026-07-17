import type { Feature, Geometry } from "geojson";

/**
 * Logique pure de l'import GeoJSON des quartiers (portée de Clara, cf.
 * references/clara-quartiers/). Sans dépendance UI : testée par vitest.
 */

/** Palette de couleurs des quartiers (reprise de Clara). */
export const QUARTIER_COLOR_PALETTE: { name: string; value: string }[] = [
  { name: "Vert", value: "hsl(152 83% 42%)" },
  { name: "Jaune", value: "hsl(43 100% 67%)" },
  { name: "Bleu", value: "hsl(212 92% 55%)" },
  { name: "Rouge", value: "hsl(0 84% 60%)" },
  { name: "Violet", value: "hsl(265 80% 60%)" },
  { name: "Orange", value: "hsl(25 95% 55%)" },
  { name: "Rose", value: "hsl(330 81% 60%)" },
  { name: "Gris", value: "hsl(220 9% 46%)" },
];

/** Nom probable d'un polygone d'après ses propriétés (exports QGIS/opendata). */
export function guessName(properties: Record<string, unknown> | null | undefined): string | null {
  if (!properties) return null;
  const candidates = [
    "name",
    "nom",
    "Nom",
    "NOM",
    "nom_quartier",
    "NOM_QUARTIER",
    "label",
    "libelle",
    "LIBELLE",
  ];
  for (const key of candidates) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export interface ExtractedFeature {
  geometry: Geometry;
  properties: Record<string, unknown> | null;
}

function isPolygonal(geometry: Geometry | null | undefined): geometry is Geometry {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

/**
 * Extrait les polygones d'un GeoJSON quelconque (FeatureCollection, Feature ou
 * Geometry nue). Les géométries non surfaciques (points, lignes…) sont
 * ignorées : la colonne `quartiers.geom` n'accepte que des MultiPolygon.
 */
export function extractFeatures(json: unknown): ExtractedFeature[] {
  const obj = json as {
    type?: string;
    features?: unknown[];
    geometry?: Geometry;
    properties?: Record<string, unknown>;
  };
  if (obj?.type === "FeatureCollection" && Array.isArray(obj.features)) {
    return (obj.features as Feature[])
      .filter((f) => isPolygonal(f?.geometry))
      .map((f) => ({
        geometry: f.geometry as Geometry,
        properties: (f.properties as Record<string, unknown>) ?? null,
      }));
  }
  if (obj?.type === "Feature" && isPolygonal(obj.geometry)) {
    return [{ geometry: obj.geometry, properties: obj.properties ?? null }];
  }
  if (obj?.type === "Polygon" || obj?.type === "MultiPolygon") {
    return [{ geometry: obj as unknown as Geometry, properties: null }];
  }
  return [];
}

/**
 * Dédoublonne les noms au sein du même lot (ex. plusieurs communes ayant
 * chacune un quartier « Centre ») — le serveur refait ce contrôle en filet de
 * sécurité contre les quartiers déjà en base. Insensible à la casse, comme
 * l'index d'unicité `quartiers_org_name_unique`.
 */
export function dedupeNames<T extends { name: string }>(items: T[]): T[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const key = item.name.trim().toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    return count === 0 ? item : { ...item, name: `${item.name} (${count + 1})` };
  });
}

export interface ParsedQuartierRow {
  geometry: Geometry;
  name: string;
  color: string;
}

/**
 * Prépare les lignes d'import : nom deviné (sinon « Quartier n »), couleur
 * cyclée sur la palette, noms dédoublonnés.
 */
export function prepareImportRows(features: ExtractedFeature[]): ParsedQuartierRow[] {
  return dedupeNames(
    features.map((f, i) => ({
      geometry: f.geometry,
      name: guessName(f.properties) ?? `Quartier ${i + 1}`,
      color: QUARTIER_COLOR_PALETTE[i % QUARTIER_COLOR_PALETTE.length].value,
    })),
  );
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(((h % 360) + 360) % 360 / 60);
  const [r, g, b] =
    sector === 0 ? [c, x, 0]
    : sector === 1 ? [x, c, 0]
    : sector === 2 ? [0, c, x]
    : sector === 3 ? [0, x, c]
    : sector === 4 ? [x, 0, c]
    : [c, 0, x];
  return [r + m, g + m, b + m];
}

/**
 * Couleur de texte lisible (sombre ou blanc) sur un fond donné, pour les
 * badges colorés. Accepte `hsl(h s% l%)` (avec ou sans virgules) et `#rrggbb` ;
 * blanc par défaut si le format est inconnu.
 */
export function readableTextColor(background: string): string {
  let rgb: [number, number, number] | null = null;

  const hsl = background.match(/hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)/i);
  if (hsl) {
    rgb = hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
  } else {
    const hex = background.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      rgb = [
        parseInt(hex[1].slice(0, 2), 16) / 255,
        parseInt(hex[1].slice(2, 4), 16) / 255,
        parseInt(hex[1].slice(4, 6), 16) / 255,
      ];
    }
  }

  if (!rgb) return "#ffffff";
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return luminance >= 0.6 ? "#111827" : "#ffffff";
}
