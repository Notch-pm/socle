/**
 * Charte graphique d'une organisation : logo couleur, logo blanc, couleur
 * principale, couleur secondaire — et le commutateur d'héritage.
 *
 * Logique pure (aucun React, aucun Supabase) : normalisation des couleurs,
 * validation, et surtout la **forme exacte de ce qu'on écrit en base**, qui
 * porte deux règles faciles à perdre de vue dans un composant :
 *
 *  • une organisation qui hérite **garde ses valeurs propres** (le commutateur
 *    gouverne l'usage, pas la donnée — même parti que `email_sender_name` et que
 *    la période de publication des démarches) : on peut donc revenir en arrière ;
 *  • une organisation principale (racine) n'hérite jamais, elle n'a personne
 *    au-dessus d'elle. Le trigger DB `enforce_branding_root_no_inherit` le
 *    rattrape de toute façon ; on ne lui envoie pas de bêtise pour autant.
 */

/** Couleur proposée par le sélecteur quand rien n'est encore défini (vert du DS). */
export const DEFAULT_COLOR_PICKER = "#089b59";

export interface BrandingValues {
  logoUrl: string;
  logoWhiteUrl: string;
  /** Chaîne vide = couleur non définie. */
  primaryColor: string;
  secondaryColor: string;
  inheritParent: boolean;
}

/** Colonnes de `organizations` que la charte écrit. */
export interface BrandingUpdate {
  logo_url: string | null;
  logo_white_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  branding_inherit_parent: boolean;
}

/** Ce que l'aperçu affiche : la charte applicable, et d'où elle vient. */
export interface ResolvedBranding {
  logoUrl: string | null;
  logoWhiteUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

const HEX_SHORT = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_LONG = /^#?([0-9a-f]{6})$/i;

/**
 * `#ABC`, `abc`, `#AABBCC`, `aabbcc` → `#aabbcc`. Toute autre saisie → `null`.
 * La forme longue minuscule est la seule stockée : le CHECK en base accepte les
 * deux casses, mais deux écritures de la même couleur ne doivent pas se lire
 * comme deux couleurs différentes en aval.
 */
export function normalizeHexColor(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const short = raw.match(HEX_SHORT);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  const long = raw.match(HEX_LONG);
  return long ? `#${long[1]}`.toLowerCase() : null;
}

/** Message d'erreur français, ou `null` si la saisie est acceptable (vide comprise). */
export function colorFieldError(input: string): string | null {
  if (!input.trim()) return null;
  return normalizeHexColor(input) === null
    ? "Couleur invalide : attendu une notation hexadécimale, par exemple #1f8a5b."
    : null;
}

/** Ligne `organizations` → état du formulaire. */
export function brandingValuesFromOrganization(org: {
  parent_id: string | null;
  logo_url: string | null;
  logo_white_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  branding_inherit_parent: boolean;
}): BrandingValues {
  return {
    logoUrl: org.logo_url ?? "",
    logoWhiteUrl: org.logo_white_url ?? "",
    primaryColor: org.primary_color ?? "",
    secondaryColor: org.secondary_color ?? "",
    // Une racine n'hérite de personne, quoi qu'en dise la colonne.
    inheritParent: org.parent_id !== null && org.branding_inherit_parent,
  };
}

/**
 * État du formulaire → colonnes à écrire. Les valeurs propres sont conservées
 * même quand l'organisation hérite : c'est ce qui rend le geste réversible.
 */
export function brandingUpdateFromValues(
  values: BrandingValues,
  hasParent: boolean,
): BrandingUpdate {
  return {
    logo_url: values.logoUrl.trim() || null,
    logo_white_url: values.logoWhiteUrl.trim() || null,
    primary_color: normalizeHexColor(values.primaryColor),
    secondary_color: normalizeHexColor(values.secondaryColor),
    branding_inherit_parent: hasParent && values.inheritParent,
  };
}

/** Un aperçu vide n'a rien à montrer : autant le dire que peindre du blanc sur du blanc. */
export function isBrandingEmpty(branding: ResolvedBranding): boolean {
  return (
    !branding.logoUrl?.trim() &&
    !branding.logoWhiteUrl?.trim() &&
    !branding.primaryColor &&
    !branding.secondaryColor
  );
}

/**
 * Charte affichée dans l'aperçu : celle du parent quand on hérite, la sienne
 * sinon. Calculé sur l'état **du formulaire**, pas sur l'enregistré : basculer
 * le commutateur doit montrer tout de suite ce que l'on obtiendra.
 */
export function previewBranding(
  values: BrandingValues,
  parent: ResolvedBranding | null,
): ResolvedBranding {
  if (values.inheritParent) {
    return (
      parent ?? { logoUrl: null, logoWhiteUrl: null, primaryColor: null, secondaryColor: null }
    );
  }
  return {
    logoUrl: values.logoUrl.trim() || null,
    logoWhiteUrl: values.logoWhiteUrl.trim() || null,
    primaryColor: normalizeHexColor(values.primaryColor),
    secondaryColor: normalizeHexColor(values.secondaryColor),
  };
}
