/**
 * Estimation du coût d'un appel, en jetons.
 *
 * ⚠️ C'EST LE SOCLE QUI ESTIME, parce que c'est le Socle qui réserve.
 * L'appelant peut joindre son propre calcul (`estimated_tokens`), mais il n'a
 * qu'une valeur d'INDICATION : réserver sur un nombre fourni par le
 * consommateur reviendrait à verrouiller le plafond sur une déclaration, et
 * n'importe quelle application pourrait sous-déclarer pour passer. Le Socle
 * retient donc `max(indication, sienne)`.
 *
 * Prendre le maximum n'est pas de la politesse : avec un agent Mistral, une
 * partie du prompt système vit dans la console du fournisseur et échappe aux
 * DEUX côtés. Les deux sous-estiment ; la marge et la sortie réservée
 * absorbent l'écart, et le règlement corrige avec le `usage` réel.
 *
 * ⚠️ POURQUOI `chars / 3.5` ET NON `chars / 4` (la règle courante) : cette
 * dernière est calibrée sur l'anglais ASCII. Le français administratif coûte
 * 15 à 25 % de plus — les accents sont souvent des jetons à part entière, et
 * le vocabulaire (« justificatif », « réglementation ») se découpe en
 * plusieurs morceaux. On surestime délibérément : sous-estimer laisserait
 * dépasser le plafond avant que le règlement ne s'en aperçoive.
 *
 * Jumeau DOUX de `supabase/functions/_shared/ai/tokens.ts` d'Iris : une dérive
 * entre les deux change une marge, jamais un comportement — la valeur qui
 * réserve est celle d'ici. Le contrat est épinglé par les tests des deux côtés.
 *
 * Module PUR, testé.
 */

const CHARS_PER_TOKEN = 3.5;
const PER_MESSAGE_OVERHEAD = 4;

/** Sortie maximale acceptée. Au-delà, la demande est BORNÉE, pas refusée. */
export const MAX_OUTPUT_TOKENS = 2000;
/** Sortie par défaut quand l'appelant n'en propose pas. */
export const DEFAULT_OUTPUT_TOKENS = 900;
/**
 * Entrée maximale. Le plafond mensuel ne borne pas le coût d'UN appel : sans
 * cette limite, un consommateur emballé achèterait 250 000 jetons d'un coup.
 */
export const MAX_INPUT_TOKENS = 60000;

export function estimateTokens(text: string): number {
  if (typeof text !== "string" || text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface EstimatedMessage {
  role: string;
  content: string;
}

export function estimateMessagesTokens(messages: EstimatedMessage[]): number {
  return messages.reduce(
    (total, m) => total + estimateTokens(m.content) + PER_MESSAGE_OVERHEAD,
    0,
  );
}

/** Ce que coûte l'ENTRÉE seule — c'est elle que borne `MAX_INPUT_TOKENS`. */
export function estimateInput(system: string, messages: EstimatedMessage[]): number {
  return estimateTokens(system) + PER_MESSAGE_OVERHEAD + estimateMessagesTokens(messages);
}

/**
 * Ce qu'on réserve AVANT l'appel : l'entrée estimée plus la sortie maximale
 * autorisée. Réserver la sortie maximale est délibéré — au moment de la
 * réservation, personne ne sait ce que le modèle écrira, et un plafond doit se
 * tenir sur le pire cas. Le règlement rend ensuite la différence.
 */
export function reservationFor(
  system: string,
  messages: EstimatedMessage[],
  maxOutput: number,
  hint: number | null,
): number {
  const own = estimateInput(system, messages) + maxOutput;
  return Math.max(own, hint ?? 0);
}

/** Borne la sortie demandée : jamais refusée, toujours ramenée dans les clous. */
export function clampOutput(requested: unknown): number {
  const value = typeof requested === "number" && Number.isFinite(requested)
    ? Math.floor(requested)
    : DEFAULT_OUTPUT_TOKENS;
  if (value <= 0) return DEFAULT_OUTPUT_TOKENS;
  return Math.min(value, MAX_OUTPUT_TOKENS);
}
