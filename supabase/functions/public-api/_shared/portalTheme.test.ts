import { describe, expect, it } from "vitest";
import { defaultPortalThemeDto, serializePortalTheme } from "./portalTheme.ts";

/**
 * ⚠️ **Miroir volontaire** de `src/features/portal/portalTheme.test.ts`. Les
 * deux suites épinglent les mêmes règles sur le même JSON — c'est la seule
 * chose qui garantit que l'éditeur et l'API lisent la même colonne de la même
 * façon. Un test ajouté d'un côté appelle son jumeau de l'autre.
 */
describe("serializePortalTheme — ce qui n'est pas un thème", () => {
  it("rend les défauts, jamais null", () => {
    for (const raw of [null, undefined, "thème", 42, []]) {
      expect(serializePortalTheme(raw)).toEqual(defaultPortalThemeDto());
    }
  });

  it("les défauts n'activent aucun correctif d'accessibilité", () => {
    expect(defaultPortalThemeDto().accessibility).toEqual({
      high_contrast: false,
      dark_primary: false,
      declaration: "",
    });
  });

  it("aucune couleur ne franchit — elles vivent dans la charte graphique", () => {
    const dto = serializePortalTheme({
      typography: { font: "rubik" },
      // Une couleur écrite dans la colonne par erreur ne doit pas ressortir.
      primaryColor: "#ff0000",
      colors: { primary: "#ff0000" },
    });
    expect(JSON.stringify(dto)).not.toMatch(/#[0-9a-f]{6}/i);
    expect(dto).not.toHaveProperty("primaryColor");
    expect(dto).not.toHaveProperty("colors");
  });
});

describe("serializePortalTheme — tolérance champ par champ", () => {
  it("⚠️ une valeur inconnue retombe sur SON défaut, sans emporter ses voisines", () => {
    const dto = serializePortalTheme({
      typography: { font: "comic-sans", scale: "comfortable" },
      shapes: { radius: "round", shadow: 7, density: "airy" },
      header: { fill: "color", color: "mauve", logo: "center" },
      accessibility: { highContrast: true, darkPrimary: "oui", declaration: "Audit du 12 juin" },
    });

    expect(dto.typography.text_scale).toBe("comfortable");
    expect(dto.shapes.radius).toBe("round");
    expect(dto.shapes.density).toBe("airy");
    expect(dto.header.fill).toBe("color");
    expect(dto.header.logo).toBe("center");
    expect(dto.accessibility.high_contrast).toBe(true);
    expect(dto.accessibility.declaration).toBe("Audit du 12 juin");

    expect(dto.typography.font).toBe(defaultPortalThemeDto().typography.font);
    expect(dto.shapes.shadow).toBe(defaultPortalThemeDto().shapes.shadow);
    expect(dto.header.color).toBe(defaultPortalThemeDto().header.color);
    expect(dto.accessibility.dark_primary).toBe(false);
  });

  it("un bloc illisible ou absent prend ses défauts, les autres restent", () => {
    const dto = serializePortalTheme({
      typography: "n'importe quoi",
      shapes: { radius: "square", shadow: "strong", density: "compact" },
    });
    expect(dto.typography).toEqual(defaultPortalThemeDto().typography);
    expect(dto.header).toEqual(defaultPortalThemeDto().header);
    expect(dto.shapes).toEqual({ radius: "square", shadow: "strong", density: "compact" });
  });

  it("écarte une déclaration démesurée plutôt que de la tronquer à moitié", () => {
    const dto = serializePortalTheme({ accessibility: { declaration: "a".repeat(301) } });
    expect(dto.accessibility.declaration).toBe("");
  });
});

describe("serializePortalTheme — la traduction camelCase → snake_case", () => {
  it("renomme les clés du schéma possédé vers celles du contrat", () => {
    const dto = serializePortalTheme({
      typography: { scale: "compact" },
      header: { logoWhite: false },
      accessibility: { highContrast: true, darkPrimary: true },
    });
    expect(dto.typography.text_scale).toBe("compact");
    expect(dto.header.logo_white).toBe(false);
    expect(dto.accessibility.high_contrast).toBe(true);
    expect(dto.accessibility.dark_primary).toBe(true);
  });

  it("ne lit PAS les clés déjà en snake_case : la colonne est en camelCase", () => {
    // La conversion est à sens unique. Accepter les deux formes ferait croire
    // qu'on peut écrire l'une ou l'autre en base.
    const dto = serializePortalTheme({
      typography: { text_scale: "compact" },
      header: { logo_white: false },
    });
    expect(dto.typography.text_scale).toBe("standard");
    expect(dto.header.logo_white).toBe(true);
  });

  it("l'ensemble des clés servies est fermé et connu", () => {
    const dto = serializePortalTheme({ n: "importe quoi" });
    expect(Object.keys(dto).sort()).toEqual(["accessibility", "header", "shapes", "typography"]);
    expect(Object.keys(dto.typography).sort()).toEqual(["font", "text_scale"]);
    expect(Object.keys(dto.shapes).sort()).toEqual(["density", "radius", "shadow"]);
    expect(Object.keys(dto.header).sort()).toEqual([
      "account",
      "color",
      "fill",
      "logo",
      "logo_white",
      "menu",
      "sticky",
    ]);
    expect(Object.keys(dto.accessibility).sort()).toEqual([
      "dark_primary",
      "declaration",
      "high_contrast",
    ]);
  });

  it("les quatre polices du catalogue traversent, et rien d'autre", () => {
    // ⚠️ Miroir de `FONT_IDS` (`src/features/portal/portalFonts.ts`) : ces
    // identifiants SONT le contrat de nommage. En ajouter un est une décision
    // publique, donc une entrée au journal des API.
    for (const font of ["systeme", "nunito-sans", "rubik", "public-sans"]) {
      expect(serializePortalTheme({ typography: { font } }).typography.font).toBe(font);
    }
    expect(serializePortalTheme({ typography: { font: "Inter" } }).typography.font).toBe(
      defaultPortalThemeDto().typography.font,
    );
  });
});
