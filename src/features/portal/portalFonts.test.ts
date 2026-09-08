import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_FONT_ID, FONT_IDS, fontById, isFontId, PORTAL_FONTS } from "./portalFonts";

describe("le catalogue est un contrat de nommage", () => {
  it("les identifiants sont ceux que l'API publie", () => {
    // ⚠️ Miroir de `FONTS` dans
    // `supabase/functions/public-api/_shared/portalTheme.ts` et de l'énuméré
    // OpenAPI. En ajouter un est une décision PUBLIQUE — une entrée au journal
    // des API, pas une migration.
    expect([...FONT_IDS]).toEqual(["systeme", "nunito-sans", "rubik", "public-sans"]);
  });

  it("chaque entrée a son identifiant, dans l'ordre du catalogue", () => {
    expect(PORTAL_FONTS.map((font) => font.id)).toEqual([...FONT_IDS]);
  });

  it("chaque pile se termine par un repli générique", () => {
    // Une police web qui n'arrive pas ne doit pas laisser le navigateur choisir
    // seul : la page garde une famille sans empattement.
    for (const font of PORTAL_FONTS) {
      expect(font.stack).toMatch(/sans-serif$/);
    }
  });

  it("« Système » est la seule à ne rien télécharger", () => {
    expect(PORTAL_FONTS.filter((font) => !font.webfont).map((font) => font.id)).toEqual(["systeme"]);
  });
});

describe("fontById", () => {
  it("rend la police demandée", () => {
    expect(fontById("rubik").label).toBe("Rubik");
  });

  it("un identifiant inconnu rend le défaut — une page sans police n'a pas de sens", () => {
    expect(fontById("comic-sans").id).toBe(DEFAULT_FONT_ID);
    expect(fontById("").id).toBe(DEFAULT_FONT_ID);
  });
});

describe("isFontId", () => {
  it("ne reconnaît que le catalogue", () => {
    expect(isFontId("nunito-sans")).toBe(true);
    expect(isFontId("Nunito Sans")).toBe(false);
    expect(isFontId(42)).toBe(false);
    expect(isFontId(null)).toBe(false);
  });
});

describe("licence et hébergement", () => {
  it("⚠️ chaque police web du catalogue est auto-hébergée par le portail", () => {
    // Le critère d'entrée : un portail public ne RÉFÉRENCE pas une police, il
    // la sert à chaque visiteur. Les fichiers vivent donc dans `public/fonts/`,
    // sous OFL 1.1 — et jamais chez un tiers.
    for (const font of PORTAL_FONTS) {
      if (!font.webfont) continue;
      const family = font.stack.split(",")[0].replace(/'/g, "").trim();
      const slug = family.toLowerCase().replace(/ /g, "-");
      expect(existsSync(resolve("public/fonts/" + slug + "-latin.woff2"))).toBe(true);
    }
  });

  it("aucune police du catalogue n'est laissée sans explication", () => {
    for (const font of PORTAL_FONTS) {
      expect(font.note.length).toBeGreaterThan(20);
    }
  });
});
