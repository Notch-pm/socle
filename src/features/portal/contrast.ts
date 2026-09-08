/**
 * Les couleurs du portail : lire une couleur, mesurer un contraste, en dériver
 * une variante lisible. Logique pure, sans dépendance UI.
 *
 * Ce fichier existe pour qu'il n'y ait **qu'une seule** implémentation de la
 * luminance dans le projet. `isDarkColor` vivait dans `portalPage.ts` — c'est
 * ici qu'elle habite désormais ; `portalPage.ts` la ré-exporte pour ne rien
 * casser en amont.
 *
 * ⚠️ **On lit `#rrggbb` minuscule, et rien d'autre.** Une couleur qu'on ne sait
 * pas lire n'est pas devinée : `isDarkColor` la traite comme sombre (le défaut
 * du pied de page l'est), et les mesures la déclarent nulle plutôt que de
 * rendre un chiffre inventé. Ce sont des valeurs qui finissent dans le `style`
 * d'une page publique — on écarte, on ne nettoie pas. `normalizeHexColor`
 * (`features/organizations/branding.ts`) est le seul endroit qui élargit à
 * `#ABC`, et sa sortie entre ici sans retouche.
 */

/** Couleur hexadécimale longue et minuscule, la seule forme stockée. */
export const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** Le blanc, écrit une fois : c'est le fond de la page et l'encre des bandeaux. */
export const WHITE = "#ffffff";

function channels(hex: string): [number, number, number] | null {
  if (!HEX_COLOR.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

/**
 * Luminance relative (sRGB, WCAG 2.1), entre 0 (noir) et 1 (blanc).
 * `null` quand la couleur n'est pas lisible — l'appelant décide quoi en faire.
 */
export function relativeLuminance(hex: string): number | null {
  const rgb = channels(hex);
  if (!rgb) return null;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

/**
 * Le texte se lit-il en clair sur ce fond ? Sous 0,4 de luminance le fond est
 * sombre et appelle du texte clair. Une couleur illisible est traitée comme
 * sombre — le défaut du pied de page l'est.
 */
export function isDarkColor(hex: string): boolean {
  const luminance = relativeLuminance(hex);
  return luminance === null || luminance < 0.4;
}

/**
 * Rapport de contraste WCAG entre deux couleurs, de 1 (identiques) à 21
 * (noir sur blanc). `null` si l'une des deux n'est pas lisible : un contraste
 * inventé se lirait comme un diagnostic, et c'en serait un faux.
 */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** L'encre qui se lit sur ce fond : le blanc, ou l'encre sombre proposée. */
export function readableInk(background: string, darkInk: string): string {
  return isDarkColor(background) ? WHITE : darkInk;
}

// ── Conversions ─────────────────────────────────────────────────────────────
// Assombrir une couleur se fait en TSL : c'est la clarté qu'on baisse, et elle
// seule. Le faire en RVB (multiplier les trois canaux) désature au passage et
// rend un vert qui vire au gris — la collectivité ne reconnaîtrait plus la
// sienne.

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = channels(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const component = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${component(0)}${component(8)}${component(4)}`;
}

/**
 * La même couleur, plus foncée : la clarté multipliée par `factor`.
 *
 * C'est ce que fait le réglage « assombrir la couleur principale » quand le
 * blanc ne se lit pas assez sur la couleur de la collectivité. Le rapport par
 * défaut est celui de la maquette (32 % → 24 % de clarté) : assez pour passer
 * le seuil AA sur la plupart des couleurs vives, assez peu pour qu'on
 * reconnaisse encore la charte.
 *
 * ⚠️ Une couleur illisible ressort **telle quelle** : on ne fabrique pas une
 * couleur à partir de rien.
 */
export const DARKEN_FACTOR = 0.75;

export function darkenColor(hex: string, factor = DARKEN_FACTOR): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  return hslToHex(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * factor)));
}

/**
 * La même couleur, transparente : `rgb(r g b / a)`.
 *
 * Sert aux teintes douces du thème (le fond d'une pastille, un menu en pilules
 * sur un bandeau coloré) : une teinte CALCULÉE suit la charte de la
 * collectivité, là où une couleur figée jurerait avec la moitié d'entre elles.
 * Une couleur illisible rend `transparent` — pas une teinte inventée.
 */
export function withAlpha(hex: string, alpha: number): string {
  if (!HEX_COLOR.test(hex)) return "transparent";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}
