/**
 * Enveloppe d'erreur de `ai-api` — même forme que `public-api` et
 * `contacts-api` (`{ "error": { "code", "message" } }`), avec cinq codes que
 * la gamme n'avait encore jamais eu besoin d'exprimer.
 *
 * `Response` est un standard web disponible en Deno comme en Node (vitest) :
 * ces fabriques sont testables hors runtime Deno.
 */

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/**
 * Codes applicatifs, stables et documentés dans l'OpenAPI.
 *
 * Les quatre derniers sont propres à cette API :
 *  • `payload_too_large` — une requête qui achèterait un appel démesuré en une
 *    fois. Le plafond mensuel ne borne pas le coût d'UN appel ; celui-ci si.
 *  • `ai_quota_exceeded` — le plafond de la collectivité est atteint. 429 et
 *    non 403 : ce n'est pas un droit qui manque, c'est un crédit.
 *  • `ai_rate_limited` — trop d'appels en peu de temps. 429 lui aussi, mais
 *    DISTINCT du précédent, et la distinction est utile à qui la reçoit : le
 *    crédit est intact, c'est le rythme qui ne l'est pas. Le geste attendu
 *    n'est pas de demander un relèvement, mais d'attendre — d'où l'en-tête
 *    `Retry-After`, que le refus de plafond ne porte pas (lui, il faut
 *    attendre le mois prochain).
 *  • `ai_unavailable` — le fournisseur n'a pas répondu. 502 : la faute est en
 *    amont, pas chez l'appelant. Son erreur brute n'est JAMAIS relayée.
 *  • `not_configured` — la plateforme n'a pas de clé fournisseur. 503 : c'est
 *    temporaire et cela se règle côté Socle, pas côté appelant.
 */
export const ERROR_CODES = {
  bad_request: 400,
  payload_too_large: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  ai_quota_exceeded: 429,
  ai_rate_limited: 429,
  internal_error: 500,
  ai_unavailable: 502,
  not_configured: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export function errorBody(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/** Réponse d'erreur : le statut HTTP découle du code applicatif. */
export function errorResponse(
  code: ErrorCode,
  message: string,
  headers: Record<string, string>,
): Response {
  return jsonResponse(ERROR_CODES[code], errorBody(code, message), headers);
}
