/**
 * Validation du contrat de `ai-api` — la whitelist d'entrée et les refus.
 *
 * ⚠️ CE QUE L'APPELANT NE PEUT PAS DÉCIDER, et pourquoi chaque refus mérite sa
 * place :
 *
 *  • `consumer` — l'imputation vient de la CLÉ (`api_keys.consumer`), jamais du
 *    corps. Sans cela, n'importe quelle application pourrait faire porter sa
 *    dépense à une autre. C'est la doctrine « périmètre dérivé de la clé »
 *    appliquée à la facturation.
 *  • `model`, `agent_id` — le Socle reste l'AUTORITÉ SUR LE COÛT. Le
 *    consommateur passe un ALIAS (`agent`), que le Socle résout en secret. Un
 *    identifiant d'agent codé en dur côté appelant (le travers de Clara) ne
 *    peut pas se rejouer ici.
 *  • `tools`, `tool_choice` — aucun outil en v1. Chaque outil est un second
 *    chemin d'accès aux données, non audité, qui ruine l'argument « le
 *    consommateur compose son contexte, le Socle ne fait que relayer ».
 *  • `stream` — le décompte exige la réponse complète : le `usage` n'arrive
 *    que dans le dernier événement SSE, et une déconnexion laisserait une
 *    réservation posée jusqu'au balayage.
 *  • `temperature`, `top_p`, `response_format` — additifs plus tard si un
 *    consommateur le justifie ; les refuser maintenant ne coûte rien.
 *  • `role: "system"` dans `messages` — le prompt système a son propre champ,
 *    pour que le Socle sache le compter à part et qu'il n'y ait qu'une forme
 *    canonique.
 *
 * Module PUR (aucune dépendance Deno), testé.
 */

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Scope dédié — le scope `read` du référentiel ne suffit pas (motif `smtp`). */
export function hasAiScope(scopes: unknown): boolean {
  return Array.isArray(scopes) && scopes.includes("ai");
}

export interface OrgParentRow {
  id: string;
  parent_id: string | null;
}

/**
 * Remonte `parent_id` jusqu'à la racine. Le budget est par COLLECTIVITÉ : un
 * appel émis au nom d'une sous-organisation débite sa racine.
 * Jumeau de `contacts-api/_shared/validation.ts` — protégé des cycles.
 */
export function resolveRootOrgId(rows: OrgParentRow[], orgId: string): string | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let current = byId.get(orgId);
  if (!current) return null;
  const seen = new Set<string>([current.id]);
  while (current.parent_id) {
    const parent = byId.get(current.parent_id);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current.id;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompletionRequest {
  /** Libellé déclaratif de la fonctionnalité appelante, pour le détail du journal. */
  feature: string | null;
  /** Alias logique de l'agent (« assistant-instruction »), résolu par le Socle. */
  agent: string | null;
  system: string;
  messages: ChatMessage[];
  maxOutput: number;
  /** Estimation de l'appelant — INDICATION seulement (voir tokens.ts). */
  hint: number | null;
  referenceKind: string | null;
  referenceId: string | null;
  actorId: string | null;
}

export type ParseResult =
  | { ok: true; value: CompletionRequest }
  | { ok: false; code: "bad_request"; message: string };

const ALLOWED_KEYS = new Set([
  "feature", "agent", "system", "messages",
  "max_output_tokens", "estimated_tokens", "reference", "actor_id",
]);

/** Clés explicitement nommées dans le refus : le message doit être utile. */
const PROVIDER_KEYS: Record<string, string> = {
  model: "Le modèle est choisi par le Socle. Utilisez « agent » (alias).",
  agent_id: "L'agent est choisi par le Socle. Utilisez « agent » (alias).",
  tools: "Aucun outil n'est autorisé (v1).",
  tool_choice: "Aucun outil n'est autorisé (v1).",
  stream: "Le streaming n'est pas disponible : le décompte exige la réponse complète.",
  temperature: "Paramètre d'échantillonnage non accepté : le Socle fixe le comportement.",
  top_p: "Paramètre d'échantillonnage non accepté : le Socle fixe le comportement.",
  response_format: "Paramètre non accepté.",
  consumer: "L'imputation vient de la clé API, jamais du corps de la requête.",
  organization_id: "L'organisation vient de la clé API ou de l'en-tête X-Organization-Id.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function fail(message: string): ParseResult {
  return { ok: false, code: "bad_request", message };
}

const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 40000;

export function parseCompletionPayload(raw: unknown, clampOutput: (v: unknown) => number): ParseResult {
  if (!isRecord(raw)) return fail("Corps JSON attendu.");

  // Les clés « fournisseur » d'abord : le message est plus utile qu'un simple
  // « clé non autorisée ».
  for (const [key, why] of Object.entries(PROVIDER_KEYS)) {
    if (key in raw) return fail(why);
  }
  const unknown = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknown.length > 0) {
    return fail(`Clés non autorisées : ${unknown.join(", ")}.`);
  }

  const system = text(raw.system).trim();
  if (system === "") {
    return fail("« system » : le prompt système est attendu, composé par l'appelant.");
  }

  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    return fail("« messages » : au moins un message utilisateur est attendu.");
  }
  if (raw.messages.length > MAX_MESSAGES) {
    return fail(`« messages » : ${MAX_MESSAGES} tours au maximum.`);
  }

  const messages: ChatMessage[] = [];
  for (const entry of raw.messages) {
    if (!isRecord(entry)) return fail("« messages » : objet attendu.");
    if (entry.role === "system") {
      return fail("Le rôle « system » n'est pas accepté dans « messages » : utilisez le champ « system ».");
    }
    if (entry.role !== "user" && entry.role !== "assistant") {
      return fail("« messages » : rôle inconnu (user ou assistant attendus).");
    }
    const content = text(entry.content);
    if (content.trim() === "") return fail("« messages » : message vide.");
    if (content.length > MAX_MESSAGE_CHARS) {
      return fail(`« messages » : ${MAX_MESSAGE_CHARS} caractères au maximum par message.`);
    }
    messages.push({ role: entry.role, content });
  }
  if (messages[messages.length - 1].role !== "user") {
    return fail("« messages » : la dernière entrée doit être une question.");
  }

  let referenceKind: string | null = null;
  let referenceId: string | null = null;
  if (raw.reference !== undefined && raw.reference !== null) {
    if (!isRecord(raw.reference)) return fail("« reference » : objet { kind, id } attendu.");
    referenceKind = text(raw.reference.kind).trim() || null;
    const id = raw.reference.id;
    if (id !== undefined && id !== null) {
      if (!isUuid(id)) return fail("« reference.id » : UUID attendu.");
      referenceId = id;
    }
  }

  const actorId = raw.actor_id;
  if (actorId !== undefined && actorId !== null && !isUuid(actorId)) {
    return fail("« actor_id » : UUID attendu.");
  }

  const hint = typeof raw.estimated_tokens === "number" && Number.isFinite(raw.estimated_tokens)
    ? Math.max(0, Math.floor(raw.estimated_tokens))
    : null;

  return {
    ok: true,
    value: {
      feature: text(raw.feature).trim() || null,
      agent: text(raw.agent).trim() || null,
      system,
      messages,
      maxOutput: clampOutput(raw.max_output_tokens),
      hint,
      referenceKind,
      referenceId,
      actorId: isUuid(actorId) ? actorId : null,
    },
  };
}
