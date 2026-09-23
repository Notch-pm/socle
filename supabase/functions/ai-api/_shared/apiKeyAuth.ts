// Authentification par clé API — la décision, pure et testée.
//
// ⚠️ IDENTIQUE dans `public-api/_shared/`, `contacts-api/_shared/`,
// `ai-api/_shared/` et `audience-api/_shared/` — un test d'identité l'exige
// (`apiKeyAuth.test.ts`). Pas
// de `_shared` de premier niveau : le déploiement MCP (`deploy_edge_function`,
// fichiers relatifs à la racine de la fonction) ne sait pas exprimer
// `../_shared/`. Avant ce module, le même bloc était copié trois fois à la
// main, sans test ; toute évolution du modèle de clé se faisait trois fois.
//
// Ce que le module décide :
//   • une clé absente, révoquée ou expirée → 401 ;
//   • une clé sans le scope demandé → 403 ;
//   • une clé PLATEFORME sans application → 403 : depuis le registre des
//     applications (2026-09-08), le périmètre d'une clé plateforme EST la
//     liste des collectivités abonnées à son application. Sans application,
//     pas de périmètre — et « tout » n'est plus une réponse.
//
// Ce que le module NE fait PAS : lire la base. La fonction cherche la ligne
// par le hachage du secret, puis demande ici ce qu'elle vaut, puis calcule le
// périmètre par la RPC que `scopeRequest` désigne.

/** Colonnes à sélectionner sur `api_keys` — jamais `key_hash`. */
export const API_KEY_COLUMNS = "id, organization_id, revoked_at, expires_at, scopes, consumer, last_used_at";

/** La ligne telle que PostgREST la rend. */
export interface ApiKeyRow {
  id: string;
  organization_id: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  scopes: unknown;
  consumer: string | null;
  last_used_at: string | null;
}

/** La clé une fois admise. */
export interface AuthenticatedKey {
  id: string;
  organization_id: string | null;
  scopes: string[];
  consumer: string | null;
  last_used_at: string | null;
}

export type ApiKeyDecision =
  | { ok: true; key: AuthenticatedKey }
  | { ok: false; code: "unauthorized" | "forbidden"; message: string };

export const UNAUTHORIZED_MESSAGE = "Clé API invalide, révoquée ou expirée.";
export const PLATFORM_WITHOUT_APPLICATION_MESSAGE =
  "Cette clé plateforme n'est rattachée à aucune application : son périmètre ne peut pas être déterminé.";

export function evaluateApiKey(
  row: ApiKeyRow | null | undefined,
  options: { requiredScope: string; scopeMessage: string; now?: Date },
): ApiKeyDecision {
  const now = options.now ?? new Date();
  if (
    !row ||
    row.revoked_at !== null ||
    (row.expires_at !== null && new Date(row.expires_at).getTime() < now.getTime())
  ) {
    return { ok: false, code: "unauthorized", message: UNAUTHORIZED_MESSAGE };
  }

  const scopes = Array.isArray(row.scopes)
    ? row.scopes.filter((s): s is string => typeof s === "string")
    : [];
  if (!scopes.includes(options.requiredScope)) {
    return { ok: false, code: "forbidden", message: options.scopeMessage };
  }

  const consumer = typeof row.consumer === "string" && row.consumer.trim() !== ""
    ? row.consumer.trim()
    : null;
  if (row.organization_id === null && consumer === null) {
    return { ok: false, code: "forbidden", message: PLATFORM_WITHOUT_APPLICATION_MESSAGE };
  }

  return {
    ok: true,
    key: {
      id: row.id,
      organization_id: row.organization_id,
      scopes,
      consumer,
      last_used_at: row.last_used_at ?? null,
    },
  };
}

/**
 * Pas plus d'une horodate d'usage toutes les 5 minutes par clé.
 *
 * `last_used_at` n'est qu'un indicateur (« dernière utilisation » dans la liste
 * des clés du superadmin) ; l'écrire à CHAQUE requête coûtait une écriture par
 * appel — et une clé PLATEFORME (le portail Nora) porte tout le trafic public
 * de toutes les collectivités sur UNE seule ligne : tuples morts en rafale sur
 * une ligne chaude, et une latence ajoutée à chaque réponse tant que
 * l'écriture était attendue. Audit purge / performance du 2026-09-23.
 */
export const KEY_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function shouldTouchKey(lastUsedAt: string | null, now: Date = new Date()): boolean {
  if (lastUsedAt === null) return true;
  const last = new Date(lastUsedAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= KEY_TOUCH_INTERVAL_MS;
}

/**
 * Comment calculer le périmètre : par la racine de la clé (`org_subtree_ids`),
 * ou par l'application de la clé plateforme (`application_scope_ids`).
 */
export type ScopeRequest =
  | { kind: "root"; rpc: "org_subtree_ids"; args: { root: string } }
  | { kind: "platform"; rpc: "application_scope_ids"; args: { p_application: string } };

export function scopeRequest(key: AuthenticatedKey): ScopeRequest {
  if (key.organization_id !== null) {
    return { kind: "root", rpc: "org_subtree_ids", args: { root: key.organization_id } };
  }
  // `evaluateApiKey` garantit `consumer` sur une clé plateforme admise.
  return {
    kind: "platform",
    rpc: "application_scope_ids",
    args: { p_application: key.consumer ?? "" },
  };
}
