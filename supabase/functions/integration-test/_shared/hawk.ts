/**
 * Authentification Hawk (HMAC-SHA256) — PORTÉE TELLE QUELLE depuis Clara
 * (`clara-mailflow-hub/supabase/functions/_shared/arpege.ts`), où elle signe
 * les appels de quatre fonctions Arpège en service. On n'a rien réécrit : les
 * primitives, l'en-tête et la règle de repli des identifiants sont ceux de
 * Clara, et le test (`hawk.test.ts`) reprend son oracle `node:crypto`.
 *
 * Web Crypto uniquement (`crypto.subtle`), aucune API Deno : importable par la
 * fonction ET par vitest.
 */

// ── Primitives cryptographiques ──

export function generateNonce(length = 6): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function hmacSha256(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

// ── En-tête Hawk ──

export interface HawkHeaderInput {
  url: string;
  method: string;
  id: string;
  key: string;
  /** Horodatage Hawk (secondes epoch) ; injecté pour un test déterministe. */
  ts: string;
  /** Nonce Hawk ; injecté pour un test déterministe. */
  nonce: string;
  contentType?: string;
  payload?: string;
}

/** Fonction pure : l'en-tête `Authorization: Hawk …` pour un `ts`/`nonce` donnés. */
export async function buildHawkAuthorizationHeader(input: HawkHeaderInput): Promise<string> {
  const { url, method, id, key, ts, nonce, contentType = "", payload = "" } = input;
  const u = new URL(url);
  const resource = u.pathname + u.search;
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  const payloadHashInput = `hawk.1.payload\n${contentType}\n${payload}\n`;
  const hash = await sha256(payloadHashInput);
  const normalized = `hawk.1.header\n${ts}\n${nonce}\n${method.toUpperCase()}\n${resource}\n${u.hostname}\n${port}\n${hash}\n\n`;
  const mac = await hmacSha256(key, normalized);
  return `Hawk id="${id}", ts="${ts}", nonce="${nonce}", hash="${hash}", mac="${mac}"`;
}

/** L'en-tête pour un appel réel : `ts` de l'horloge, `nonce` aléatoire. */
export async function buildHawkHeader(
  url: string,
  method: string,
  id: string,
  key: string,
  contentType = "",
  payload = "",
): Promise<string> {
  return buildHawkAuthorizationHeader({
    url,
    method,
    id,
    key,
    ts: Math.floor(Date.now() / 1000).toString(),
    nonce: generateNonce(),
    contentType,
    payload,
  });
}

// ── Identifiants Hawk ──

export interface HawkCredentialsSource {
  client_id?: string | null;
  client_secret?: string | null;
  access_token?: string | null;
}

/**
 * Règle de Clara, conservée : `client_id`/`client_secret` priment, repli
 * champ par champ sur `access_token` (ancien mode, encore requis par Ariane).
 * Chaîne vide si introuvable.
 */
export function resolveHawkCredentials(
  row: HawkCredentialsSource,
): { hawkId: string; hawkKey: string } {
  return {
    hawkId: row.client_id || row.access_token || "",
    hawkKey: row.client_secret || row.access_token || "",
  };
}

// ── Résolution d'URL ──

/**
 * Règle de Clara, conservée : retire les `/` de fin, et préfixe par le
 * domaine espace-citoyens une valeur qui n'est pas une URL absolue.
 */
export function resolveArpegeUrl(apiBaseUrl: string): string {
  let base = apiBaseUrl.replace(/\/+$/, "");
  if (!base.startsWith("http")) {
    base = `https://www.espace-citoyens.net${base.startsWith("/") ? "" : "/"}${base}`;
  }
  return base;
}
