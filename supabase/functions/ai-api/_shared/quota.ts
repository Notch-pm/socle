/**
 * La part du plafond qui se calcule et se dit — et qui appartient DÉSORMAIS
 * AU SOCLE.
 *
 * ⚠️ Ce module existe ici pour supprimer un jumeau, pas pour en créer un. La
 * période, la date de renouvellement et la phrase du refus étaient calculées
 * côté Iris ; une dérive entre les deux ferait mentir le message « crédit
 * renouvelé le … », et l'écran d'une application contredirait celui du Socle.
 * Le Socle les possède, les renvoie dans sa réponse, et les consommateurs se
 * contentent de les afficher.
 *
 * ⚠️ TOUT EST EN UTC. La période vit en base sous la forme
 * `to_char((now() at time zone 'utc'), 'YYYY-MM')`, et `reserve_ai_usage`
 * renvoie déjà `usage_period` et `renews_at`. Ce module sert au chemin où l'on
 * n'a pas appelé la RPC (le refus anticipé) et au formatage.
 *
 * Module PUR, testé.
 */

/** Période de comptage : `'2026-08'`, en UTC. Jumeau exact du SQL. */
export function periodKey(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Premier jour de la période suivante, en UTC (`'2026-09-01'`). */
export function nextRenewalIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

/**
 * « 1ᵉʳ septembre 2026 » à partir d'une date ISO `YYYY-MM-DD`.
 *
 * Composé à la main plutôt que par `Intl.DateTimeFormat` : le renouvellement
 * tombe TOUJOURS un premier du mois, qui s'écrit « 1ᵉʳ » et non « 1 » en
 * français — et une sortie ICU varie d'une version de runtime à l'autre, ce
 * qui rendrait le test fragile sans rien apporter.
 */
export function renewalLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  if (!match) return iso;
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return iso;
  return `1ᵉʳ ${MONTHS[month]} ${match[1]}`;
}

/**
 * Le message de refus, mot pour mot. Composé ICI et relayé tel quel par les
 * applications : c'est la seule information actionnable qu'un agent reçoive
 * quand le crédit est épuisé.
 */
export function quotaExceededMessage(renewsAtIso: string): string {
  return "Le plafond d'utilisation de l'assistant IA est atteint pour ce mois. " +
    `Le crédit sera renouvelé le ${renewalLabel(renewsAtIso)}.`;
}
