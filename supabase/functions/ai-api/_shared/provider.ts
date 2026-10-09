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
 * ⚠️ L'OCR (`callProviderOcr`) NE REÇOIT PAS LE DOCUMENT, il reçoit une URL
 * SIGNÉE ET COURTE que le consommateur a émise et que le FOURNISSEUR va
 * chercher lui-même. Le Socle ne télécharge rien, ne met rien en cache, et le
 * lien meurt de lui-même : le passe-plat tient ici pour une raison de plus que
 * sur les complétions — l'octet ne traverse même pas le Socle. Ne jamais
 * remplacer l'URL par un envoi en base64 « pour simplifier » : ce serait
 * faire entrer le document dans cette fonction, donc dans ses journaux
 * possibles, et perdre la seule garantie qui ne repose sur personne.
 *
 * Module PUR (aucune dépendance Deno) : `fetch` est injectable, donc testable
 * hors réseau.
 */

const AGENTS_URL = "https://api.mistral.ai/v1/agents/completions";
const CHAT_URL = "https://api.mistral.ai/v1/chat/completions";
const OCR_URL = "https://api.mistral.ai/v1/ocr";
const CHAT_MODEL = "mistral-large-latest";
const OCR_MODEL = "mistral-ocr-latest";
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
  /** `"json"` ⇒ mode JSON du fournisseur. Traduit ici, et ici seulement. */
  responseFormat: "json" | null;
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
  // La traduction de l'alias du Socle vers la forme du fournisseur. C'est la
  // SEULE ligne du dépôt qui connaît le nom `json_object` : le jour où le
  // fournisseur le renomme, elle seule bouge.
  if (input.responseFormat === "json") payload.response_format = { type: "json_object" };

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

// ===========================================================================
// OCR
// ===========================================================================

/** Nature du lien remis au fournisseur — un document paginé, ou une image. */
export type OcrDocumentType = "document_url" | "image_url";

export interface OcrInput {
  apiKey: string;
  documentType: OcrDocumentType;
  /** URL SIGNÉE ET COURTE. Le fournisseur va la chercher ; le Socle jamais. */
  url: string;
}

export interface OcrPage {
  index: number;
  markdown: string;
}

export type OcrResult =
  | {
    ok: true;
    pages: OcrPage[];
    /** Pages facturées par le fournisseur, quand il le dit. */
    pagesProcessed: number | null;
  }
  | {
    ok: false;
    kind: "network" | "http" | "empty";
    status: number | null;
    detail: string;
  };

/**
 * L'OCR d'un document, par son URL.
 *
 * ⚠️ AUCUN `usage` EN JETONS ICI : le fournisseur facture l'OCR à la PAGE et
 * renvoie `usage_info.pages_processed`, pas un nombre de jetons. La conversion
 * en jetons — la seule monnaie du plafond — vit dans `ocr.ts`, pas ici : ce
 * module rend ce que le fournisseur a dit, il ne l'interprète pas.
 *
 * ⚠️ `include_image_base64: false` N'EST PAS UNE OPTIMISATION. Le vrai : sans
 * lui, le fournisseur renvoie chaque illustration du document encodée dans la
 * réponse — des mégaoctets d'image qui traverseraient le Socle pour finir dans
 * une réponse HTTP, quand on a promis de ne faire transiter que du texte.
 */
export async function callProviderOcr(
  input: OcrInput,
  fetchImpl: typeof fetch = fetch,
): Promise<OcrResult> {
  const payload = {
    model: OCR_MODEL,
    document: input.documentType === "image_url"
      ? { type: "image_url", image_url: input.url }
      : { type: "document_url", document_url: input.url },
    include_image_base64: false,
  };

  let res: Response | null = null;
  try {
    res = await fetchImpl(OCR_URL, {
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
    // ⚠️ L'URL SIGNÉE EST DANS L'ÉCHO, et une URL signée est un droit d'accès
    // au document. `sanitizeDetail` la traite comme le reste de la requête :
    // si le fournisseur nous la renvoie, le détail est écarté avant de
    // toucher un journal.
    return { ok: false, kind: "http", status: res.status, detail: sanitizeDetail(body, [input.url]) };
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch (_) {
    return { ok: false, kind: "empty", status: res.status, detail: "réponse illisible" };
  }

  const rawPages = isRecord(data) ? (data as { pages?: unknown }).pages : null;
  if (!Array.isArray(rawPages)) {
    return { ok: false, kind: "empty", status: res.status, detail: "réponse sans pages" };
  }

  const pages: OcrPage[] = [];
  for (let i = 0; i < rawPages.length; i++) {
    const page = rawPages[i];
    if (!isRecord(page)) continue;
    const markdown = page.markdown ?? page.text;
    if (typeof markdown !== "string") continue;
    const index = numberOrNull(page.index);
    pages.push({ index: index === null ? i : index, markdown });
  }

  // Un document sans un seul caractère n'est PAS une erreur : une page blanche
  // scannée en est une, et l'appelant a le droit de l'apprendre plutôt que de
  // recevoir « l'assistant est indisponible » et de retenter en boucle.
  const usage = isRecord(data) && isRecord((data as { usage_info?: unknown }).usage_info)
    ? (data as { usage_info: Record<string, unknown> }).usage_info
    : null;

  return {
    ok: true,
    pages,
    pagesProcessed: usage ? numberOrNull(usage.pages_processed) : null,
  };
}

// ===========================================================================
// AUDIO — transcription et synthèse
// ===========================================================================

/**
 * ⚠️ LA VOIX DE L'USAGER TRAVERSE CE MODULE, EN MÉMOIRE. Il n'existe pas, pour
 * l'audio, d'équivalent de l'URL signée de l'OCR qui ne suppose pas d'avoir
 * d'abord ÉCRIT l'enregistrement quelque part : les octets entrent, partent
 * chez le fournisseur, et seul le texte revient. Même isolement que le reste
 * du module — ni client de base, ni logger.
 *
 * ⚠️ Jamais un modèle `*-realtime-*` : il refuse l'envoi d'un fichier (lot 0).
 */
const TRANSCRIPTION_URL = "https://api.mistral.ai/v1/audio/transcriptions";
const SPEECH_URL = "https://api.mistral.ai/v1/audio/speech";
const TRANSCRIPTION_MODEL = "voxtral-mini-latest";
const SPEECH_MODEL = "voxtral-mini-tts-2603";

export interface TranscriptionInput {
  apiKey: string;
  audio: Uint8Array<ArrayBuffer>;
  mimeType: string;
  filename: string;
  /** Code de langue, ou `null` pour la détection automatique. */
  language: string | null;
}

export type TranscriptionResult =
  | {
    ok: true;
    text: string;
    /** Langue détectée ou imposée, quand le fournisseur la rend. */
    language: string | null;
    /** Secondes d'audio facturées par le fournisseur, quand il le dit. */
    audioSeconds: number | null;
  }
  | { ok: false; kind: "network" | "http" | "empty"; status: number | null; detail: string };

async function failure(res: Response, echoSources: string[]) {
  let body = "";
  try {
    body = await res.text();
  } catch (_) {
    body = "";
  }
  return { ok: false as const, kind: "http" as const, status: res.status, detail: sanitizeDetail(body, echoSources) };
}

export async function callProviderTranscription(
  input: TranscriptionInput,
  fetchImpl: typeof fetch = fetch,
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.append("model", TRANSCRIPTION_MODEL);
  form.append("file", new Blob([input.audio], { type: input.mimeType }), input.filename);
  if (input.language) form.append("language", input.language);

  let res: Response | null = null;
  try {
    res = await fetchImpl(TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (_) {
    return { ok: false, kind: "network", status: null, detail: "aucune réponse du fournisseur" };
  }
  if (!res.ok) return failure(res, []);

  let data: unknown = null;
  try {
    data = await res.json();
  } catch (_) {
    return { ok: false, kind: "empty", status: res.status, detail: "réponse illisible" };
  }
  const text = isRecord(data) ? (data as { text?: unknown }).text : null;
  // Un silence transcrit en « » n'est pas une panne : l'appelant a le droit de
  // l'apprendre (motif de la page blanche de l'OCR).
  if (typeof text !== "string") {
    return { ok: false, kind: "empty", status: res.status, detail: "réponse sans texte" };
  }
  const usage = isRecord(data) && isRecord((data as { usage?: unknown }).usage)
    ? (data as { usage: Record<string, unknown> }).usage
    : null;
  const language = isRecord(data) ? (data as { language?: unknown }).language : null;

  return {
    ok: true,
    text: text.trim(),
    language: typeof language === "string" && language !== "" ? language : null,
    audioSeconds: usage ? numberOrNull(usage.prompt_audio_seconds) : null,
  };
}

export interface SpeechInput {
  apiKey: string;
  text: string;
  /** Identifiant de voix préréglée — résolu par le Socle, jamais par l'appelant. */
  voiceId: string;
  format: "mp3" | "opus" | "wav";
}

export type SpeechResult =
  | { ok: true; audio: Uint8Array<ArrayBuffer> }
  | { ok: false; kind: "network" | "http" | "empty"; status: number | null; detail: string };

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * La synthèse d'un texte. Le fournisseur rend l'audio encodé en base64 dans un
 * JSON (`audio_data`) ; un octet brut est aussi accepté, au cas où il en
 * changerait. Pas de `stream` : le flux du fournisseur sert le PCM, et un
 * relais en flux reste une optimisation à venir (latence), pas un besoin.
 */
export async function callProviderSpeech(
  input: SpeechInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SpeechResult> {
  let res: Response | null = null;
  try {
    res = await fetchImpl(SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SPEECH_MODEL,
        input: input.text,
        voice_id: input.voiceId,
        response_format: input.format,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (_) {
    return { ok: false, kind: "network", status: null, detail: "aucune réponse du fournisseur" };
  }
  if (!res.ok) return failure(res, [input.text]);

  const type = res.headers.get("content-type") ?? "";
  try {
    if (type.includes("json")) {
      const data = await res.json();
      const encoded = isRecord(data) ? (data as { audio_data?: unknown }).audio_data : null;
      if (typeof encoded !== "string" || encoded === "") {
        return { ok: false, kind: "empty", status: res.status, detail: "réponse sans audio" };
      }
      return { ok: true, audio: base64ToBytes(encoded) };
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.length === 0) return { ok: false, kind: "empty", status: res.status, detail: "réponse sans audio" };
    return { ok: true, audio };
  } catch (_) {
    return { ok: false, kind: "empty", status: res.status, detail: "réponse illisible" };
  }
}
