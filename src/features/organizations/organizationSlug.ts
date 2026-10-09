/**
 * La forme d'un slug d'organisation — MIROIR de la contrainte SQL
 * `organizations_slug_url_form` (migration `organization_slug_url`).
 *
 * Pourquoi la redire ici alors que la base la tient déjà : parce qu'un agent
 * qui saisit une adresse doit lire *pourquoi* elle est refusée, pas un code
 * d'erreur Postgres. La base reste l'autorité — ceci n'est qu'une explication
 * donnée avant.
 *
 * ⚠️ QUATRE CARACTÈRES AU MINIMUM, et ce n'est pas une préférence : le portail
 * usagers lit le premier segment d'une adresse sans rien demander au serveur —
 * deux ou trois lettres, c'est un code de langue (`/en`, `/gsw`) ; au-delà,
 * c'est un organisme. Un slug plus court rendrait la page de l'organisme
 * inatteignable, en silence, avec l'accueil à la place.
 */

/** Minuscules, chiffres, tirets — jamais deux tirets de suite, ni aux bords. */
export const SLUG_FORM = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const SLUG_MIN_LENGTH = 4;

/**
 * Ce qu'un slug ne peut pas être : les segments de route du portail usagers.
 * `demarches` est celui d'une démarche et de son formulaire ; les autres sont
 * les pages que la roadmap prévoit de composer au niveau de la collectivité.
 * Les réserver coûte une ligne ; les récupérer plus tard demanderait de
 * renommer l'adresse d'un organisme déjà communiquée.
 */
export const SLUG_RESERVED: readonly string[] = [
  "demarches",
  "accueil",
  "contact",
  "mentions-legales",
  "accessibilite",
  // L'assistant conversationnel du portail, servi à `/assistant` (2026-09-20).
  "assistant",
  // Le courrier libre (site Nora → Clara) : `/courrier` pour la collectivité,
  // `/<slug>/courrier` pour un organisme (2026-10-09).
  "courrier",
];

/**
 * Ce qui cloche dans ce slug, en une phrase destinée à un agent — ou `null`
 * s'il est acceptable. Un slug **vide est acceptable** : la colonne est
 * facultative, et un organisme sans slug n'a simplement pas de page.
 */
export function slugIssue(slug: string): string | null {
  const value = slug.trim();
  if (value === "") return null;
  if (!SLUG_FORM.test(value)) {
    return "Minuscules, chiffres et tirets seulement, sans accent ni espace (ex. mairie-de-cahors).";
  }
  if (value.length < SLUG_MIN_LENGTH) {
    return `${SLUG_MIN_LENGTH} caractères au moins : plus court, le site de démarches le lirait comme un code de langue.`;
  }
  if (SLUG_RESERVED.includes(value)) {
    return `« ${value} » est réservé par le site de démarches : choisissez un autre identifiant.`;
  }
  return null;
}

/**
 * L'adresse que ce slug ouvre sur le site de démarches, telle qu'on la montre à
 * l'agent pendant qu'il saisit. Le domaine n'est pas repris ici : il appartient
 * à la collectivité racine, et c'est le chemin qui se décide dans ce champ.
 */
export function slugPathPreview(slug: string): string | null {
  const value = slug.trim();
  return value === "" || slugIssue(value) !== null ? null : "/" + value;
}
