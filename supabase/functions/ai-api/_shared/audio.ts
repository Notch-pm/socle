/**
 * Le contrat de `POST /v1/transcriptions` et `POST /v1/speech` — validation de
 * l'entrée, choix de la voix, et conversion du coût de l'audio dans la monnaie
 * du plafond.
 *
 * ⚠️ LE PLAFOND EST EN JETONS, L'AUDIO SE FACTURE À LA SECONDE (transcription)
 * ET AU CARACTÈRE (synthèse). Ce module est l'endroit — le seul — où ces unités
 * rencontrent le jeton, sur le motif d'`ocr.ts` : une monnaie unique, un
 * chiffre approché, plutôt que trois crédits à surveiller pour une facture.
 * La conversion se fait AU COÛT : un jeton du plafond vaut ce que vaut un jeton
 * de modèle au prix de référence ci-dessous. Changer un tarif, c'est changer
 * une constante ici, et nulle part ailleurs.
 *
 * ⚠️ L'AUDIO TRAVERSE LE SOCLE, EN MÉMOIRE SEULEMENT. Contrairement à l'OCR (URL
 * signée), il n'existe pas de lien que le fournisseur pourrait aller chercher
 * sans que la voix de l'usager soit d'abord ÉCRITE quelque part — ce qui serait
 * pire. Les octets entrent dans la requête, partent chez le fournisseur, et ne
 * touchent ni journal, ni stockage, ni base (tests `passthrough.test.ts`).
 *
 * Module PUR (aucune dépendance Deno), testé.
 */

import { isUuid } from "./validation.ts";

// ── Tarifs et conversion (lot 0 du mode dialogue, 2026-10-09) ──────────────

/** Prix fournisseur de la transcription par lots (Voxtral Mini Transcribe 2). */
const TRANSCRIPTION_USD_PER_MINUTE = 0.003;
/** Prix fournisseur de la synthèse (Voxtral TTS). */
const SPEECH_USD_PER_THOUSAND_CHARS = 0.016;
/**
 * Prix de référence d'un jeton du plafond. Arrondi à 1 $ le million, au-dessus
 * du prix d'entrée du modèle de conversation et sous son prix de sortie :
 * c'est un ordre de grandeur, assumé comme tel — et une seule ligne à changer
 * le jour où la politique commerciale le fixe autrement.
 */
const REFERENCE_USD_PER_MILLION_TOKENS = 1;

/**
 * Arrondi au millionième : la virgule flottante ferait de 50 un 50,000…04, et
 * l'arrondi au jeton supérieur d'une durée ronde compterait un jeton de trop.
 */
const tidy = (value: number) => Math.round(value * 1e6) / 1e6;

/** 50 jetons par seconde d'audio transcrit. */
export const TOKENS_PER_AUDIO_SECOND = tidy(
  (TRANSCRIPTION_USD_PER_MINUTE / 60) * (1_000_000 / REFERENCE_USD_PER_MILLION_TOKENS),
);
/** 16 jetons par caractère prononcé. */
export const TOKENS_PER_SPOKEN_CHAR = tidy(
  (SPEECH_USD_PER_THOUSAND_CHARS / 1000) * (1_000_000 / REFERENCE_USD_PER_MILLION_TOKENS),
);

// ── Bornes d'un appel ─────────────────────────────────────────────────────
// Même raison d'être que `MAX_INPUT_TOKENS` et `MAX_OCR_PAGES` : le plafond
// MENSUEL ne borne pas le coût d'UN appel.

/** Durée maximale d'un enregistrement. Au-delà, l'appelant découpe. */
export const MAX_AUDIO_SECONDS = 300;
/** Taille maximale d'un fichier — 5 min de WAV 16 kHz mono tiennent dans 10 Mo. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
/**
 * Plancher de débit pour un format COMPRESSÉ, dont on ne sait pas lire la
 * durée sans le décoder : 4 000 octets par seconde (32 kbit/s), soit le bas de
 * la fourchette d'une voix compressée. Il sert à RÉSERVER et à refuser l'audio
 * démesuré — jamais à facturer. Sans lui, un fichier compressé très
 * longuement annoncé « 1 seconde » ferait réserver presque rien.
 */
const COMPRESSED_BYTES_PER_SECOND = 4000;
/** Texte maximal d'une synthèse — le fournisseur recommande moins de 300 mots. */
export const MAX_SPEECH_CHARS = 2000;

/**
 * Langues que la transcription accepte (relevé du lot 0 — le fournisseur rend
 * cette liste dans son refus). Une langue hors liste est refusée ICI, avant
 * toute réservation : sinon le fournisseur refuserait APRÈS qu'on a réservé.
 * L'absence de langue est acceptée : la détection automatique a rendu la
 * dictée de l'essai à l'identique.
 */
export const TRANSCRIPTION_LANGUAGES = [
  "ar", "de", "en", "es", "fr", "hi", "it", "ja", "ko", "nl", "pt", "ru", "zh",
] as const;

/**
 * Formats acceptés par la transcription. Vérifiés au lot 0 : WAV (dont 16 kHz
 * mono, le format du navigateur), MP3, FLAC, Ogg/Opus ; M4A est documenté par
 * le fournisseur. Pas de WebM : non vérifié, et le navigateur n'a pas à en
 * envoyer.
 */
const AUDIO_TYPES: Record<string, "wav" | "compressed"> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "compressed",
  "audio/mp3": "compressed",
  "audio/flac": "compressed",
  "audio/x-flac": "compressed",
  "audio/ogg": "compressed",
  "audio/opus": "compressed",
  "audio/mp4": "compressed",
  "audio/x-m4a": "compressed",
  "audio/m4a": "compressed",
};

// ── Voix ──────────────────────────────────────────────────────────────────

/**
 * La voix de chaque langue parlée — un PRÉRÉGLAGE du fournisseur, jamais une
 * voix clonée. Le fournisseur ne propose de préréglages qu'en français et en
 * anglais (lot 0) ; il lit les autres langues avec un accent étranger, et
 * l'arabe, le russe ou le chinois en charabia : on ne les prononce donc pas.
 *
 * L'appelant ne nomme jamais une voix : il donne une langue, le Socle choisit
 * (motif des alias d'agent). Un secret `MISTRAL_VOICE_<LANGUE>` remplace le
 * préréglage sans redéploiement de code chez personne.
 */
export const SPEECH_VOICES: Record<string, { slug: string; id: string }> = {
  // Choix PO du 2026-10-09, à l'écoute.
  fr: { slug: "fr_marie_curious", id: "e0580ce5-e63c-4cbe-88c8-a983b80c5f1f" },
  en: { slug: "en_paul_neutral", id: "c69964a6-ab8b-4f8a-9465-ec0925096ec8" },
};

/** Langues prononcées : celles qui ont une voix. */
export const SPEECH_LANGUAGES = Object.keys(SPEECH_VOICES);

/** Formats de sortie. `mp3` par défaut : le plus léger qu'un navigateur lise partout. */
const SPEECH_FORMATS = { mp3: "audio/mpeg", opus: "audio/ogg", wav: "audio/wav" } as const;
export type SpeechFormat = keyof typeof SPEECH_FORMATS;

export function speechContentType(format: SpeechFormat): string {
  return SPEECH_FORMATS[format];
}

/** La voix d'une langue : le secret s'il est posé, sinon le préréglage. */
export function voiceIdFor(language: string, env: (name: string) => string | undefined): string | null {
  const preset = SPEECH_VOICES[language];
  if (!preset) return null;
  const override = env(`MISTRAL_VOICE_${language.toUpperCase()}`)?.trim();
  return override ? override : preset.id;
}

// ── Conversion ────────────────────────────────────────────────────────────

/** Ce qu'on réserve et solde pour une durée d'audio transcrite. */
export function tokensForAudioSeconds(seconds: number): number {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
  return Math.max(1, Math.ceil(s * TOKENS_PER_AUDIO_SECOND));
}

/**
 * Ce qu'on réserve ET solde pour une synthèse. Le texte est connu avant
 * l'appel et le fournisseur facture au caractère : la réservation est donc
 * exacte, et le règlement la confirme.
 */
export function tokensForSpeech(text: string): number {
  return Math.max(1, Math.ceil([...text].length * TOKENS_PER_SPOKEN_CHAR));
}

/**
 * Durée d'un WAV, lue dans son en-tête (octets de données ÷ débit). `null` si
 * l'en-tête est illisible — l'appelant retombe alors sur le plancher des
 * formats compressés, qui SURESTIME un WAV : on réserve trop, jamais trop peu.
 */
export function wavSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let offset = 12;
  let byteRate: number | null = null;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 20 <= bytes.length) byteRate = view.getUint32(offset + 16, true);
    if (id === "data") {
      if (!byteRate) return null;
      // Un WAV écrit en flux annonce parfois une taille fictive (0xFFFFFFFF) :
      // on retient ce qui est réellement là.
      const available = bytes.length - offset - 8;
      return Math.min(size, available) / byteRate;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

/**
 * La durée qu'on RÉSERVE : la plus grande de l'annonce et de ce que le fichier
 * prouve. Sous-déclarer ne fait rien gagner — le règlement retient la durée
 * mesurée par le fournisseur.
 */
export function reservationSeconds(bytes: Uint8Array, kind: "wav" | "compressed", hintSeconds: number): number {
  const measured = kind === "wav" ? wavSeconds(bytes) : null;
  const floor = measured ?? bytes.length / COMPRESSED_BYTES_PER_SECOND;
  return Math.max(hintSeconds, floor);
}

// ── Validation ────────────────────────────────────────────────────────────

type ParseFailure = { ok: false; code: "bad_request" | "payload_too_large"; message: string };
export type ParseResult<T> = { ok: true; value: T } | ParseFailure;

function fail(message: string, code: ParseFailure["code"] = "bad_request"): ParseFailure {
  return { ok: false, code, message };
}

/** Ce que l'appelant ne décide pas, sur les deux routes. */
const PROVIDER_KEYS: Record<string, string> = {
  model: "Le modèle est choisi par le Socle.",
  voice: "La voix est choisie par le Socle : indiquez la langue.",
  voice_id: "La voix est choisie par le Socle : indiquez la langue.",
  ref_audio: "Non accepté : le Socle ne prononce qu'avec ses voix préréglées.",
  stream: "Le flux n'est pas accepté : le décompte n'arrive qu'en fin de flux.",
  consumer: "L'imputation vient de la clé API, jamais du corps de la requête.",
  organization_id: "L'organisation vient de la clé API ou de l'en-tête X-Organization-Id.",
};

function readCommon(get: (key: string) => unknown):
  | { ok: true; feature: string | null; actorId: string | null; referenceKind: string | null; referenceId: string | null }
  | { ok: false; message: string } {
  const feature = get("feature");
  const actorId = get("actor_id");
  if (actorId !== undefined && actorId !== null && actorId !== "" && !isUuid(actorId)) {
    return { ok: false, message: "« actor_id » : UUID attendu." };
  }
  const referenceId = get("reference_id");
  if (referenceId !== undefined && referenceId !== null && referenceId !== "" && !isUuid(referenceId)) {
    return { ok: false, message: "« reference_id » : UUID attendu." };
  }
  const referenceKind = get("reference_kind");
  return {
    ok: true,
    feature: (typeof feature === "string" ? feature : "").trim() || null,
    actorId: isUuid(actorId) ? actorId : null,
    referenceKind: (typeof referenceKind === "string" ? referenceKind : "").trim() || null,
    referenceId: isUuid(referenceId) ? referenceId : null,
  };
}

export interface TranscriptionRequest {
  audio: Uint8Array<ArrayBuffer>;
  mimeType: string;
  filename: string;
  language: string | null;
  /** Secondes à RÉSERVER — la plus grande de l'annonce et de ce que prouve le fichier. */
  reserveSeconds: number;
  feature: string | null;
  actorId: string | null;
  referenceKind: string | null;
  referenceId: string | null;
}

const TRANSCRIPTION_KEYS = new Set([
  "file", "duration_ms", "language", "feature", "actor_id", "reference_kind", "reference_id",
]);

/** Le minimum qu'on lit d'une entrée de formulaire multipart (testable sans `File`). */
export interface AudioPart {
  type: string;
  name?: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function isAudioPart(value: unknown): value is AudioPart {
  return typeof value === "object" && value !== null &&
    typeof (value as AudioPart).arrayBuffer === "function" &&
    typeof (value as AudioPart).size === "number";
}

/**
 * `multipart/form-data` : `file` (l'audio), `duration_ms` (durée annoncée),
 * `language`, `feature`, `actor_id`, `reference_kind`, `reference_id`.
 * Prend des paires clé/valeur plutôt qu'un `FormData` : testable tel quel.
 */
export async function parseTranscriptionForm(
  entries: Iterable<[string, unknown]>,
): Promise<ParseResult<TranscriptionRequest>> {
  const fields = new Map<string, unknown>();
  for (const [key, value] of entries) {
    if (fields.has(key)) return fail(`« ${key} » : une seule valeur attendue.`);
    fields.set(key, value);
  }
  for (const [key, why] of Object.entries(PROVIDER_KEYS)) {
    if (fields.has(key)) return fail(why);
  }
  const unknown = [...fields.keys()].filter((k) => !TRANSCRIPTION_KEYS.has(k));
  if (unknown.length > 0) return fail(`Champs non autorisés : ${unknown.join(", ")}.`);

  const file = fields.get("file");
  if (!isAudioPart(file)) return fail("« file » : fichier audio attendu.");
  const mimeType = (file.type ?? "").split(";")[0].trim().toLowerCase();
  const kind = AUDIO_TYPES[mimeType];
  if (!kind) {
    return fail("« file » : format audio non accepté (WAV, MP3, FLAC, Ogg/Opus ou M4A).");
  }
  if (file.size === 0) return fail("« file » : fichier vide.");
  if (file.size > MAX_AUDIO_BYTES) {
    return fail(
      `Fichier audio trop volumineux (${file.size} octets, maximum ${MAX_AUDIO_BYTES}) — découpez l'enregistrement.`,
      "payload_too_large",
    );
  }

  // La durée annoncée est une INDICATION, comme `page_count_hint` : elle sert
  // à réserver, le règlement retient la durée mesurée par le fournisseur.
  const rawDuration = fields.get("duration_ms");
  const durationMs = typeof rawDuration === "string" && /^\d+$/.test(rawDuration.trim())
    ? Number(rawDuration.trim())
    : NaN;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return fail("« duration_ms » : durée de l'enregistrement attendue, en millisecondes (entier positif).");
  }

  const rawLanguage = fields.get("language");
  let language: string | null = null;
  if (rawLanguage !== undefined && rawLanguage !== null && rawLanguage !== "") {
    const code = typeof rawLanguage === "string" ? rawLanguage.trim().toLowerCase() : "";
    if (!(TRANSCRIPTION_LANGUAGES as readonly string[]).includes(code)) {
      return fail(`« language » : langue non transcrite (acceptées : ${TRANSCRIPTION_LANGUAGES.join(", ")}).`);
    }
    language = code;
  }

  const common = readCommon((key) => fields.get(key));
  if (!common.ok) return fail(common.message);

  const audio = new Uint8Array(await file.arrayBuffer());
  const reserveSeconds = reservationSeconds(audio, kind, durationMs / 1000);
  if (reserveSeconds > MAX_AUDIO_SECONDS) {
    return fail(
      `Enregistrement trop long (${Math.ceil(reserveSeconds)} s, maximum ${MAX_AUDIO_SECONDS}) — découpez-le.`,
      "payload_too_large",
    );
  }

  return {
    ok: true,
    value: {
      audio,
      mimeType,
      filename: typeof file.name === "string" && file.name !== "" ? file.name : "audio",
      language,
      reserveSeconds,
      feature: common.feature,
      actorId: common.actorId,
      referenceKind: common.referenceKind,
      referenceId: common.referenceId,
    },
  };
}

export interface SpeechRequest {
  text: string;
  language: string;
  format: SpeechFormat;
  feature: string | null;
  actorId: string | null;
  referenceKind: string | null;
  referenceId: string | null;
}

const SPEECH_KEYS = new Set([
  "text", "language", "format", "feature", "actor_id", "reference",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Corps JSON : `text`, `language`, `format`, `feature`, `actor_id`, `reference: { kind, id }`. */
export function parseSpeechPayload(raw: unknown): ParseResult<SpeechRequest> {
  if (!isRecord(raw)) return fail("Corps JSON attendu.");
  for (const [key, why] of Object.entries(PROVIDER_KEYS)) {
    if (key in raw) return fail(why);
  }
  const unknown = Object.keys(raw).filter((k) => !SPEECH_KEYS.has(k));
  if (unknown.length > 0) return fail(`Clés non autorisées : ${unknown.join(", ")}.`);

  if (typeof raw.text !== "string" || raw.text.trim() === "") {
    return fail("« text » : texte à prononcer attendu.");
  }
  const text = raw.text.trim();
  const length = [...text].length;
  if (length > MAX_SPEECH_CHARS) {
    return fail(
      `Texte trop long pour une synthèse (${length} caractères, maximum ${MAX_SPEECH_CHARS}) — découpez-le.`,
      "payload_too_large",
    );
  }

  const language = typeof raw.language === "string" ? raw.language.trim().toLowerCase() : "";
  if (!SPEECH_VOICES[language]) {
    return fail(`« language » : aucune voix pour cette langue (disponibles : ${SPEECH_LANGUAGES.join(", ")}).`);
  }

  let format: SpeechFormat = "mp3";
  if (raw.format !== undefined && raw.format !== null) {
    if (typeof raw.format !== "string" || !(raw.format in SPEECH_FORMATS)) {
      return fail(`« format » : ${Object.keys(SPEECH_FORMATS).join(", ")} attendu.`);
    }
    format = raw.format as SpeechFormat;
  }

  let reference: Record<string, unknown> = {};
  if (raw.reference !== undefined && raw.reference !== null) {
    if (!isRecord(raw.reference)) return fail("« reference » : objet { kind, id } attendu.");
    reference = raw.reference;
  }
  const common = readCommon((key) => {
    if (key === "reference_kind") return reference.kind;
    if (key === "reference_id") return reference.id;
    return raw[key];
  });
  if (!common.ok) return fail(common.message.replace("reference_id", "reference.id"));

  return {
    ok: true,
    value: {
      text,
      language,
      format,
      feature: common.feature,
      actorId: common.actorId,
      referenceKind: common.referenceKind,
      referenceId: common.referenceId,
    },
  };
}
