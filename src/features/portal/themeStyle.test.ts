import { describe, expect, it } from "vitest";
import { contrastRatio, WHITE } from "./contrast";
import { applyPreset, defaultPortalTheme, type PortalTheme } from "./portalTheme";
import {
  contrastRows,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  formatRatio,
  resolveThemeColors,
  themeCssVariables,
  type ThemeBranding,
} from "./themeStyle";

const CHARTE: ThemeBranding = { primaryColor: "#2f6fd0", secondaryColor: "#ffcd57" };

function vars(theme: PortalTheme, branding: ThemeBranding | null = CHARTE, largeText = false) {
  return themeCssVariables(theme, branding, { largeText }) as unknown as Record<string, string>;
}

describe("les couleurs viennent de la charte", () => {
  it("la couleur principale du site EST celle de l'organisation", () => {
    expect(resolveThemeColors(defaultPortalTheme(), CHARTE).primary).toBe("#2f6fd0");
  });

  it("sans charte, on retombe sur celle de la gamme", () => {
    const colors = resolveThemeColors(defaultPortalTheme(), null);
    expect(colors.primary).toBe(DEFAULT_PRIMARY);
    expect(colors.accent).toBe(DEFAULT_SECONDARY);
  });

  it("champ par champ : une couleur manquante n'emporte pas l'autre", () => {
    const colors = resolveThemeColors(defaultPortalTheme(), {
      primaryColor: "#2f6fd0",
      secondaryColor: null,
    });
    expect(colors.primary).toBe("#2f6fd0");
    expect(colors.accent).toBe(DEFAULT_SECONDARY);
  });

  it("une couleur illisible vaut absente : on ne peint pas une valeur inventée", () => {
    const colors = resolveThemeColors(defaultPortalTheme(), {
      primaryColor: "bleu roi",
      secondaryColor: "#FFCD57",
    });
    expect(colors.primary).toBe(DEFAULT_PRIMARY);
    // `#FFCD57` en majuscules n'est pas la forme stockée — écartée elle aussi.
    expect(colors.accent).toBe(DEFAULT_SECONDARY);
  });

  it("l'encre posée sur la couleur principale est toujours lisible", () => {
    for (const primary of ["#2f6fd0", "#ffcd57", "#000000", "#ffffff"]) {
      const colors = resolveThemeColors(defaultPortalTheme(), {
        primaryColor: primary,
        secondaryColor: null,
      });
      expect(contrastRatio(colors.onPrimary, colors.primary)!).toBeGreaterThan(4.5);
    }
  });
});

describe("themeCssVariables", () => {
  it("l'échelle de texte agit sur toutes les tailles", () => {
    const standard = vars(defaultPortalTheme());
    const compact = vars({
      ...defaultPortalTheme(),
      typography: { font: "systeme", scale: "compact" },
    });
    expect(standard["--pt-h1"]).toBe("30px");
    expect(compact["--pt-h1"]).toBe("28px");
    expect(compact["--pt-body"]).toBe("13px");
  });

  it("⚠️ « Aperçu gros texte » agrandit le rendu mais n'est PAS dans le thème", () => {
    const theme = defaultPortalTheme();
    const grand = vars(theme, CHARTE, true);
    expect(grand["--pt-h1"]).toBe("35px");
    // Le thème est intact : rien à enregistrer, rien à publier.
    expect(theme).toEqual(defaultPortalTheme());
  });

  it("la densité agit sur les espacements, pas sur les textes", () => {
    const airy = vars({
      ...defaultPortalTheme(),
      shapes: { radius: "soft", shadow: "soft", density: "airy" },
    });
    expect(airy["--pt-gap"]).toBe("28px");
    expect(airy["--pt-body"]).toBe("14px");
  });

  it("les angles descendent en deux rayons cohérents", () => {
    const round = vars({
      ...defaultPortalTheme(),
      shapes: { radius: "round", shadow: "none", density: "standard" },
    });
    expect(round["--pt-radius"]).toBe("18px");
    expect(round["--pt-radius-sm"]).toBe("14px");
    expect(round["--pt-shadow"]).toBe("none");
  });

  it("un bandeau blanc garde l'encre de la page ; un bandeau coloré en prend une lisible", () => {
    const white = vars(defaultPortalTheme());
    expect(white["--pt-header-surface"]).toBe("#ffffff");

    const colored = vars(applyPreset(defaultPortalTheme(), "Vitrine centrée"));
    expect(colored["--pt-header-surface"]).toBe("#2f6fd0");
    expect(contrastRatio(colored["--pt-header-ink"], colored["--pt-header-surface"])!).toBeGreaterThan(4.5);
    expect(colored["--pt-header-direction"]).toBe("column");
  });

  it("le menu en pilules est le seul à porter un fond et un rayon", () => {
    const text = vars(defaultPortalTheme());
    expect(text["--pt-nav-bg"]).toBe("transparent");
    expect(text["--pt-nav-radius"]).toBe("0");

    const pills = vars({
      ...defaultPortalTheme(),
      header: { ...defaultPortalTheme().header, menu: "pills" },
    });
    expect(pills["--pt-nav-bg"]).not.toBe("transparent");
    expect(pills["--pt-nav-radius"]).toBe("999px");
  });
});

describe("contrôle des contrastes", () => {
  it("mesure les couleurs RÉELLES de la collectivité", () => {
    const vif: ThemeBranding = { primaryColor: "#3ddc84", secondaryColor: "#ffcd57" };
    const row = contrastRows(defaultPortalTheme(), vif).find((r) => r.id === "primary-text")!;
    expect(row.status).toBe("insufficient");
    expect(row.min).toBe(4.5);
  });

  it("⚠️ « assombrir » n'est proposé que s'il corrige vraiment, et il corrige", () => {
    // Le vert de la gamme lui-même ne passe pas en TEXTE sur blanc (3,6 : 1) —
    // et un cran plus foncé suffit. C'est tout l'objet du correctif.
    const vif: ThemeBranding = { primaryColor: DEFAULT_PRIMARY, secondaryColor: "#ffcd57" };
    const avant = contrastRows(defaultPortalTheme(), vif).find((r) => r.id === "primary-text")!;
    expect(avant.status).toBe("insufficient");
    expect(avant.fix).toBe("darkPrimary");

    const corrige: PortalTheme = {
      ...defaultPortalTheme(),
      accessibility: { ...defaultPortalTheme().accessibility, darkPrimary: true },
    };
    const apres = contrastRows(corrige, vif).find((r) => r.id === "primary-text")!;
    expect(apres.status).toBe("ok");
    expect(apres.ratio).toBeGreaterThan(avant.ratio);
    // Et le correctif ne se propose plus une fois appliqué.
    expect(apres.fix).toBeUndefined();
  });

  it("⚠️ une couleur qu'un cran ne sauverait pas ne porte AUCUN bouton", () => {
    // Un bouton qui ne corrige rien est pire que pas de bouton : il ferait
    // croire le problème traité. Ici, la bonne réponse est de changer la
    // couleur dans « Charte graphique » — ce que dit le pied du panneau.
    const pale: ThemeBranding = { primaryColor: "#3ddc84", secondaryColor: "#ffcd57" };
    const row = contrastRows(defaultPortalTheme(), pale).find((r) => r.id === "primary-text")!;
    expect(row.status).toBe("insufficient");
    expect(row.fix).toBeUndefined();
  });

  it("les bordures sont décoratives sous leur seuil, pas fautives", () => {
    const row = contrastRows(defaultPortalTheme(), CHARTE).find((r) => r.id === "border")!;
    expect(row.min).toBe(3);
    expect(row.status).toBe("decorative");
  });

  it("la ligne du bandeau n'existe que s'il est coloré", () => {
    const ids = (theme: PortalTheme) => contrastRows(theme, CHARTE).map((r) => r.id);
    expect(ids(defaultPortalTheme())).not.toContain("header-menu");
    expect(ids(applyPreset(defaultPortalTheme(), "Vitrine centrée"))).toContain("header-menu");
  });

  it("le texte courant et le blanc passent le seuil dans les deux jeux d'encres", () => {
    for (const highContrast of [false, true]) {
      const theme: PortalTheme = {
        ...defaultPortalTheme(),
        accessibility: { ...defaultPortalTheme().accessibility, highContrast },
      };
      const rows = contrastRows(theme, CHARTE);
      expect(rows.find((r) => r.id === "body-text")!.status).toBe("ok");
      expect(rows.find((r) => r.id === "muted-text")!.status).toBe("ok");
    }
  });

  it("le contraste renforcé fonce aussi la couleur principale", () => {
    const normal = resolveThemeColors(defaultPortalTheme(), CHARTE).primary;
    const fort = resolveThemeColors(
      {
        ...defaultPortalTheme(),
        accessibility: { ...defaultPortalTheme().accessibility, highContrast: true },
      },
      CHARTE,
    ).primary;
    expect(contrastRatio(fort, WHITE)!).toBeGreaterThan(contrastRatio(normal, WHITE)!);
  });
});

describe("formatRatio", () => {
  it("écrit un rapport à la française", () => {
    expect(formatRatio(4.53)).toBe("4,5 : 1");
    expect(formatRatio(21)).toBe("21,0 : 1");
  });
});
