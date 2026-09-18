/**
 * Le thème du site de démarches — l'apparence que la collectivité donne à SON
 * portail : typographie, formes, densité, en-tête, accessibilité.
 *
 * Schéma **possédé**, contrat public consommé en aval, persisté dans
 * `portal_themes.draft` / `.published` — même discipline que la composition
 * (`portalPage.ts`) : sauvegarder n'est pas publier.
 *
 * ⚠️ **LE THÈME NE PORTE AUCUNE COULEUR.** Les couleurs d'une collectivité
 * vivent dans sa **charte graphique** (`organizations.primary_color` /
 * `secondary_color`, servies résolues par `GET /v1/organizations/{id}/branding`)
 * et n'ont pas à exister deux fois. Le thème dit COMMENT peindre ; la charte dit
 * AVEC QUOI. La seule chose qu'il en déduit est `darkPrimary` — « assombrir la
 * couleur principale » —, qui ne remplace pas la charte : il la fonce d'un cran
 * quand le contraste ne passe pas.
 *
 * ⚠️ **Pas de `version`, contrairement à `portalPage.ts`.** Ce fichier est un
 * sac de valeurs énumérées dont chacune retombe sur SON défaut (`.catch`) : il
 * ne peut pas être « faux », seulement partiellement inconnu. Un littéral de
 * version y recréerait exactement le piège que la roadmap signale pour la page
 * (un `version: 2` non prévu ferait retomber TOUT le thème sur ses défauts).
 * L'évolution se fait donc en **blocs voisins**, motif `communication_config` :
 * un réglage à venir s'ajoute à côté sans déplacer l'existant.
 *
 * ⚠️ **Le thème vaut pour tout le site, jamais bloc par bloc.** Un thème par
 * section multiplierait le contrat public par le nombre de blocs et rendrait
 * toute cohérence visuelle impossible à tenir.
 */
import { z } from "zod";
import { DEFAULT_FONT_ID, FONT_IDS, type FontId } from "./portalFonts";

// ── Domaines de valeurs ─────────────────────────────────────────────────────

export const TEXT_SCALES = ["compact", "standard", "comfortable"] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

export const RADIUS_SCALES = ["square", "soft", "round"] as const;
export type RadiusScale = (typeof RADIUS_SCALES)[number];

export const SHADOW_SCALES = ["none", "soft", "strong"] as const;
export type ShadowScale = (typeof SHADOW_SCALES)[number];

export const DENSITIES = ["compact", "standard", "airy"] as const;
export type Density = (typeof DENSITIES)[number];

export const HEADER_FILLS = ["white", "color"] as const;
export type HeaderFill = (typeof HEADER_FILLS)[number];

export const HEADER_COLORS = ["primary", "secondary"] as const;
export type HeaderColor = (typeof HEADER_COLORS)[number];

export const LOGO_POSITIONS = ["left", "center"] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

export const MENU_STYLES = ["text", "pills"] as const;
export type MenuStyle = (typeof MENU_STYLES)[number];

export const ACCOUNT_STYLES = ["prominent", "discreet"] as const;
export type AccountStyle = (typeof ACCOUNT_STYLES)[number];

/**
 * La MENTION d'accessibilité tient en une phrase ; on borne la saisie. La
 * déclaration elle-même, qui peut faire trois écrans, est un contenu du site
 * (`portalContent.ts`), pas une valeur du thème.
 */
export const MAX_DECLARATION_LENGTH = 300;

export interface PortalTheme {
  typography: { font: FontId; scale: TextScale };
  shapes: { radius: RadiusScale; shadow: ShadowScale; density: Density };
  header: {
    fill: HeaderFill;
    /** Laquelle des deux couleurs de la charte remplit le bandeau. */
    color: HeaderColor;
    /** Le logo blanc de la charte, pour un bandeau coloré. */
    logoWhite: boolean;
    logo: LogoPosition;
    menu: MenuStyle;
    account: AccountStyle;
    sticky: boolean;
  };
  accessibility: {
    highContrast: boolean;
    /** Assombrit la couleur principale, quand le contraste ne passe pas. */
    darkPrimary: boolean;
    /**
     * La mention d'accessibilité est-elle affichée au pied du site ?
     *
     * ⚠️ Le commutateur gouverne l'USAGE, pas la donnée (motif
     * `email_sender_name`) : le masquer conserve le texte et le lien, et le
     * réafficher rend la mention telle qu'elle était. C'est l'API publique qui
     * l'applique, à la frontière — le portail reçoit une mention vide.
     */
    declarationEnabled: boolean;
    /**
     * Texte de la mention RGAA obligatoire, au pied du site (« Accessibilité :
     * partiellement conforme »). Le nom de la clé est celui du contrat 1.17.0 :
     * il désignait alors toute la déclaration, qui tenait en une phrase.
     */
    declaration: string;
    /**
     * La mention porte-t-elle un lien vers la DÉCLARATION D'ACCESSIBILITÉ,
     * rédigée dans l'onglet « Contenus » (`portal_contents`, slug
     * `accessibilite`) ?
     *
     * ⚠️ C'est un souhait, pas une promesse : l'API ne sert le lien que si une
     * déclaration est PUBLIÉE et non vide — un lien vers une page vide serait
     * pire que pas de lien.
     */
    declarationLink: boolean;
  };
}

/**
 * Le thème d'un site qui n'a jamais été réglé — les défauts de la maquette.
 *
 * Aucun réglage d'accessibilité n'est activé : ce sont des CORRECTIFS, pas une
 * posture par défaut. `highContrast` imposé d'office rendrait tous les sites
 * plus sombres que ce que leurs collectivités ont choisi, et masquerait
 * justement les chartes qui posent un vrai problème de lisibilité.
 */
export function defaultPortalTheme(): PortalTheme {
  return {
    typography: { font: DEFAULT_FONT_ID, scale: "standard" },
    shapes: { radius: "soft", shadow: "soft", density: "standard" },
    header: {
      fill: "white",
      color: "primary",
      logoWhite: true,
      logo: "left",
      menu: "text",
      account: "prominent",
      sticky: true,
    },
    // ⚠️ La mention et son lien sont ACTIVÉS par défaut, contrairement aux
    // correctifs ci-dessus : la mention est obligatoire pour un site public, et
    // les thèmes d'avant ces deux commutateurs affichaient déjà leur texte — les
    // lire « masqués » ferait disparaître d'un coup des mentions publiées.
    accessibility: {
      highContrast: false,
      darkPrimary: false,
      declarationEnabled: true,
      declaration: "",
      declarationLink: true,
    },
  };
}

// ── Parseur robuste ─────────────────────────────────────────────────────────
//
// ⚠️ CHAQUE CHAMP EST INDÉPENDANT. Une valeur inconnue retombe sur SON défaut
// et n'emporte jamais ses voisines : un thème à demi lisible reste le thème que
// la collectivité a réglé, moins le réglage abîmé. Même parti que le parse
// section par section de `portalPage.ts` — on n'efface pas le travail d'une
// collectivité pour une clé qu'on ne sait pas lire.
//
// ⚠️ Zod strippe les clés inconnues : tout champ ajouté ici doit être déclaré
// DANS ce schéma, sans quoi il survivrait à la frappe puis disparaîtrait au
// rechargement — pire qu'une perte franche, l'agent croirait avoir enregistré.

const D = defaultPortalTheme();

const themeSchema = z.object({
  typography: z
    .object({
      font: z.enum(FONT_IDS).catch(D.typography.font),
      scale: z.enum(TEXT_SCALES).catch(D.typography.scale),
    })
    .catch(D.typography)
    .default(D.typography),
  shapes: z
    .object({
      radius: z.enum(RADIUS_SCALES).catch(D.shapes.radius),
      shadow: z.enum(SHADOW_SCALES).catch(D.shapes.shadow),
      density: z.enum(DENSITIES).catch(D.shapes.density),
    })
    .catch(D.shapes)
    .default(D.shapes),
  header: z
    .object({
      fill: z.enum(HEADER_FILLS).catch(D.header.fill),
      color: z.enum(HEADER_COLORS).catch(D.header.color),
      logoWhite: z.boolean().catch(D.header.logoWhite),
      logo: z.enum(LOGO_POSITIONS).catch(D.header.logo),
      menu: z.enum(MENU_STYLES).catch(D.header.menu),
      account: z.enum(ACCOUNT_STYLES).catch(D.header.account),
      sticky: z.boolean().catch(D.header.sticky),
    })
    .catch(D.header)
    .default(D.header),
  accessibility: z
    .object({
      highContrast: z.boolean().catch(D.accessibility.highContrast),
      darkPrimary: z.boolean().catch(D.accessibility.darkPrimary),
      declarationEnabled: z
        .boolean()
        .catch(D.accessibility.declarationEnabled)
        .default(D.accessibility.declarationEnabled),
      declaration: z.string().max(MAX_DECLARATION_LENGTH).catch("").default(""),
      declarationLink: z
        .boolean()
        .catch(D.accessibility.declarationLink)
        .default(D.accessibility.declarationLink),
    })
    .catch(D.accessibility)
    .default(D.accessibility),
});

export function parsePortalTheme(raw: unknown): PortalTheme {
  if (!raw || typeof raw !== "object") return defaultPortalTheme();
  const parsed = themeSchema.safeParse(raw);
  return parsed.success ? parsed.data : defaultPortalTheme();
}

// ── Préréglages ─────────────────────────────────────────────────────────────
//
// Quatre points de départ, figés dans le code. Ils gouvernent l'APPARENCE, pas
// le contenu : la mention d'accessibilité (texte, commutateur, lien) et
// `darkPrimary` leur survivent — la première est un texte que la collectivité a
// écrit, le second corrige SA couleur, laquelle ne change pas quand on change
// de préréglage.

interface PresetValues {
  typography: PortalTheme["typography"];
  shapes: PortalTheme["shapes"];
  header: PortalTheme["header"];
  highContrast: boolean;
}

export interface ThemePreset {
  name: string;
  hint: string;
  values: PresetValues;
}

export const PRESETS: readonly ThemePreset[] = [
  {
    name: "Sobre institutionnel",
    hint: "Public Sans · angles droits · compact",
    values: {
      typography: { font: "public-sans", scale: "standard" },
      shapes: { radius: "square", shadow: "none", density: "compact" },
      header: {
        fill: "white",
        color: "primary",
        logoWhite: true,
        logo: "left",
        menu: "text",
        account: "discreet",
        sticky: true,
      },
      highContrast: false,
    },
  },
  {
    name: "Chaleureux",
    hint: "Nunito Sans · angles arrondis · aéré",
    values: {
      typography: { font: "nunito-sans", scale: "comfortable" },
      shapes: { radius: "round", shadow: "soft", density: "airy" },
      header: {
        fill: "white",
        color: "primary",
        logoWhite: true,
        logo: "left",
        menu: "pills",
        account: "prominent",
        sticky: true,
      },
      highContrast: false,
    },
  },
  {
    name: "Contrasté",
    hint: "Nunito Sans · ombres marquées · contraste renforcé",
    values: {
      typography: { font: "nunito-sans", scale: "standard" },
      shapes: { radius: "soft", shadow: "strong", density: "standard" },
      header: {
        fill: "white",
        color: "primary",
        logoWhite: true,
        logo: "left",
        menu: "text",
        account: "prominent",
        sticky: true,
      },
      highContrast: true,
    },
  },
  {
    name: "Vitrine centrée",
    hint: "Rubik · logo centré · bandeau de couleur",
    values: {
      typography: { font: "rubik", scale: "standard" },
      shapes: { radius: "soft", shadow: "soft", density: "standard" },
      header: {
        fill: "color",
        color: "primary",
        logoWhite: true,
        logo: "center",
        menu: "pills",
        account: "prominent",
        sticky: true,
      },
      highContrast: false,
    },
  },
];

export function applyPreset(theme: PortalTheme, name: string): PortalTheme {
  const preset = PRESETS.find((item) => item.name === name);
  if (!preset) return theme;
  return {
    typography: { ...preset.values.typography },
    shapes: { ...preset.values.shapes },
    header: { ...preset.values.header },
    accessibility: { ...theme.accessibility, highContrast: preset.values.highContrast },
  };
}

/**
 * Le préréglage dont ce thème est exactement la copie, ou `null`.
 *
 * ⚠️ **Il est DÉDUIT, jamais stocké.** Un nom de préréglage en base se
 * désynchroniserait du premier réglage manuel, et le contrat public porterait
 * une clé qui ne décrit rien de plus — le thème EST déjà sa description
 * complète.
 */
export function presetName(theme: PortalTheme): string | null {
  const match = PRESETS.find(
    (preset) =>
      preset.values.typography.font === theme.typography.font &&
      preset.values.typography.scale === theme.typography.scale &&
      preset.values.shapes.radius === theme.shapes.radius &&
      preset.values.shapes.shadow === theme.shapes.shadow &&
      preset.values.shapes.density === theme.shapes.density &&
      preset.values.header.fill === theme.header.fill &&
      preset.values.header.color === theme.header.color &&
      preset.values.header.logoWhite === theme.header.logoWhite &&
      preset.values.header.logo === theme.header.logo &&
      preset.values.header.menu === theme.header.menu &&
      preset.values.header.account === theme.header.account &&
      preset.values.header.sticky === theme.header.sticky &&
      preset.values.highContrast === theme.accessibility.highContrast,
  );
  return match ? match.name : null;
}
