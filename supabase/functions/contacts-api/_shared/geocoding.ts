/**
 * Géocodage des adresses d'usagers — logique **pure** (construction de la
 * requête, interprétation de la réponse), testée par vitest. L'appel réseau
 * lui-même vit dans `index.ts` (Deno `fetch`).
 *
 * Source : API de géocodage de la **Géoplateforme IGN** (Base Adresse
 * Nationale), la même que l'autocomplétion d'adresse historique de Clara
 * (cf. references/clara-quartiers/banAddressService.ts). CORS ouvert, pas de
 * clé requise, France uniquement.
 */

export const BAN_SEARCH_URL = "https://data.geopf.fr/geocodage/search";

/**
 * Score BAN minimal pour retenir un résultat : en dessous, mieux vaut aucune
 * coordonnée qu'un rattachement de quartier faux au mauvais bout de la ville.
 */
export const BAN_MIN_SCORE = 0.4;

/** Champs de `contacts` qui participent au géocodage. */
export const GEOCODED_ADDRESS_FIELDS = ["address_line1", "postal_code", "city"] as const;

/** L'un des champs d'adresse géocodés est-il présent dans ce patch ? */
export function addressTouched(fields: Record<string, unknown>): boolean {
  return GEOCODED_ADDRESS_FIELDS.some((key) => key in fields);
}

export interface GeocodableAddress {
  address_line1: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

/**
 * Construit la requête de géocodage à partir de l'état **fusionné** de la
 * fiche, ou `null` si l'adresse est insuffisante (il faut au moins la voie et
 * une localité) ou hors de France (la BAN ne couvre que la France).
 */
export function buildGeocodeQuery(address: GeocodableAddress): string | null {
  const country = (address.country ?? "").trim().toLowerCase();
  if (country !== "" && country !== "france") return null;
  const line1 = (address.address_line1 ?? "").trim();
  const postalCode = (address.postal_code ?? "").trim();
  const city = (address.city ?? "").trim();
  if (line1 === "" || (postalCode === "" && city === "")) return null;
  return [line1, postalCode, city].filter((part) => part !== "").join(" ");
}

/**
 * Extrait les coordonnées du meilleur résultat d'une réponse BAN
 * (FeatureCollection GeoJSON), ou `null` : réponse vide, malformée, ou score
 * sous `BAN_MIN_SCORE`.
 */
export function parseBanResult(json: unknown): { lat: number; lon: number } | null {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const best = features[0] as {
    properties?: { score?: unknown };
    geometry?: { coordinates?: unknown };
  };
  const score = best?.properties?.score;
  if (typeof score !== "number" || score < BAN_MIN_SCORE) return null;
  const coordinates = best?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lon, lat] = coordinates;
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lat, lon };
}
