/**
 * Les polices proposées au site de démarches — catalogue **figé dans le code**,
 * comme `languages.ts` et `documentVariables.ts`.
 *
 * C'est un **contrat de nommage**, pas une donnée de client : l'`id` est ce qui
 * traverse `portal_themes` puis l'API publique, et c'est lui que le portail
 * traduit en une famille réellement chargée. Ajouter une police, c'est donc
 * décider un nom public — une entrée au journal des API, jamais une migration.
 *
 * ⚠️ **La liste est courte, et c'est le seul réglage du thème qui coûte quelque
 * chose.** Angles, ombres, densité, échelle et en-tête sont des variables CSS :
 * zéro octet de plus sur le site. Une police web, elle, se paie en requêtes, en
 * kilo-octets et en scintillement au chargement. D'où la règle que le portail
 * tient : **une seule famille chargée**, celle que la collectivité a choisie.
 * « Système » ne charge rien du tout, et reste le choix le plus rapide.
 *
 * ⚠️ **CRITÈRE D'ENTRÉE : une licence qui autorise explicitement la
 * REDISTRIBUTION.** Un portail public ne « référence » pas une police, il la
 * sert à chaque visiteur — les trois familles web du catalogue sont donc sous
 * SIL Open Font License 1.1, et auto-hébergées par le portail. C'est ce qui
 * exclut Marianne, la police de l'État : sa licence lui est propre, et le
 * catalogue n'a pas à porter un cas particulier que le portail ne saurait pas
 * distribuer.
 *
 * ⚠️ **Et surtout PAS de Google Fonts au rendu** : ce serait l'adresse IP de
 * chaque visiteur envoyée à un tiers, sans base légale, sur le site d'une
 * collectivité (jugement du LG München I du 20 janvier 2022, position de la
 * CNIL). Les fichiers vivent dans `public/fonts/` — ici comme chez Nora.
 */

export const FONT_IDS = ["systeme", "nunito-sans", "rubik", "public-sans"] as const;
export type FontId = (typeof FONT_IDS)[number];

export interface PortalFont {
  id: FontId;
  /** Nom montré à l'administrateur. */
  label: string;
  /** Pile CSS complète, replis compris. */
  stack: string;
  /** Ce qu'il faut savoir avant de choisir — affiché sous la grille. */
  note: string;
  /**
   * Faut-il télécharger quelque chose pour l'afficher ? `false` pour la police
   * du système, qui est déjà là.
   */
  webfont: boolean;
}

export const PORTAL_FONTS: readonly PortalFont[] = [
  {
    id: "systeme",
    label: "Système",
    stack: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    note: "Aucun téléchargement : la page s'affiche immédiatement, avec la police de l'appareil.",
    webfont: false,
  },
  {
    id: "nunito-sans",
    label: "Nunito Sans",
    stack: "'Nunito Sans', system-ui, sans-serif",
    note: "Recommandée — arrondie, chaleureuse, très lisible.",
    webfont: true,
  },
  {
    id: "rubik",
    label: "Rubik",
    stack: "'Rubik', system-ui, sans-serif",
    note: "Angles adoucis, plus de caractère — sans rien perdre en lisibilité.",
    webfont: true,
  },
  {
    id: "public-sans",
    label: "Public Sans",
    stack: "'Public Sans', system-ui, sans-serif",
    note: "Neutre et administrative, libre de droits.",
    webfont: true,
  },
];

const BY_ID = new Map<string, PortalFont>(PORTAL_FONTS.map((font) => [font.id, font]));

export const DEFAULT_FONT_ID: FontId = "nunito-sans";

/**
 * La police d'un identifiant. Un identifiant inconnu rend la police par défaut :
 * une page sans police n'a pas de sens, et le repli du navigateur ne serait pas
 * celui que la collectivité a choisi ailleurs.
 */
export function fontById(id: string): PortalFont {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_FONT_ID)!;
}

export function isFontId(value: unknown): value is FontId {
  return typeof value === "string" && BY_ID.has(value);
}

