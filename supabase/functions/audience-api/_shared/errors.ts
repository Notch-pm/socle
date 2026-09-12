/**
 * Enveloppe d'erreur d'`audience-api` — même forme que les trois autres
 * fonctions (`{ "error": { "code", "message" } }`).
 *
 * La liste est COURTE, et c'est le signe que cette API est étroite : elle
 * incrémente des compteurs, elle ne lit rien, elle ne rend rien qu'un accusé.
 * Ni `429` (aucun crédit à épuiser — le frein vit chez l'appelant,
 * `portal-api`, au plus près de l'adresse IP que le Socle ne verra jamais), ni
 * `502` (elle n'appelle personne).
 *
 * `Response` est un standard web disponible en Deno comme en Node (vitest) :
 * ces fabriques sont testables hors runtime Deno.
 */

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export const ERROR_CODES = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  internal_error: 500,
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
