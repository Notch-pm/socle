import { describe, expect, it } from "vitest";
import {
  applyPreset,
  defaultPortalTheme,
  MAX_DECLARATION_LENGTH,
  parsePortalTheme,
  presetName,
  PRESETS,
  type PortalTheme,
} from "./portalTheme";

describe("defaultPortalTheme", () => {
  it("n'active aucun correctif d'accessibilité, mais affiche la mention et son lien", () => {
    const theme = defaultPortalTheme();
    expect(theme.accessibility).toEqual({
      highContrast: false,
      darkPrimary: false,
      // La mention est obligatoire pour un site public : ce n'est pas un
      // correctif, c'est le cas normal.
      declarationEnabled: true,
      declaration: "",
      declarationLink: true,
    });
  });

  it("ne porte aucune couleur — elles vivent dans la charte graphique", () => {
    expect(JSON.stringify(defaultPortalTheme())).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

describe("parsePortalTheme", () => {
  it("rend les défauts pour ce qui n'est pas un objet", () => {
    for (const raw of [null, undefined, "thème", 42, []]) {
      expect(parsePortalTheme(raw)).toEqual(defaultPortalTheme());
    }
  });

  it("relit ce qu'il a écrit", () => {
    const theme = applyPreset(defaultPortalTheme(), "Vitrine centrée");
    expect(parsePortalTheme(JSON.parse(JSON.stringify(theme)))).toEqual(theme);
  });

  it("⚠️ une valeur inconnue retombe sur SON défaut, sans emporter ses voisines", () => {
    const parsed = parsePortalTheme({
      typography: { font: "comic-sans", scale: "comfortable" },
      shapes: { radius: "round", shadow: 7, density: "airy" },
      header: { fill: "color", color: "mauve", logo: "center" },
      accessibility: { highContrast: true, darkPrimary: "oui", declaration: "Audit du 12 juin" },
    });

    // Ce qui était lisible est conservé…
    expect(parsed.typography.scale).toBe("comfortable");
    expect(parsed.shapes.radius).toBe("round");
    expect(parsed.shapes.density).toBe("airy");
    expect(parsed.header.fill).toBe("color");
    expect(parsed.header.logo).toBe("center");
    expect(parsed.accessibility.highContrast).toBe(true);
    expect(parsed.accessibility.declaration).toBe("Audit du 12 juin");
    // …et seul le champ fautif revient à son défaut.
    expect(parsed.typography.font).toBe(defaultPortalTheme().typography.font);
    expect(parsed.shapes.shadow).toBe(defaultPortalTheme().shapes.shadow);
    expect(parsed.header.color).toBe(defaultPortalTheme().header.color);
    expect(parsed.accessibility.darkPrimary).toBe(false);
  });

  it("un bloc entier illisible ne fait pas tomber les autres", () => {
    const parsed = parsePortalTheme({
      typography: "n'importe quoi",
      shapes: { radius: "square", shadow: "strong", density: "compact" },
    });
    expect(parsed.typography).toEqual(defaultPortalTheme().typography);
    expect(parsed.shapes.radius).toBe("square");
    expect(parsed.shapes.shadow).toBe("strong");
  });

  it("un bloc absent prend ses défauts", () => {
    expect(parsePortalTheme({ shapes: { radius: "square" } })).toMatchObject({
      typography: defaultPortalTheme().typography,
      header: defaultPortalTheme().header,
      shapes: { radius: "square", shadow: "soft", density: "standard" },
    });
  });

  it("⚠️ un thème d'avant les deux commutateurs garde sa mention affichée, et gagne le lien", () => {
    // Deux collectivités avaient publié une mention le 2026-09-18, sans aucun de
    // ces deux champs : les lire « masquée » l'aurait effacée de leur site.
    const parsed = parsePortalTheme({
      accessibility: { highContrast: false, darkPrimary: false, declaration: "Audit du 12 juin" },
    });
    expect(parsed.accessibility.declarationEnabled).toBe(true);
    expect(parsed.accessibility.declaration).toBe("Audit du 12 juin");
    expect(parsed.accessibility.declarationLink).toBe(true);
  });

  it("relit une mention masquée sans perdre son texte ni son lien", () => {
    // Le commutateur gouverne l'usage, pas la donnée : le retour en arrière est
    // gratuit.
    const parsed = parsePortalTheme({
      accessibility: { declarationEnabled: false, declaration: "Audit", declarationLink: false },
    });
    expect(parsed.accessibility).toMatchObject({
      declarationEnabled: false,
      declaration: "Audit",
      declarationLink: false,
    });
  });

  it("un commutateur illisible retombe sur son défaut — affiché", () => {
    const parsed = parsePortalTheme({
      accessibility: { declarationEnabled: "non", declarationLink: 0 },
    });
    expect(parsed.accessibility.declarationEnabled).toBe(true);
    expect(parsed.accessibility.declarationLink).toBe(true);
  });

  it("écarte une déclaration démesurée plutôt que de la tronquer à moitié", () => {
    const parsed = parsePortalTheme({
      accessibility: { declaration: "a".repeat(MAX_DECLARATION_LENGTH + 1) },
    });
    expect(parsed.accessibility.declaration).toBe("");
  });

  it("ignore les clés qu'il ne connaît pas", () => {
    const parsed = parsePortalTheme({ ...defaultPortalTheme(), couleurPrincipale: "#ff0000" });
    expect(parsed).not.toHaveProperty("couleurPrincipale");
  });
});

describe("préréglages", () => {
  it("chaque préréglage se reconnaît lui-même", () => {
    for (const preset of PRESETS) {
      expect(presetName(applyPreset(defaultPortalTheme(), preset.name))).toBe(preset.name);
    }
  });

  it("⚠️ le moindre écart rend « Personnalisé » — le nom est déduit, jamais stocké", () => {
    const theme = applyPreset(defaultPortalTheme(), "Chaleureux");
    expect(presetName({ ...theme, shapes: { ...theme.shapes, shadow: "strong" } })).toBeNull();
  });

  it("un nom inconnu ne change rien", () => {
    const theme = defaultPortalTheme();
    expect(applyPreset(theme, "Bleu Klein")).toBe(theme);
  });

  it("⚠️ la mention d'accessibilité et « assombrir » survivent au préréglage", () => {
    const base: PortalTheme = {
      ...defaultPortalTheme(),
      accessibility: {
        highContrast: false,
        darkPrimary: true,
        declarationEnabled: false,
        declaration: "Conformité RGAA partielle",
        declarationLink: false,
      },
    };
    const applied = applyPreset(base, "Sobre institutionnel");
    // Le premier est un texte que la collectivité a écrit, le second corrige SA
    // couleur : ni l'un ni l'autre ne relève d'un choix d'apparence.
    expect(applied.accessibility.declaration).toBe("Conformité RGAA partielle");
    expect(applied.accessibility.declarationEnabled).toBe(false);
    expect(applied.accessibility.declarationLink).toBe(false);
    expect(applied.accessibility.darkPrimary).toBe(true);
    // Le contraste renforcé, lui, fait partie du préréglage.
    expect(applied.accessibility.highContrast).toBe(false);
    expect(applyPreset(base, "Contrasté").accessibility.highContrast).toBe(true);
  });
});

describe("réglages conservés", () => {
  it("⚠️ la couleur du bandeau et le logo blanc survivent au retour au fond blanc", () => {
    // Le commutateur gouverne l'USAGE, pas la donnée (motif `email_sender_name`,
    // `publicationPeriodEnabled`) : le retour en arrière doit être gratuit.
    const colored: PortalTheme = {
      ...defaultPortalTheme(),
      header: {
        ...defaultPortalTheme().header,
        fill: "color",
        color: "secondary",
        logoWhite: false,
      },
    };
    const white: PortalTheme = { ...colored, header: { ...colored.header, fill: "white" } };
    const relu = parsePortalTheme(JSON.parse(JSON.stringify(white)));
    expect(relu.header.color).toBe("secondary");
    expect(relu.header.logoWhite).toBe(false);
  });
});
