/**
 * L'appel au fournisseur — isolé, et isolé POUR UNE RAISON.
 *
 * ⚠️ CE MODULE NE REÇOIT NI CLIENT SUPABASE, NI LOGGER, NI RIEN QUI SACHE
 * ÉCRIRE. C'est la troisième preuve du passe-plat, après l'absence de colonne
 * texte dans le schéma et l'étroitesse des signatures de RPC : le prompt entre
 * ici, une réponse en sort, et il n'existe aucun chemin par lequel l'un ou
 * l'autre pourrait être conservé. Ne jamais lui passer de dépendance capable
 * de persister quoi que ce soit.
 *
 * ⚠️ L'ERREUR DU FOURNISSEUR N'EST JAMAIS RELAYÉE À L'APPELANT (motif
 * `relaySocleError` de la gamme) : elle sert aux journaux du Socle, et
 * `sanitizeDetail` la neutralise si le fournisseur nous renvoie notre propre
 * requête en écho — ce que certaines API font sur une erreur de validation.
 *
 * ⚠️ LA CHAÎNE DE DÉLAIS EST UNE RÈGLE : Mistral 55 s < Socle 60 s < Iris 75 s.
 * Inversée, un consommateur abandonne des appels que le Socle termine et
 * facture.
 *
 * ⚠️ `/v1/agents/completions` est SANS ÉTAT (`agent_id` + `messages` à chaque
 * appel). Ne jamais basculer sur `/v1/conversations`, qui stocke le fil chez
 * le fournisseur — ce serait persister là-bas ce qu'on refuse de garder ici.
 *
 * Module PUR (aucune dépendance Deno) : `fetch` est injectable, donc testable
 * hors réseau.
 */

const AGENTS_URL = "https://api.mistral.ai/v1/agents/completions";
const CHAT_URL = "https://api.mistral.ai/v1/chat/completions";
const CHAT_MODEL = "mistral-large-latest";
const TEMPERATURE = 0.2;
const TIMEOUT_MS = 55_000;

export const PROVIDER_NAME = "mistral";

export interface ProviderMessage {
  role: string;
  content: string;
}

export interface ProviderInput {
  apiKey: string;
  /** Identifiant d'agent de la console. Absent ⇒ repli sur chat/completions. */
  agentId: string | null;
  system: string;
  messages: ProviderMessage[];
  maxTokens: number;
}

export type ProviderResult =
  | {
    ok: true;
    answer: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  }
  | {
    ok: false;
    /** `network` = pas de réponse ; `http` = statut d'erreur ; `empty` = réponse inexploitable. */
    kind: "network" | "http" | "empty";
    status: number | null;
    /** Mots DU FOURNISSEUR, pour les journaux du Socle. Jamais renvoyé à l'appelant. */
    detail: string;
  };

const DETAIL_MAX = 200;
/**
 * Longueur d'un fragment au-delà de laquelle une coïncidence n'en est plus
 * une : si le message du fournisseur contient 40 caractères consécutifs de
 * notre requête, c'est un écho, pas une erreur.
 */
const ECHO_WINDOW = 40;

/**
 * Neutralise un message d'erreur qui contiendrait notre propre requête. Le
 * détail part dans les journaux ; il ne doit pas y faire entrer par la fenêtre
 * ce que le schéma interdit par la porte.
 */
export function sanitizeDetail(detail: string, inputs: string[]): string {
  const short = (detail ?? "").slice(0, DETAIL_MAX);
  if (short.length < ECHO_WINDOW) return short;
  const haystack = inputs.join("\n");
  for (let i = 0; i + ECHO_WINDOW <= short.length; i++) {
    if (haystack.includes(short.slice(i, i + ECHO_WINDOW))) {
      return "[réponse du fournisseur écartée : elle contenait la requête]";
    }
  }
  return short;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function callProvider(
  input: ProviderInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderResult> {
  const payload: Record<string, unknown> = {
    messages: [{ role: "system", content: input.system }, ...input.messages],
    max_tokens: input.maxTokens,
  };
  // L'agent porte le ton et les règles générales (console du fournisseur,
  // versionnées dans la documentation). Sans agent configuré, le repli utilise
  // le modèle par défaut — le consommateur ne voit aucune différence.
  if (input.agentId) payload.agent_id = input.agentId;
  else {
    payload.model = CHAT_MODEL;
    payload.temperature = TEMPERATURE;
  }

  const echoSources = [input.system, ...input.messages.map((m) => m.content)];

  let res: Response | null = null;
  try {
    res = await fetchImpl(input.agentId ? AGENTS_URL : CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (_) {
    return { ok: false, kind: "network", status: null, detail: "aucune réponse du fournisseur" };
  }

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch (_) {
      body = "";
    }
    return {
      ok: false,
      kind: "http",
      status: res.status,
      detail: sanitizeDetail(body, echoSources),
    };
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch (_) {
    return { ok: false, kind: "empty", status: res.status, detail: "réponse illisible" };
  }

  const choices = isRecord(data) ? (data as { choices?: unknown }).choices : null;
  const first = Array.isArray(choices) ? choices[0] : null;
  const message = isRecord(first) ? (first as { message?: unknown }).message : null;
  const answer = isRecord(message) ? (message as { content?: unknown }).content : null;
  if (typeof answer !== "string" || answer.trim() === "") {
    return { ok: false, kind: "empty", status: res.status, detail: "réponse vide ou inattendue" };
  }

  const usage = isRecord(data) && isRecord((data as { usage?: unknown }).usage)
    ? (data as { usage: Record<string, unknown> }).usage
    : null;

  return {
    ok: true,
    answer: answer.trim(),
    promptTokens: usage ? numberOrNull(usage.prompt_tokens) : null,
    completionTokens: usage ? numberOrNull(usage.completion_tokens) : null,
    totalTokens: usage ? numberOrNull(usage.total_tokens) : null,
  };
}
