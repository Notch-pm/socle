import { describe, it, expect } from "vitest";
import {
  brandingUpdateFromValues,
  brandingValuesFromOrganization,
  colorFieldError,
  isBrandingEmpty,
  normalizeHexColor,
  previewBranding,
  type BrandingValues,
} from "./branding";

const org = (over: Partial<Parameters<typeof brandingValuesFromOrganization>[0]> = {}) => ({
  parent_id: "parent-1",
  logo_url: null,
  logo_white_url: null,
  favicon_url: null,
  primary_color: null,
  secondary_color: null,
  branding_inherit_parent: true,
  ...over,
});

const values = (over: Partial<BrandingValues> = {}): BrandingValues => ({
  logoUrl: "",
  logoWhiteUrl: "",
  faviconUrl: "",
  primaryColor: "",
  secondaryColor: "",
  inheritParent: false,
  ...over,
});

describe("normalizeHexColor", () => {
  it("accepte les formes longues, avec ou sans dièse, et normalise en minuscules", () => {
    expect(normalizeHexColor("#1F8A5B")).toBe("#1f8a5b");
    expect(normalizeHexColor("1f8a5b")).toBe("#1f8a5b");
    expect(normalizeHexColor("  #FFD166  ")).toBe("#ffd166");
  });

  it("développe la forme courte à trois chiffres", () => {
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
    expect(normalizeHexColor("F0A")).toBe("#ff00aa");
  });

  it("rejette tout le reste", () => {
    for (const input of ["", "   ", "vert", "#12345", "#1234567", "rgb(1,2,3)", "#12345g"]) {
      expect(normalizeHexColor(input)).toBeNull();
    }
  });
});

describe("colorFieldError", () => {
  it("laisse passer le vide : une couleur non définie n'est pas une erreur", () => {
    expect(colorFieldError("")).toBeNull();
    expect(colorFieldError("   ")).toBeNull();
  });

  it("signale une saisie qui n'est pas une couleur", () => {
    expect(colorFieldError("bleu marine")).toMatch(/hexadécimale/);
  });

  it("accepte une couleur valide", () => {
    expect(colorFieldError("#abc")).toBeNull();
  });
});

describe("brandingValuesFromOrganization", () => {
  it("remplit le formulaire depuis la ligne", () => {
    expect(
      brandingValuesFromOrganization(
        org({
          logo_url: "https://x/logo.png",
          logo_white_url: "https://x/blanc.svg",
          favicon_url: "https://x/favicon.png",
          primary_color: "#1f8a5b",
          secondary_color: "#ffd166",
          branding_inherit_parent: false,
        }),
      ),
    ).toEqual({
      logoUrl: "https://x/logo.png",
      logoWhiteUrl: "https://x/blanc.svg",
      faviconUrl: "https://x/favicon.png",
      primaryColor: "#1f8a5b",
      secondaryColor: "#ffd166",
      inheritParent: false,
    });
  });

  it("n'affiche jamais une racine comme héritant, même si la colonne le prétend", () => {
    const v = brandingValuesFromOrganization(
      org({ parent_id: null, branding_inherit_parent: true }),
    );
    expect(v.inheritParent).toBe(false);
  });
});

describe("brandingUpdateFromValues", () => {
  it("normalise les couleurs et vide les chaînes blanches", () => {
    expect(
      brandingUpdateFromValues(
        values({
          logoUrl: "  https://x/logo.png  ",
          logoWhiteUrl: "   ",
          faviconUrl: "  https://x/favicon.png  ",
          primaryColor: "#1F8A5B",
          secondaryColor: "abc",
        }),
        true,
      ),
    ).toEqual({
      logo_url: "https://x/logo.png",
      logo_white_url: null,
      favicon_url: "https://x/favicon.png",
      primary_color: "#1f8a5b",
      secondary_color: "#aabbcc",
      branding_inherit_parent: false,
    });
  });

  it("CONSERVE les valeurs propres quand l'organisation hérite (retour en arrière possible)", () => {
    const update = brandingUpdateFromValues(
      values({ logoUrl: "https://x/logo.png", primaryColor: "#1f8a5b", inheritParent: true }),
      true,
    );
    expect(update.branding_inherit_parent).toBe(true);
    expect(update.logo_url).toBe("https://x/logo.png");
    expect(update.primary_color).toBe("#1f8a5b");
  });

  it("n'écrit jamais un héritage sur une organisation sans parent", () => {
    const update = brandingUpdateFromValues(values({ inheritParent: true }), false);
    expect(update.branding_inherit_parent).toBe(false);
  });

  it("écrit null plutôt qu'une couleur invalide — la base la refuserait", () => {
    expect(brandingUpdateFromValues(values({ primaryColor: "vert" }), false).primary_color).toBeNull();
  });
});

describe("previewBranding", () => {
  const parent = {
    logoUrl: "https://parent/logo.png",
    logoWhiteUrl: null,
    faviconUrl: "https://parent/favicon.png",
    primaryColor: "#123456",
    secondaryColor: null,
  };

  it("montre la charte du parent tant que le commutateur est actif", () => {
    expect(previewBranding(values({ logoUrl: "https://propre/logo.png", inheritParent: true }), parent))
      .toEqual(parent);
  });

  it("montre la charte propre dès que le commutateur retombe, sans attendre l'enregistrement", () => {
    expect(previewBranding(values({ logoUrl: "https://propre/logo.png", primaryColor: "#ABC" }), parent))
      .toEqual({
        logoUrl: "https://propre/logo.png",
        logoWhiteUrl: null,
        faviconUrl: null,
        primaryColor: "#aabbcc",
        secondaryColor: null,
      });
  });

  it("hérite d'un parent sans charte : rien, et non la sienne", () => {
    const preview = previewBranding(
      values({ logoUrl: "https://propre/logo.png", inheritParent: true }),
      null,
    );
    expect(isBrandingEmpty(preview)).toBe(true);
  });
});

describe("isBrandingEmpty", () => {
  it("distingue le vide du renseigné", () => {
    expect(
      isBrandingEmpty({
        logoUrl: null,
        logoWhiteUrl: "   ",
        faviconUrl: null,
        primaryColor: null,
        secondaryColor: null,
      }),
    ).toBe(true);
    expect(
      isBrandingEmpty({
        logoUrl: null,
        logoWhiteUrl: null,
        faviconUrl: null,
        primaryColor: "#1f8a5b",
        secondaryColor: null,
      }),
    ).toBe(false);
  });

  it("un favicon seul est une charte : les CINQ éléments comptent", () => {
    expect(
      isBrandingEmpty({
        logoUrl: null,
        logoWhiteUrl: null,
        faviconUrl: "https://x/favicon.png",
        primaryColor: null,
        secondaryColor: null,
      }),
    ).toBe(false);
  });
});
