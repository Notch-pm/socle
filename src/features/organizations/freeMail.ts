/**
 * Courrier libre du site de démarches (Nora → Clara) — règles pures, testées.
 *
 * L'usager écrit à un organisme un courrier qui ne relève d'aucune démarche ;
 * Clara le reçoit. Le Socle ne tient que l'interrupteur et le titre
 * (`portal_free_mail_settings`), servis par `GET /v1/portal/organizations`
 * (`free_mail`).
 *
 * ⚠️ Miroir de la contrainte SQL `portal_free_mail_settings_title_length` et de
 * `readPortalFreeMail` (`supabase/functions/public-api/_shared/serializers.ts`) :
 * un titre se trime, vide = `null` (le portail met alors son libellé traduit).
 */

/** Longueur maximale du titre, une fois trimé (contrainte SQL). */
export const FREE_MAIL_TITLE_MAX_LENGTH = 80;

/** Ce que le portail affiche quand aucun titre n'est saisi (en français). */
export const FREE_MAIL_DEFAULT_TITLE = "Envoyer un courrier libre";

/**
 * Les applications sans lesquelles le courrier libre n'a pas de sens : Nora
 * l'affiche, Clara le reçoit. L'abonnement est celui de la RACINE.
 */
export const FREE_MAIL_REQUIRED_APPLICATIONS = ["nora", "clara"] as const;

/** Titre tel qu'il s'enregistre : trimé, `null` s'il est vide. */
export function cleanFreeMailTitle(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  return value === "" ? null : value;
}

/** Ce qui cloche dans ce titre, ou `null`. */
export function freeMailTitleIssue(raw: string): string | null {
  const value = cleanFreeMailTitle(raw);
  if (value !== null && value.length > FREE_MAIL_TITLE_MAX_LENGTH) {
    return `${FREE_MAIL_TITLE_MAX_LENGTH} caractères au plus.`;
  }
  return null;
}

/** Les applications requises auxquelles la racine N'est PAS abonnée (vide = disponible). */
export function missingFreeMailApplications(subscribed: readonly string[]): string[] {
  return FREE_MAIL_REQUIRED_APPLICATIONS.filter((app) => !subscribed.includes(app));
}

const APPLICATION_LABELS: Record<string, string> = { nora: "Nora", clara: "Clara" };

/**
 * Pourquoi le courrier libre est indisponible, en une phrase destinée à un
 * administrateur — ou `null` s'il est disponible.
 */
export function freeMailUnavailableReason(subscribed: readonly string[]): string | null {
  const missing = missingFreeMailApplications(subscribed).map((app) => APPLICATION_LABELS[app] ?? app);
  if (missing.length === 0) return null;
  const names = missing.join(" et ");
  return (
    `Indisponible : la collectivité n'est pas abonnée à ${names}. Le courrier libre est ` +
    "proposé par le site de démarches (Nora) et reçu dans la gestion du courrier (Clara) ; " +
    "il faut les deux. L'abonnement se règle par l'équipe Edilumen."
  );
}
