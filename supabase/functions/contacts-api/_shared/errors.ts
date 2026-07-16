/**
 * Enveloppe d'erreur stable et fabriques de `Response` JSON — même contrat que
 * `public-api` (`{ "error": { code, message } }`), avec en plus `conflict` (409)
 * pour les violations d'unicité (SIRET, référence externe). `Response` est un
 * standard web disponible en Deno comme en Node (vitest) → testable hors Deno.
 */

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** Codes d'erreur applicatifs (stables, documentés dans l'OpenAPI). */
export const ERROR_CODES = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
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
