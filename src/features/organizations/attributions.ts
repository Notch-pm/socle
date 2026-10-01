/**
 * Attributions d'un organisme — ce qu'il TRAITE et ce qu'il ne traite pas.
 * Un texte Markdown court par organisation (table `organization_attributions`),
 * pour les agents et leurs outils IA : Clara s'en sert pour proposer le service
 * instructeur d'un courrier.
 *
 * ⚠️ **Interne** : jamais servi au portail. À ne confondre ni avec le
 * descriptif des informations usagers (public, pas sur un service interne), ni
 * avec les recommandations aux agents (consignes générales, racine seule).
 *
 * Sur **toute** organisation, services internes compris ; pas d'héritage.
 *
 * Pur (ni React, ni Supabase). ⚠️ La borne a son miroir dans
 * `supabase/functions/public-api/_shared/attributions.ts` et dans le CHECK de
 * la table ; un test épingle l'égalité.
 */

export const MAX_ATTRIBUTIONS_LENGTH = 2_000;

/**
 * Lecture tolérante de la colonne : tout ce qui n'est pas une chaîne est un
 * texte vide. Ni troncature ni `trim` — le champ est contrôlé, et retirer un
 * espace en fin de saisie mangerait celui que l'agent vient de taper.
 */
export function parseAttributions(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

/** Forme écrite en base : le texte sans ses blancs de bord. */
export function cleanAttributions(text: string): string {
  return text.trim();
}

export function isAttributionsEmpty(text: string): boolean {
  return text.trim() === "";
}
