import { describe, expect, it } from "vitest";
import {
  addressTouched,
  BAN_MIN_SCORE,
  buildGeocodeQuery,
  parseBanResult,
} from "./geocoding.ts";

describe("addressTouched", () => {
  it("détecte les champs d'adresse géocodés, et eux seuls", () => {
    expect(addressTouched({ address_line1: "1 rue du Port" })).toBe(true);
    expect(addressTouched({ postal_code: null })).toBe(true);
    expect(addressTouched({ city: "Arles" })).toBe(true);
    expect(addressTouched({ address_line2: "Bât. B", email: "a@b.fr" })).toBe(false);
    expect(addressTouched({})).toBe(false);
  });
});

describe("buildGeocodeQuery", () => {
  it("assemble voie + code postal + ville", () => {
    expect(
      buildGeocodeQuery({
        address_line1: "1 place de la République",
        postal_code: "13200",
        city: "Arles",
        country: "France",
      }),
    ).toBe("1 place de la République 13200 Arles");
  });

  it("accepte une localité seule (ville ou code postal)", () => {
    expect(
      buildGeocodeQuery({ address_line1: "1 rue X", postal_code: null, city: "Arles", country: null }),
    ).toBe("1 rue X Arles");
    expect(
      buildGeocodeQuery({ address_line1: "1 rue X", postal_code: "13200", city: null, country: null }),
    ).toBe("1 rue X 13200");
  });

  it("refuse une adresse insuffisante (pas de voie, ou pas de localité)", () => {
    expect(
      buildGeocodeQuery({ address_line1: null, postal_code: "13200", city: "Arles", country: null }),
    ).toBeNull();
    expect(
      buildGeocodeQuery({ address_line1: "1 rue X", postal_code: null, city: null, country: null }),
    ).toBeNull();
  });

  it("refuse une adresse hors de France (la BAN ne couvre que la France)", () => {
    expect(
      buildGeocodeQuery({ address_line1: "1 rue X", postal_code: "1000", city: "Bruxelles", country: "Belgique" }),
    ).toBeNull();
    expect(
      buildGeocodeQuery({ address_line1: "1 rue X", postal_code: "13200", city: "Arles", country: " FRANCE " }),
    ).not.toBeNull();
  });
});

describe("parseBanResult", () => {
  const feature = (score: number, coordinates: unknown = [4.6278, 43.6766]) => ({
    type: "FeatureCollection",
    features: [{ properties: { score }, geometry: { type: "Point", coordinates } }],
  });

  it("extrait lon/lat du meilleur résultat (GeoJSON = [lon, lat])", () => {
    expect(parseBanResult(feature(0.9))).toEqual({ lat: 43.6766, lon: 4.6278 });
  });

  it("rejette un score sous le seuil (mieux vaut aucune coordonnée qu'un faux quartier)", () => {
    expect(parseBanResult(feature(BAN_MIN_SCORE - 0.01))).toBeNull();
    expect(parseBanResult(feature(BAN_MIN_SCORE))).not.toBeNull();
  });

  it("rejette les réponses vides ou malformées", () => {
    expect(parseBanResult({ type: "FeatureCollection", features: [] })).toBeNull();
    expect(parseBanResult(null)).toBeNull();
    expect(parseBanResult({})).toBeNull();
    expect(parseBanResult(feature(0.9, ["4.6", "43.7"]))).toBeNull();
    expect(parseBanResult(feature(0.9, [4.6]))).toBeNull();
  });
});
