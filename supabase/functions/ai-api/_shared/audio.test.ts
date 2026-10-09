import { describe, expect, it } from "vitest";
import {
  MAX_AUDIO_BYTES,
  MAX_SPEECH_CHARS,
  parseSpeechPayload,
  parseTranscriptionForm,
  reservationSeconds,
  SPEECH_LANGUAGES,
  speechContentType,
  TOKENS_PER_AUDIO_SECOND,
  TOKENS_PER_SPOKEN_CHAR,
  tokensForAudioSeconds,
  tokensForSpeech,
  voiceIdFor,
  wavSeconds,
} from "./audio.ts";

const uuid = "3f6a2c10-0000-4000-8000-000000000001";

/** Un WAV PCM 16 bits mono, `seconds` secondes à `rate` Hz, en-tête canonique de 44 octets. */
function wav(seconds: number, rate = 16000): Uint8Array {
  const data = Math.round(seconds * rate) * 2;
  const bytes = new Uint8Array(44 + data);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, text: string) => [...text].forEach((c, i) => (bytes[offset + i] = c.charCodeAt(0)));
  tag(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, data, true);
  return bytes;
}

/** Une pièce de formulaire, sans dépendre de `File` (absent de certains runtimes). */
function part(bytes: Uint8Array, type = "audio/wav", name = "tour.wav") {
  return { type, name, size: bytes.length, arrayBuffer: async () => bytes.slice().buffer };
}

function form(fields: Record<string, unknown>): [string, unknown][] {
  return Object.entries(fields);
}

describe("conversion en jetons — au coût, à un seul endroit", () => {
  it("vaut ≈ 50 jetons par seconde transcrite et 16 par caractère prononcé", () => {
    expect(TOKENS_PER_AUDIO_SECOND).toBeCloseTo(50, 6);
    expect(TOKENS_PER_SPOKEN_CHAR).toBeCloseTo(16, 6);
  });

  it("arrondit au jeton supérieur, jamais à zéro", () => {
    expect(tokensForAudioSeconds(6)).toBe(300);
    expect(tokensForAudioSeconds(0.01)).toBe(1);
    expect(tokensForAudioSeconds(Number.NaN)).toBe(50);
    expect(tokensForSpeech("Bonjour")).toBe(112);
  });

  // Le fournisseur facture au CARACTÈRE : un emoji ou un idéogramme est un
  // caractère, pas deux unités UTF-16.
  it("compte les caractères, pas les unités UTF-16", () => {
    expect(tokensForSpeech("é😀")).toBe(32);
  });
});

describe("durée d'un enregistrement", () => {
  it("lit la durée exacte d'un WAV dans son en-tête", () => {
    expect(wavSeconds(wav(5))).toBeCloseTo(5, 6);
    expect(wavSeconds(wav(2, 24000))).toBeCloseTo(2, 6);
  });

  it("rend null pour ce qui n'est pas un WAV", () => {
    expect(wavSeconds(new Uint8Array(100))).toBe(null);
    expect(wavSeconds(new Uint8Array(10))).toBe(null);
  });

  // Un WAV écrit en flux annonce une taille fictive : on retient ce qui est là.
  it("borne une taille de données fictive à ce qui est présent", () => {
    const bytes = wav(3);
    new DataView(bytes.buffer).setUint32(40, 0xffffffff, true);
    expect(wavSeconds(bytes)).toBeCloseTo(3, 6);
  });

  // ⚠️ Sous-déclarer ne fait rien gagner : le fichier prouve sa durée.
  it("réserve la plus grande de l'annonce et de ce que le fichier prouve", () => {
    expect(reservationSeconds(wav(10), "wav", 1)).toBeCloseTo(10, 6);
    expect(reservationSeconds(wav(2), "wav", 5)).toBe(5);
    // Compressé : plancher de 4 000 octets par seconde.
    expect(reservationSeconds(new Uint8Array(40_000), "compressed", 1)).toBe(10);
  });
});

describe("parseTranscriptionForm", () => {
  it("accepte un WAV et sa durée, langue facultative", async () => {
    const r = await parseTranscriptionForm(form({ file: part(wav(4)), duration_ms: "4000" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.mimeType).toBe("audio/wav");
      expect(r.value.language).toBe(null);
      expect(r.value.reserveSeconds).toBeCloseTo(4, 6);
      expect(r.value.audio.length).toBe(44 + 4 * 32000);
    }
  });

  it("lit la langue, l'acteur, la référence et le libellé", async () => {
    const r = await parseTranscriptionForm(form({
      file: part(wav(1)),
      duration_ms: "1000",
      language: " FR ",
      feature: " assistant-usager ",
      actor_id: uuid,
      reference_kind: "procedure",
      reference_id: uuid,
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.language).toBe("fr");
      expect(r.value.feature).toBe("assistant-usager");
      expect(r.value.actorId).toBe(uuid);
      expect(r.value.referenceKind).toBe("procedure");
      expect(r.value.referenceId).toBe(uuid);
    }
  });

  it("ignore les paramètres du type MIME", async () => {
    const r = await parseTranscriptionForm(form({ file: part(wav(1), "audio/ogg; codecs=opus"), duration_ms: "1000" }));
    expect(r.ok).toBe(true);
  });

  // Le turc et l'ukrainien ne sont pas transcrits (lot 0) : on refuse AVANT de
  // réserver, sinon le fournisseur refuserait après.
  it("refuse une langue que la transcription ne connaît pas", async () => {
    const r = await parseTranscriptionForm(form({ file: part(wav(1)), duration_ms: "1000", language: "tr" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("langue non transcrite");
  });

  it("refuse le modèle, la voix et l'imputation", async () => {
    for (const key of ["model", "consumer", "organization_id", "stream"]) {
      const r = await parseTranscriptionForm(form({ file: part(wav(1)), duration_ms: "1000", [key]: "x" }));
      expect(r.ok).toBe(false);
    }
  });

  it("refuse un champ inconnu ou en double", async () => {
    expect((await parseTranscriptionForm(form({ file: part(wav(1)), duration_ms: "1000", prompt: "x" }))).ok)
      .toBe(false);
    const doubled: [string, unknown][] = [["file", part(wav(1))], ["duration_ms", "1"], ["duration_ms", "2"]];
    expect((await parseTranscriptionForm(doubled)).ok).toBe(false);
  });

  it("exige un fichier audio d'un format accepté, non vide", async () => {
    expect((await parseTranscriptionForm(form({ duration_ms: "1000" }))).ok).toBe(false);
    expect((await parseTranscriptionForm(form({ file: "texte", duration_ms: "1000" }))).ok).toBe(false);
    expect((await parseTranscriptionForm(form({ file: part(wav(1), "audio/webm"), duration_ms: "1000" }))).ok)
      .toBe(false);
    expect((await parseTranscriptionForm(form({ file: part(new Uint8Array(0)), duration_ms: "1000" }))).ok)
      .toBe(false);
  });

  it("exige une durée entière et positive", async () => {
    for (const duration of [undefined, "", "0", "-5", "1.5", "abc"]) {
      const r = await parseTranscriptionForm(form({ file: part(wav(1)), duration_ms: duration }));
      expect(r.ok).toBe(false);
    }
  });

  it("refuse un fichier trop lourd, en payload_too_large", async () => {
    const big = { type: "audio/wav", name: "x.wav", size: MAX_AUDIO_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) };
    const r = await parseTranscriptionForm(form({ file: big, duration_ms: "1000" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("payload_too_large");
  });

  // ⚠️ La durée annoncée ne suffit pas à faire passer un enregistrement trop
  // long : le fichier prouve la sienne.
  it("refuse un enregistrement trop long, même annoncé court", async () => {
    const r = await parseTranscriptionForm(form({ file: part(wav(301)), duration_ms: "1000" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("payload_too_large");
  });
});

describe("parseSpeechPayload", () => {
  it("accepte un texte et une langue, mp3 par défaut", () => {
    const r = parseSpeechPayload({ text: "  Bonjour.  ", language: "fr" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.text).toBe("Bonjour.");
      expect(r.value.format).toBe("mp3");
    }
  });

  it("lit la référence, l'acteur et le format", () => {
    const r = parseSpeechPayload({
      text: "Hello.", language: "EN", format: "opus", actor_id: uuid, reference: { kind: "procedure", id: uuid },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.language).toBe("en");
      expect(r.value.format).toBe("opus");
      expect(r.value.actorId).toBe(uuid);
      expect(r.value.referenceId).toBe(uuid);
    }
  });

  // L'arabe, le russe, le chinois lus par une voix française donnent du
  // charabia (lot 0) : seules les langues qui ont une voix se prononcent.
  it("ne prononce que les langues qui ont une voix", () => {
    expect(SPEECH_LANGUAGES.sort()).toEqual(["en", "fr"]);
    for (const language of ["ar", "es", "zh", "", undefined]) {
      expect(parseSpeechPayload({ text: "x", language }).ok).toBe(false);
    }
  });

  // ⚠️ La voix est une décision du Socle, et le clonage n'est jamais ouvert.
  it("refuse la voix, la voix de référence, le modèle, le flux et l'imputation", () => {
    for (const key of ["voice", "voice_id", "ref_audio", "model", "stream", "consumer", "organization_id"]) {
      const r = parseSpeechPayload({ text: "x", language: "fr", [key]: "y" });
      expect(r.ok).toBe(false);
    }
  });

  it("refuse un texte vide, trop long, ou un format inconnu", () => {
    expect(parseSpeechPayload({ text: "   ", language: "fr" }).ok).toBe(false);
    const long = parseSpeechPayload({ text: "a".repeat(MAX_SPEECH_CHARS + 1), language: "fr" });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.code).toBe("payload_too_large");
    expect(parseSpeechPayload({ text: "x", language: "fr", format: "aac" }).ok).toBe(false);
    expect(parseSpeechPayload({ text: "x", language: "fr", reference: { id: "pas-un-uuid" } }).ok).toBe(false);
    expect(parseSpeechPayload("texte").ok).toBe(false);
  });
});

describe("voix", () => {
  it("rend le préréglage choisi, ou le secret qui le remplace", () => {
    expect(voiceIdFor("fr", () => undefined)).toBe("e0580ce5-e63c-4cbe-88c8-a983b80c5f1f");
    expect(voiceIdFor("en", () => undefined)).toBe("c69964a6-ab8b-4f8a-9465-ec0925096ec8");
    expect(voiceIdFor("fr", (name) => (name === "MISTRAL_VOICE_FR" ? " autre " : undefined))).toBe("autre");
    expect(voiceIdFor("es", () => "peu importe")).toBe(null);
  });

  it("annonce le type de chaque format", () => {
    expect(speechContentType("mp3")).toBe("audio/mpeg");
    expect(speechContentType("opus")).toBe("audio/ogg");
    expect(speechContentType("wav")).toBe("audio/wav");
  });
});
