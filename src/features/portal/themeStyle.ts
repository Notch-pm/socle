/**
 * Du thème aux pixels : la palette dérivée, les variables CSS de la page, et le
 * contrôle des contrastes.
 *
 * ⚠️ **C'EST LE POINT DE PERFORMANCE DE TOUTE LA FONCTIONNALITÉ.** Le thème ne
 * descend PAS en props dans les sections : il produit **un seul objet de style**
 * posé sur la racine de la page, et les composants lisent des variables CSS.
 * Bouger un curseur change alors un objet, pas sept arbres de composants — et
 * côté portail, tout ce fichier tient en quelques centaines d'octets de CSS,
 * sans une requête de plus. La seule exception est la POLICE, qui se télécharge
 * (voir `portalFonts.ts`).
 *
 * ⚠️ **Les couleurs viennent de la CHARTE de la collectivité**, jamais du
 * thème (`portalTheme.ts` n'en porte aucune). Ce fichier en dérive tout le
 * reste — teintes douces, encres lisibles, bandeau — pour qu'une collectivité
 * n'ait à choisir que deux couleurs et les retrouve partout, cohérentes.
 *
 * ⚠️ **Séparé de `portalTheme.ts` à dessein** : le schéma est un contrat public,
 * miroité côté edge function ; cette dérivation-là est un choix de RENDU, propre
 * au Socle et à Nora. Les mélanger ferait croire que les valeurs calculées ici
 * font partie du contrat.
 */
import type { CSSProperties } from "react";
import {
  contrastRatio,
  darkenColor,
  HEX_COLOR,
  readableInk,
  WHITE,
  withAlpha,
} from "./contrast";
import { fontById } from "./portalFonts";
import type { PortalTheme } from "./portalTheme";

// ── Les échelles ────────────────────────────────────────────────────────────

const SCALE_FACTOR = { compact: 0.92, standard: 1, comfortable: 1.12 } as const;
const DENSITY_FACTOR = { compact: 0.78, standard: 1, airy: 1.28 } as const;
/**
 * Le rayon de chaque réglage d'angles, en pixels. Exporté parce que la vignette
 * d'un préréglage le dessine : deux tables donneraient deux vérités, et la
 * vignette finirait par mentir sur ce que le préréglage applique.
 */
export const THEME_RADIUS_PX = { square: 2, soft: 10, round: 18 } as const;

/** Les ombres du design system de la gamme (`tailwind.config.ts`). */
const SHADOW_CSS = {
  none: "none",
  soft: "0 1px 2px 0 hsl(220 20% 10% / 0.05)",
  strong: "0 8px 24px -4px hsl(220 20% 10% / 0.12)",
} as const;

/**
 * Le facteur du réglage « texte agrandi » d'un usager.
 *
 * ⚠️ Il ne sert qu'à l'APERÇU de l'éditeur : c'est une simulation, pas un
 * réglage de site. Il n'est pas dans `PortalTheme` et ne s'enregistre pas — le
 * persister imposerait à tous les visiteurs un grossissement que seuls certains
 * demandent, et qui entrerait en conflit avec le zoom de leur navigateur.
 */
const LARGE_TEXT_FACTOR = 1.15;

/** Tailles de texte de référence, en pixels, avant échelle. */
const TYPE_SCALE = { h1: 30, h2: 19, body: 14, small: 12, tiny: 11 } as const;

/** Espacements de référence, en pixels, avant densité. */
const SPACING = { gap: 22, pad: 20, cardPad: 14 } as const;

// ── Les encres ──────────────────────────────────────────────────────────────
//
// Les neutres du portail, en deux jeux : l'ordinaire, et celui du contraste
// renforcé. Ce sont les seules couleurs FIGÉES du rendu — un gris de texte
// n'appartient pas à la charte d'une collectivité, il appartient à la
// lisibilité.

const NEUTRALS = {
  normal: { ink: "#1c2220", muted: "#5c6663", border: "#e4e7e6", surface: "#f1f4f3" },
  contrast: { ink: "#0d1210", muted: "#3d4844", border: "#acb9b5", surface: "#e6ebe9" },
} as const;

/** Le vert de la gamme et son jaune, faute de charte — mêmes valeurs que Nora. */
export const DEFAULT_PRIMARY = "#089b59";
export const DEFAULT_SECONDARY = "#ffcd57";

export interface ThemeBranding {
  primaryColor: string | null;
  secondaryColor: string | null;
}

/**
 * Les deux couleurs de la charte, ramenées à quelque chose de peignable.
 *
 * Une couleur absente ou illisible retombe sur celle de la gamme, **champ par
 * champ** : une collectivité qui n'a défini que sa couleur principale ne perd
 * pas sa secondaire au passage (motif `brandingStyle` chez Nora).
 */
function brandColors(branding: ThemeBranding | null): { primary: string; secondary: string } {
  const read = (value: string | null | undefined, fallback: string) => {
    const color = (value ?? "").trim().toLowerCase();
    return HEX_COLOR.test(color) ? color : fallback;
  };
  return {
    primary: read(branding?.primaryColor, DEFAULT_PRIMARY),
    secondary: read(branding?.secondaryColor, DEFAULT_SECONDARY),
  };
}

export interface ThemeColors {
  ink: string;
  muted: string;
  border: string;
  /** Aplat neutre très clair : puces, vignettes, fonds de repos. */
  surface: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  accent: string;
  /** L'aplat doux du bandeau texte — la couleur secondaire, très diluée. */
  accentSoft: string;
  accentInk: string;
  headerSurface: string;
  headerInk: string;
  headerMuted: string;
  headerBorder: string;
  navBackground: string;
  accountBackground: string;
  accountForeground: string;
  accountBorder: string;
  markBackground: string;
  markForeground: string;
}

/**
 * Toute la palette du site, dérivée du thème et de la charte.
 *
 * Exportée parce que le contrôle des contrastes mesure EXACTEMENT ces
 * couleurs-là — celles qui seront peintes. Un diagnostic qui mesurerait autre
 * chose que ce qu'on affiche ne diagnostiquerait rien.
 */
export function resolveThemeColors(
  theme: PortalTheme,
  branding: ThemeBranding | null,
): ThemeColors {
  const brand = brandColors(branding);
  const strong = theme.accessibility.highContrast;
  const neutrals = strong ? NEUTRALS.contrast : NEUTRALS.normal;
  const { ink, muted, border, surface } = neutrals;

  // `highContrast` fonce la couleur principale comme le fait `darkPrimary` :
  // c'est le même geste, demandé pour la même raison.
  const darken = theme.accessibility.darkPrimary || strong;
  const primary = darken ? darkenColor(brand.primary) : brand.primary;
  const accent = brand.secondary;

  const filled = theme.header.fill === "color";
  const headerSurface = filled ? (theme.header.color === "secondary" ? accent : primary) : WHITE;
  const headerInk = filled ? readableInk(headerSurface, ink) : ink;
  const prominent = theme.header.account === "prominent";

  return {
    ink,
    muted,
    border,
    surface,
    primary,
    primarySoft: withAlpha(primary, strong ? 0.14 : 0.08),
    onPrimary: readableInk(primary, ink),
    accent,
    accentSoft: withAlpha(accent, strong ? 0.5 : 0.35),
    accentInk: readableInk(accent, ink),
    headerSurface,
    headerInk,
    // L'encre secondaire du bandeau : la même encre, adoucie. Une couleur
    // choisie à la main jurerait avec la moitié des chartes.
    headerMuted: filled ? withAlpha(headerInk, 0.78) : muted,
    headerBorder: filled ? "transparent" : border,
    navBackground:
      theme.header.menu === "pills"
        ? filled
          ? withAlpha(headerInk, 0.14)
          : withAlpha(primary, 0.08)
        : "transparent",
    // Mis en avant : la pastille inverse le bandeau (blanche sur un bandeau
    // vert, sombre sur un bandeau jaune) ; discret : elle n'est qu'un contour.
    accountBackground: prominent ? (filled ? headerInk : primary) : "transparent",
    accountForeground: prominent
      ? filled
        ? headerSurface
        : readableInk(primary, ink)
      : headerInk,
    accountBorder: prominent
      ? filled
        ? headerInk
        : primary
      : filled
        ? withAlpha(headerInk, 0.5)
        : "transparent",
    // Le carré du logo, quand la collectivité n'en a pas. Sur un bandeau
    // coloré et sans logo blanc, on le pose en sombre : un carré vert sur un
    // bandeau vert ne se verrait pas.
    markBackground: filled ? (theme.header.logoWhite ? headerInk : ink) : primary,
    markForeground: filled
      ? theme.header.logoWhite
        ? headerSurface
        : WHITE
      : readableInk(primary, ink),
  };
}

export interface ThemeStyleOptions {
  /** Simulation « texte agrandi » de l'éditeur — jamais enregistrée. */
  largeText?: boolean;
}

/**
 * Les variables CSS à poser sur la racine de la page.
 *
 * Préfixe `--pt-` (portal theme), court pour rester lisible dans les valeurs
 * arbitraires de Tailwind : `rounded-[var(--pt-radius)]`.
 */
export function themeCssVariables(
  theme: PortalTheme,
  branding: ThemeBranding | null,
  options: ThemeStyleOptions = {},
): CSSProperties {
  const colors = resolveThemeColors(theme, branding);
  const type =
    SCALE_FACTOR[theme.typography.scale] * (options.largeText ? LARGE_TEXT_FACTOR : 1);
  const density = DENSITY_FACTOR[theme.shapes.density];
  const radius = THEME_RADIUS_PX[theme.shapes.radius];
  const px = (base: number, factor: number) => `${Math.round(base * factor)}px`;

  const centered = theme.header.logo === "center";
  const pills = theme.header.menu === "pills";

  const vars: Record<string, string> = {
    "--pt-font": fontById(theme.typography.font).stack,

    "--pt-radius": `${radius}px`,
    "--pt-radius-sm": `${Math.max(2, radius - 4)}px`,
    "--pt-shadow": SHADOW_CSS[theme.shapes.shadow],

    "--pt-h1": px(TYPE_SCALE.h1, type),
    "--pt-h2": px(TYPE_SCALE.h2, type),
    "--pt-body": px(TYPE_SCALE.body, type),
    "--pt-small": px(TYPE_SCALE.small, type),
    "--pt-tiny": px(TYPE_SCALE.tiny, type),

    "--pt-gap": px(SPACING.gap, density),
    "--pt-pad": px(SPACING.pad, density),
    "--pt-card-pad": px(SPACING.cardPad, density),

    "--pt-ink": colors.ink,
    "--pt-muted": colors.muted,
    "--pt-border": colors.border,
    "--pt-surface": colors.surface,
    "--pt-primary": colors.primary,
    "--pt-primary-soft": colors.primarySoft,
    "--pt-on-primary": colors.onPrimary,
    "--pt-accent": colors.accent,
    "--pt-accent-soft": colors.accentSoft,
    "--pt-accent-ink": colors.accentInk,

    "--pt-header-surface": colors.headerSurface,
    "--pt-header-ink": colors.headerInk,
    "--pt-header-muted": colors.headerMuted,
    "--pt-header-border": colors.headerBorder,
    "--pt-header-direction": centered ? "column" : "row",
    "--pt-header-gap": centered ? "10px" : "14px",
    "--pt-header-pad": centered ? "16px 24px" : "0 24px",
    // Le bandeau suit la densité, mais ne descend jamais sous sa hauteur de
    // référence : un en-tête compact reste un en-tête cliquable.
    "--pt-header-height": centered
      ? "auto"
      : px(56, Math.max(1, density * 0.95)),

    "--pt-nav-bg": colors.navBackground,
    "--pt-nav-pad": pills ? "6px 12px" : "0",
    "--pt-nav-radius": pills ? "999px" : "0",

    "--pt-account-bg": colors.accountBackground,
    "--pt-account-fg": colors.accountForeground,
    "--pt-account-border": colors.accountBorder,
    "--pt-account-pad": theme.header.account === "prominent" ? "8px 14px" : "8px 2px",

    "--pt-mark-bg": colors.markBackground,
    "--pt-mark-fg": colors.markForeground,
  };

  // Les propriétés personnalisées ne sont pas dans le type `CSSProperties` ;
  // React les transmet pourtant telles quelles (motif `brandingStyle` de Nora).
  return vars as CSSProperties;
}

// ── Contrôle des contrastes ─────────────────────────────────────────────────

export type ContrastStatus = "ok" | "insufficient" | "decorative";

export interface ContrastRow {
  id: string;
  label: string;
  /** Rapport WCAG, arrondi au dixième. */
  ratio: number;
  /** Seuil applicable : 4,5 pour du texte, 3 pour un élément d'interface. */
  min: number;
  status: ContrastStatus;
  /**
   * Le réglage du thème qui corrigerait la ligne — proposé UNIQUEMENT quand il
   * la fait effectivement passer. Un bouton qui ne corrige rien est pire que
   * pas de bouton : il fait croire que le problème est traité.
   */
  fix?: "darkPrimary";
}

interface RowSpec {
  id: string;
  label: string;
  foreground: string;
  background: string;
  min: number;
  /** Un séparateur sous son seuil est décoratif, pas fautif (RGAA). */
  decorative?: boolean;
  fixable?: boolean;
}

function rowSpecs(theme: PortalTheme, branding: ThemeBranding | null): RowSpec[] {
  const c = resolveThemeColors(theme, branding);
  const specs: RowSpec[] = [
    {
      id: "body-text",
      label: "Texte courant sur fond blanc",
      foreground: c.ink,
      background: WHITE,
      min: 4.5,
    },
    {
      id: "muted-text",
      label: "Texte secondaire sur fond blanc",
      foreground: c.muted,
      background: WHITE,
      min: 4.5,
    },
    {
      id: "primary-text",
      label: "Couleur principale en texte (liens, libellés)",
      foreground: c.primary,
      background: WHITE,
      min: 4.5,
      fixable: true,
    },
    {
      id: "on-primary",
      label: "Texte sur la couleur principale",
      foreground: c.onPrimary,
      background: c.primary,
      min: 4.5,
      fixable: true,
    },
    {
      id: "accent",
      label: "Badge « À la une » sur la couleur secondaire",
      foreground: c.accentInk,
      background: c.accent,
      min: 4.5,
    },
  ];

  if (theme.header.fill === "color") {
    specs.push({
      id: "header-menu",
      label: "Menu sur le bandeau de couleur",
      foreground: c.headerInk,
      background: c.headerSurface,
      min: 4.5,
      fixable: theme.header.color === "primary",
    });
  }

  specs.push({
    id: "border",
    label: "Bordures et séparateurs",
    foreground: c.border,
    background: WHITE,
    min: 3,
    decorative: true,
  });

  return specs;
}

function measure(spec: RowSpec): { ratio: number; status: ContrastStatus } {
  // `contrastRatio` ne rend `null` que sur une couleur illisible ; la palette
  // est déjà normalisée, mais on ne prétend pas mesurer ce qu'on n'a pas lu.
  const raw = contrastRatio(spec.foreground, spec.background);
  if (raw === null) return { ratio: 0, status: "insufficient" };
  const ratio = Math.round(raw * 10) / 10;
  if (ratio >= spec.min) return { ratio, status: "ok" };
  return { ratio, status: spec.decorative ? "decorative" : "insufficient" };
}

/**
 * Le contrôle des contrastes du panneau Thème — mesuré sur les couleurs
 * RÉELLES de la collectivité, telles qu'elles seront peintes.
 *
 * Seuils RGAA AA : 4,5 : 1 pour le texte, 3 : 1 pour les éléments d'interface.
 */
export function contrastRows(theme: PortalTheme, branding: ThemeBranding | null): ContrastRow[] {
  const darkened: PortalTheme = {
    ...theme,
    accessibility: { ...theme.accessibility, darkPrimary: true },
  };
  const canDarken = !theme.accessibility.darkPrimary;
  const afterFix = canDarken ? rowSpecs(darkened, branding) : [];

  return rowSpecs(theme, branding).map((spec) => {
    const { ratio, status } = measure(spec);
    const row: ContrastRow = { id: spec.id, label: spec.label, ratio, min: spec.min, status };
    if (status !== "insufficient" || !spec.fixable || !canDarken) return row;
    const fixed = afterFix.find((candidate) => candidate.id === spec.id);
    if (fixed && measure(fixed).status === "ok") row.fix = "darkPrimary";
    return row;
  });
}

/** « 4,5 : 1 » — la notation des rapports de contraste, à la française. */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1).replace(".", ",")} : 1`;
}

// ── Le fond image d'un bloc ─────────────────────────────────────────────────


/**
 * Le fond d'un bloc habillé d'une image : la photo, cadrée au centre et rognée
 * pour couvrir tout le bloc, sous son voile.
 *
 * ⚠️ Les deux couches voyagent dans **une seule** propriété `background-image` —
 * le voile est un dégradé d'une seule couleur, pas un élément posé par-dessus.
 * C'est ce qui permet à `background-attachment` de valoir pour les deux d'un
 * coup, et ce qui évite un enfant absolu de plus à empiler dans chaque section.
 *
 * ⚠️ L'adresse est sérialisée par `JSON.stringify` : elle vient d'un agent, et
 * `IMAGE_URL` autorise le guillemet. Sans échappement, une adresse tordue
 * casserait la valeur CSS et ferait disparaître le fond (le navigateur rejette
 * la déclaration entière) — pas une injection, mais un bloc inexplicablement
 * nu.
 *
 * Rend `undefined` sans image : un bloc sans fond ne doit porter aucun style,
 * pas un style neutre.
 */
export function imageBackdropStyle(imageUrl: string, fixed: boolean): CSSProperties | undefined {
  const url = imageUrl.trim();
  if (url === "") return undefined;
  return {
    backgroundImage: `url(${JSON.stringify(url)})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    // `fixed` : l'image s'ancre à la fenêtre, le bloc glisse par-dessus elle.
    // Ignoré par plusieurs navigateurs mobiles — c'est un ornement, le bloc
    // reste entier sans lui.
    backgroundAttachment: fixed ? "fixed" : "scroll",
  };
}
