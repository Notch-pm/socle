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

/**
 * Secondes restantes jusqu'à la fenêtre de débit suivante — l'en-tête
 * `Retry-After` d'un refus de cadence.
 *
 * La fenêtre est la MINUTE (voir `reserve_ai_usage`), donc le crédit de débit
 * repart au prochain top. Renvoyer 60 en toutes circonstances ferait attendre
 * un agent freiné à la 59ᵉ seconde une minute entière pour rien.
 *
 * Jamais 0 : `Retry-After: 0` invite à réessayer immédiatement, ce qui est
 * exactement le comportement qu'on veut freiner. Le plancher est 1.
 */
export function secondsUntilNextMinute(now: Date): number {
  const elapsed = now.getUTCSeconds() + now.getUTCMilliseconds() / 1000;
  return Math.max(1, Math.ceil(60 - elapsed));
}

/**
 * Le message d'un refus de CADENCE. Deux exigences, et la seconde a été apprise
 * en cours de route :
 *
 *  1. Il ne parle pas du CRÉDIT : le budget est intact, c'est le rythme qui ne
 *     l'est pas — et le geste attendu n'est pas de demander un relèvement, mais
 *     d'attendre quelques secondes.
 *  2. ⚠️ Il ne parle d'AUCUNE ROUTE en particulier. La première version disait
 *     « trop de questions à l'assistant » : juste pour `/v1/completions`, faux
 *     pour `/v1/ocr`, où un agent de Clara lisant un lot de courrier aurait reçu
 *     un message parlant d'un assistant qu'il n'a pas sollicité. Les deux routes
 *     refusent avec les mêmes mots (voir les fabriques d'`index.ts`) : ces mots
 *     doivent donc valoir pour les deux, et pour celles qui viendront.
 */
export function rateLimitedMessage(): string {
  return "Trop d'appels à l'IA en peu de temps. " +
    "Réessayez dans quelques secondes.";
}

/**
 * Une part réservée, telle que la sert la RPC `ai_usage_shares` (résolue par
 * le serveur contre le plafond commun actif : `effective_tokens` NULL = sans
 * effet — part désactivée, ou pourcentage sans plafond).
 */
export interface ShareRow {
  consumer: string;
  effective_tokens: number | null;
  used_tokens: number;
  reserved_tokens: number;
}

/**
 * Le plafond d'une application SANS part : le commun moins les parts des
 * autres. Jumeau de `v_caller_limit` dans `reserve_ai_usage` et de
 * `remainderLimit` (front) — un chiffre que `/v1/usage` doit rendre
 * IDENTIQUE à celui du refus 429, sans quoi une application lirait deux
 * plafonds pour le même mois.
 *
 * `max(part, engagé)` et non `part` : une part dépassée par un règlement
 * plus lourd que son estimation a consommé au-delà, et ce dépassement est
 * sorti du reste. Jamais négatif — n parts peuvent, ensemble, dépasser le
 * plafond.
 */
export function callerLimit(plafond: number | null, shares: ShareRow[], consumer: string): number | null {
  if (plafond === null || plafond <= 0) return null;
  const taken = shares.reduce((sum, s) => {
    if (s.consumer === consumer || s.effective_tokens === null) return sum;
    return sum + Math.max(s.effective_tokens, s.used_tokens + s.reserved_tokens);
  }, 0);
  return Math.max(plafond - taken, 0);
}

/** L'engagé des AUTRES parts, à retrancher de l'engagé commun pour rendre à l'appelant le sien. */
export function othersEngaged(shares: ShareRow[], consumer: string): { used: number; reserved: number } {
  return shares.reduce(
    (acc, s) => {
      if (s.consumer === consumer || s.effective_tokens === null) return acc;
      return { used: acc.used + s.used_tokens, reserved: acc.reserved + s.reserved_tokens };
    },
    { used: 0, reserved: 0 },
  );
}
