/**
 * Génération de clés API côté navigateur (super admin). Le secret est un jeton
 * aléatoire à haute entropie (256 bits) ; **seul son hachage SHA-256 est
 * persisté** (colonne `api_keys.key_hash`). Le même algorithme de hachage est
 * appliqué côté edge function pour authentifier. Logique pure (Web Crypto),
 * testable sous vitest (Node 20+ expose `globalThis.crypto`).
 */

const KEY_BYTES = 32;
const KEY_PREFIX = "sk_live_";
/** Longueur du préfixe conservé en clair pour repérer une clé dans la liste. */
const DISPLAY_PREFIX_LENGTH = 12;

export interface GeneratedApiKey {
  /** Secret complet — affiché **une seule fois**, jamais stocké. */
  secret: string;
  /** Début du secret, stocké en clair (`key_prefix`) pour l'identifier. */
  prefix: string;
  /** SHA-256 hexadécimal du secret (`key_hash`). */
  hash: string;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 hexadécimal d'une chaîne. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Fabrique une nouvelle clé : secret + préfixe d'affichage + hachage. */
export async function generateApiKey(): Promise<GeneratedApiKey> {
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);
  const secret = KEY_PREFIX + base64url(bytes);
  const hash = await sha256Hex(secret);
  return { secret, prefix: secret.slice(0, DISPLAY_PREFIX_LENGTH), hash };
}
