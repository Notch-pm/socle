import { describe, expect, it } from "vitest";
import { contrastRatio, WHITE } from "./contrast";
import { applyPreset, defaultPortalTheme, type PortalTheme } from "./portalTheme";
import {
  contrastRows,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  formatRatio,
  DARK_TEXT_HALO,
  imageBackdropStyle,
  imageTextStyle,
  LIGHT_TEXT_HALO,

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
    // L'ancien vert de la gamme ne passait pas en TEXTE sur blanc (3,6 : 1) —
    // et un cran plus foncé suffit. C'est tout l'objet du correctif.
    const vif: ThemeBranding = { primaryColor: "#089b59", secondaryColor: "#ffcd57" };
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

  it("⚠️ le seuil se compare au rapport BRUT : 4,498 ne passe pas pour 4,5", () => {
    // L'ancien vert de la gamme sous l'encre sombre : arrondi, il passait « 4,5 ».
    const ancien: ThemeBranding = { primaryColor: "#089b59", secondaryColor: null };
    const row = contrastRows(defaultPortalTheme(), ancien).find((r) => r.id === "on-primary")!;
    expect(row.status).toBe("insufficient");
    expect(row.ratio).toBe(4.4);
    // Un cran plus foncé, le blanc repasse devant, et passe.
    expect(row.fix).toBe("darkPrimary");
  });

  it("le contour des champs tient 3 : 1 dans les deux jeux d'encres", () => {
    for (const highContrast of [false, true]) {
      const theme: PortalTheme = {
        ...defaultPortalTheme(),
        accessibility: { ...defaultPortalTheme().accessibility, highContrast },
      };
      const row = contrastRows(theme, CHARTE).find((r) => r.id === "field-border")!;
      expect(row.min).toBe(3);
      expect(row.status).toBe("ok");
      const colors = resolveThemeColors(theme, CHARTE);
      expect(contrastRatio(colors.fieldBorder, colors.surface)!).toBeGreaterThanOrEqual(3);
    }
  });

  it("⚠️ une collectivité SANS CHARTE est servie conforme", () => {
    // Le vert par défaut a été foncé pour ça (2026-09-18) : sans charte
    // publiée, le portail peint ce vert-là, et c'est le cas le plus courant
    // d'un domaine tout juste ouvert.
    for (const row of contrastRows(defaultPortalTheme(), null)) {
      if (row.id === "border") continue;
      expect([row.id, row.status]).toEqual([row.id, "ok"]);
    }
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

describe("le fond image d'un bloc", () => {
  it("rend `undefined` sans image : un bloc sans fond ne porte aucun style", () => {
    expect(imageBackdropStyle("", false)).toBeUndefined();
    expect(imageBackdropStyle("   ", true)).toBeUndefined();
  });

  // ⚠️ Le voile clair a été retiré le 2026-09-12 (décision produit) : la photo
  // se voit telle quelle, dans l'aperçu comme sur le site. Ce test l'épingle —
  // un dégradé qui reviendrait ici serait un voile reposé sans décision.
  it("ne pose QUE la photo, sans voile par-dessus", () => {
    const style = imageBackdropStyle("https://exemple.fr/a.jpg", false)!;
    expect(style.backgroundImage).not.toContain("linear-gradient");
    expect(style.backgroundImage).toBe('url("https://exemple.fr/a.jpg")');
    expect(style.backgroundSize).toBe("cover");
    expect(style.backgroundAttachment).toBe("scroll");
  });

  it("ancre l'image à la fenêtre quand elle est fixe", () => {
    expect(imageBackdropStyle("https://exemple.fr/a.jpg", true)!.backgroundAttachment).toBe("fixed");
  });

  it("échappe l'adresse : un guillemet ne doit pas casser la valeur CSS", () => {
    // ⚠️ `IMAGE_URL` autorise le guillemet (elle ne refuse que les espaces).
    // Sans échappement, le navigateur rejetterait la déclaration entière et le
    // fond disparaîtrait sans que rien ne le dise.
    const style = imageBackdropStyle('https://exemple.fr/a".jpg', false)!;
    expect(style.backgroundImage).toContain('url("https://exemple.fr/a\\".jpg")');
  });

  // ⚠️ CE QUE LE RETRAIT DU VOILE A COÛTÉ, mesuré et épinglé — la décision est
  // produit (2026-09-12), la conséquence est factuelle : il n'y a PLUS AUCUNE
  // garantie de lisibilité sur une image. Le voile assurait 5,7 : 1 quelle que
  // soit la photo ; sur un gris moyen, qui tient lieu de photo quelconque,
  // l'encre pleine elle-même tombe à 4,1 : 1, sous le seuil AA. L'aperçu de
  // l'éditeur montre donc, fidèlement, quelque chose qui n'est plus garanti.
  it("dit ce que le retrait du voile a coûté sur une image", () => {
    const photo = "#808080";
    const { ink, muted } = resolveThemeColors(defaultPortalTheme(), CHARTE);
    expect(contrastRatio(ink, photo)!).toBeLessThan(4.5);
    expect(contrastRatio(ink, photo)!).toBeGreaterThan(contrastRatio(muted, photo)!);
  });
});

describe("les textes posés sur une image", () => {
  it("ne change rien par défaut : encre du thème, sans ombre", () => {
    expect(imageTextStyle("theme", false)).toBeUndefined();
  });

  it("passe le texte en blanc", () => {
    expect(imageTextStyle("white", false)).toEqual({ color: "#ffffff" });
  });

  it("l'ombre part de tous les côtés : aucun décalage, seulement du flou", () => {
    for (const halo of [DARK_TEXT_HALO, LIGHT_TEXT_HALO]) {
      for (const layer of halo.split(/,\s*(?![^(]*\))/)) expect(layer.startsWith("0 0 ")).toBe(true);
    }
  });

  it("l'ombre prend le contre-pied du texte : sombre sous le blanc, claire sous l'encre", () => {
    expect(imageTextStyle("white", true)).toEqual({ color: "#ffffff", textShadow: DARK_TEXT_HALO });
    expect(imageTextStyle("theme", true)).toEqual({ textShadow: LIGHT_TEXT_HALO });
  });
});
