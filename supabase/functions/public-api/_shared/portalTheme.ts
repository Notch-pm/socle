/**
 * Thème publié du site de démarches — ce que `GET /v1/portal/tenant` sert dans
 * son champ `theme`. Logique pure, testée.
 *
 * ⚠️ **Miroir volontaire** de `src/features/portal/portalTheme.ts` (même motif
 * que `portalPage.ts` et `publication.ts`) : une edge function ne peut rien
 * importer de `src/`. Les deux lisent le même JSON avec les mêmes tolérances —
 * champ par champ, valeur inconnue remplacée par SON défaut — et les tests des
 * deux côtés l'épinglent.
 *
 * ⚠️ **UNE COLLECTIVITÉ SANS THÈME PUBLIÉ REÇOIT LES DÉFAUTS, jamais `null`.**
 * Le Socle connaît ces défauts ; les laisser inventer au portail ferait deux
 * jeux de valeurs, qui finiraient par diverger. C'est aussi ce qui permet
 * d'ajouter un réglage plus tard sans casser personne : les anciens thèmes
 * reçoivent sa valeur par défaut, pas un trou.
 *
 * ⚠️ **Le thème ne porte AUCUNE couleur** : elles viennent de la charte
 * graphique (`GET /v1/organizations/{id}/branding`, héritage déjà résolu). Le
 * thème dit comment peindre, la charte dit avec quoi.
 *
 * ⚠️ **LA MENTION D'ACCESSIBILITÉ SORT RÉSOLUE** (contrat 1.25.0). Le schéma
 * possédé garde trois réglages — `declarationEnabled`, `declaration`,
 * `declarationLink` — et le commutateur gouverne l'usage, pas la donnée : une
 * mention masquée garde son texte en base. C'est ICI, à la frontière, qu'il
 * s'applique (motif `show_shortcuts`) : masquée, la mention sort vide ; et le
 * lien ne sort que si une déclaration est publiée. Un consommateur n'a donc
 * aucun commutateur à connaître — un portail d'avant ce contrat, qui n'affiche
 * que `declaration`, fait déjà ce qu'il faut.
 */
import type { PortalThemeDto } from "./dto.ts";

type Row = Record<string, unknown>;

/** Miroir de `FONT_IDS` (`src/features/portal/portalFonts.ts`). */
const FONTS = ["systeme", "nunito-sans", "rubik", "public-sans"] as const;
const TEXT_SCALES = ["compact", "standard", "comfortable"] as const;
const RADIUS_SCALES = ["square", "soft", "round"] as const;
const SHADOW_SCALES = ["none", "soft", "strong"] as const;
const DENSITIES = ["compact", "standard", "airy"] as const;
const HEADER_FILLS = ["white", "color"] as const;
const HEADER_COLORS = ["primary", "secondary"] as const;
const LOGO_POSITIONS = ["left", "center"] as const;
const MENU_STYLES = ["text", "pills"] as const;
const ACCOUNT_STYLES = ["prominent", "discreet"] as const;

const MAX_DECLARATION_LENGTH = 300;

function block(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Le thème par défaut, sérialisé. Miroir de `defaultPortalTheme()`.
 *
 * Aucun correctif d'accessibilité n'y est activé : ce sont des correctifs, pas
 * une posture par défaut.
 */
export function defaultPortalThemeDto(): PortalThemeDto {
  return {
    typography: { font: "nunito-sans", text_scale: "standard" },
    shapes: { radius: "soft", shadow: "soft", density: "standard" },
    header: {
      fill: "white",
      color: "primary",
      logo_white: true,
      logo: "left",
      menu: "text",
      sticky: true,
      account: "prominent",
    },
    accessibility: {
      high_contrast: false,
      dark_primary: false,
      declaration: "",
      declaration_link: false,
    },
  };
}

/**
 * Thème publié → DTO, en **snake_case** (convention des DTO ; le schéma possédé
 * est en camelCase). Chaque champ retombe sur SON défaut : un thème à demi
 * lisible reste le thème que la collectivité a réglé, moins le réglage abîmé.
 */
export function serializePortalTheme(
  published: unknown,
  options: {
    /** Une déclaration d'accessibilité non vide est-elle publiée ? */
    accessibilityStatement?: boolean;
  } = {},
): PortalThemeDto {
  const fallback = defaultPortalThemeDto();
  if (!published || typeof published !== "object" || Array.isArray(published)) return fallback;

  const root = published as Row;
  const typography = block(root.typography);
  const shapes = block(root.shapes);
  const header = block(root.header);
  const accessibility = block(root.accessibility);

  const declaration = accessibility.declaration;
  // ⚠️ Absent = AFFICHÉ, et le lien DEMANDÉ : c'est le défaut du schéma
  // possédé, et celui qui ne fait disparaître aucune mention déjà publiée.
  const enabled = bool(accessibility.declarationEnabled, true);
  const linkWanted = bool(accessibility.declarationLink, true);
  return {
    typography: {
      font: oneOf(typography.font, FONTS, fallback.typography.font),
      // ⚠️ `scale` dans le schéma possédé, `text_scale` dans le contrat :
      // « scale » seul se lit comme un facteur d'échelle générique.
      text_scale: oneOf(typography.scale, TEXT_SCALES, fallback.typography.text_scale),
    },
    shapes: {
      radius: oneOf(shapes.radius, RADIUS_SCALES, fallback.shapes.radius),
      shadow: oneOf(shapes.shadow, SHADOW_SCALES, fallback.shapes.shadow),
      density: oneOf(shapes.density, DENSITIES, fallback.shapes.density),
    },
    header: {
      fill: oneOf(header.fill, HEADER_FILLS, fallback.header.fill),
      color: oneOf(header.color, HEADER_COLORS, fallback.header.color),
      logo_white: bool(header.logoWhite, fallback.header.logo_white),
      logo: oneOf(header.logo, LOGO_POSITIONS, fallback.header.logo),
      menu: oneOf(header.menu, MENU_STYLES, fallback.header.menu),
      sticky: bool(header.sticky, fallback.header.sticky),
      account: oneOf(header.account, ACCOUNT_STYLES, fallback.header.account),
    },
    accessibility: {
      high_contrast: bool(accessibility.highContrast, fallback.accessibility.high_contrast),
      dark_primary: bool(accessibility.darkPrimary, fallback.accessibility.dark_primary),
      declaration:
        enabled && typeof declaration === "string" && declaration.length <= MAX_DECLARATION_LENGTH
          ? declaration
          : "",
      declaration_link: enabled && linkWanted && options.accessibilityStatement === true,
    },
  };
}
