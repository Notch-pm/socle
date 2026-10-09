import { describe, expect, it, vi } from "vitest";
import {
  callProvider,
  callProviderOcr,
  callProviderSpeech,
  callProviderTranscription,
  sanitizeDetail,
} from "./provider.ts";

const input = {
  apiKey: "sk-test",
  agentId: null,
  system: "Tu es l'assistant d'instruction d'Iris, destiné aux agents.",
  messages: [{ role: "user", content: "Quelles pièces dois-je exiger pour un acte de naissance ?" }],
  maxTokens: 900,
  responseFormat: null as "json" | null,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("sanitizeDetail", () => {
  // Le détail part dans les journaux du Socle. Il ne doit pas y faire entrer
  // par la fenêtre ce que le schéma interdit par la porte.
  it("écarte un message d'erreur qui contient notre propre requête", () => {
    const echo = `invalid request: ${input.system}`;
    expect(sanitizeDetail(echo, [input.system])).toBe(
      "[réponse du fournisseur écartée : elle contenait la requête]",
    );
  });

  it("laisse passer une vraie erreur du fournisseur", () => {
    expect(sanitizeDetail("rate limit exceeded, retry later", [input.system]))
      .toBe("rate limit exceeded, retry later");
  });

  it("tronque à 200 caractères", () => {
    expect(sanitizeDetail("x".repeat(500), []).length).toBe(200);
  });

  it("ne se déclenche pas sur une coïncidence courte", () => {
    expect(sanitizeDetail("agents", ["Tu es l'assistant"])).toBe("agents");
  });
});

describe("callProvider", () => {
  it("rend la réponse et le décompte du fournisseur", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      choices: [{ message: { content: "  Un justificatif de domicile.  " } }],
      usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
    })) as unknown as typeof fetch;

    const r = await callProvider(input, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answer).toBe("Un justificatif de domicile.");
      expect(r.totalTokens).toBe(150);
      expect(r.promptTokens).toBe(120);
    }
  });

  it("sans agent, appelle chat/completions avec le modèle et la température", async () => {
    let url = "";
    let body: any = null;
    const fetchImpl = vi.fn(async (u: string, init: any) => {
      url = u;
      body = JSON.parse(init.body);
      return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
    }) as unknown as typeof fetch;

    await callProvider(input, fetchImpl);
    expect(url).toContain("/v1/chat/completions");
    expect(body.model).toBe("mistral-large-latest");
    expect(body.temperature).toBe(0.2);
    expect(body.agent_id).toBeUndefined();
    // Le prompt système est TOUJOURS le premier message.
    expect(body.messages[0]).toEqual({ role: "system", content: input.system });
  });

  it("avec un agent, appelle agents/completions — jamais /v1/conversations", async () => {
    let url = "";
    let body: any = null;
    const fetchImpl = vi.fn(async (u: string, init: any) => {
      url = u;
      body = JSON.parse(init.body);
      return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
    }) as unknown as typeof fetch;

    await callProvider({ ...input, agentId: "ag_123" }, fetchImpl);
    expect(url).toContain("/v1/agents/completions");
    expect(url).not.toContain("/v1/conversations");
    expect(body.agent_id).toBe("ag_123");
    expect(body.model).toBeUndefined();
  });

  // ⚠️ LE test du module : sur un échec, l'objet rendu ne contient rien de
  // l'entrée. C'est la preuve exécutable du passe-plat.
  it("sur une erreur du fournisseur, ne rend AUCUN fragment de la requête", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("upstream failure: model overloaded", { status: 503 })
    ) as unknown as typeof fetch;

    const r = await callProvider(input, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const serialized = JSON.stringify(r);
      expect(serialized).not.toContain("assistant d'instruction");
      expect(serialized).not.toContain("acte de naissance");
      expect(r.status).toBe(503);
      expect(r.kind).toBe("http");
    }
  });

  it("neutralise un fournisseur qui nous renvoie la requête en écho", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(`invalid: ${input.messages[0].content}`, { status: 400 })
    ) as unknown as typeof fetch;

    const r = await callProvider(input, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(JSON.stringify(r)).not.toContain("acte de naissance");
  });

  it("traite l'absence de réponse comme un échec réseau", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    const r = await callProvider(input, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("network");
      expect(r.status).toBeNull();
    }
  });

  it("traite une réponse vide ou inattendue comme un échec", async () => {
    const vide = vi.fn(async () => jsonResponse(200, { choices: [] })) as unknown as typeof fetch;
    const r1 = await callProvider(input, vide);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.kind).toBe("empty");

    const blanc = vi.fn(async () =>
      jsonResponse(200, { choices: [{ message: { content: "   " } }] })
    ) as unknown as typeof fetch;
    expect((await callProvider(input, blanc)).ok).toBe(false);
  });

  it("supporte un fournisseur qui ne rend pas de décompte", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { choices: [{ message: { content: "ok" } }] })
    ) as unknown as typeof fetch;
    const r = await callProvider(input, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.totalTokens).toBeNull();
  });
});

describe("callProvider — mode JSON", () => {
  async function payloadFor(responseFormat: "json" | null) {
    let body: any = null;
    const fetchImpl = vi.fn(async (_u: string, init: any) => {
      body = JSON.parse(init.body);
      return jsonResponse(200, { choices: [{ message: { content: '{"a":1}' } }] });
    }) as unknown as typeof fetch;
    await callProvider({ ...input, responseFormat }, fetchImpl);
    return body;
  }

  // ⚠️ CETTE LIGNE EST LA SEULE DU DÉPÔT QUI CONNAÎT `json_object`. Le
  // consommateur passe l'alias « json » du Socle ; si le fournisseur renomme
  // son mode demain, c'est ici — et nulle part ailleurs — que ça se voit.
  it("traduit l'alias « json » en la forme du fournisseur", async () => {
    expect(await payloadFor("json")).toMatchObject({ response_format: { type: "json_object" } });
  });

  it("n'envoie rien quand l'appelant n'a rien demandé", async () => {
    expect(await payloadFor(null)).not.toHaveProperty("response_format");
  });

  it("s'applique aussi à un appel d'agent", async () => {
    let body: any = null;
    const fetchImpl = vi.fn(async (_u: string, init: any) => {
      body = JSON.parse(init.body);
      return jsonResponse(200, { choices: [{ message: { content: "{}" } }] });
    }) as unknown as typeof fetch;
    await callProvider({ ...input, agentId: "ag_123", responseFormat: "json" }, fetchImpl);
    expect(body.agent_id).toBe("ag_123");
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});

describe("callProviderOcr", () => {
  const ocrInput = {
    apiKey: "sk-test",
    documentType: "document_url" as const,
    url: "https://exemple.test/storage/sign/doc.pdf?token=abc",
  };

  it("rend les pages, dans l'ordre, avec le décompte du fournisseur", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      pages: [
        { index: 0, markdown: "# Page une" },
        { index: 1, markdown: "Page deux" },
      ],
      usage_info: { pages_processed: 2 },
    })) as unknown as typeof fetch;

    const r = await callProviderOcr(ocrInput, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pages).toEqual([
        { index: 0, markdown: "# Page une" },
        { index: 1, markdown: "Page deux" },
      ]);
      expect(r.pagesProcessed).toBe(2);
    }
  });

  // ⚠️ Sans cette option, le fournisseur renvoie chaque illustration encodée
  // dans la réponse : des mégaoctets d'image traverseraient le Socle.
  it("n'accepte jamais les images encodées dans la réponse", async () => {
    let body: any = null;
    const fetchImpl = vi.fn(async (u: string, init: any) => {
      body = JSON.parse(init.body);
      expect(u).toBe("https://api.mistral.ai/v1/ocr");
      return jsonResponse(200, { pages: [] });
    }) as unknown as typeof fetch;
    await callProviderOcr(ocrInput, fetchImpl);
    expect(body.include_image_base64).toBe(false);
  });

  it("distingue une image d'un document paginé", async () => {
    let body: any = null;
    const fetchImpl = vi.fn(async (_u: string, init: any) => {
      body = JSON.parse(init.body);
      return jsonResponse(200, { pages: [] });
    }) as unknown as typeof fetch;
    await callProviderOcr({ ...ocrInput, documentType: "image_url" }, fetchImpl);
    expect(body.document).toEqual({ type: "image_url", image_url: ocrInput.url });
  });

  // Un scan illisible rend zéro page. Ce n'est PAS une panne : renvoyer une
  // erreur enverrait l'appelant réessayer en boucle sur un document vide.
  it("un document sans texte n'est pas une erreur", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { pages: [] })) as unknown as typeof fetch;
    const r = await callProviderOcr(ocrInput, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages).toEqual([]);
  });

  it("une réponse sans tableau de pages est une erreur", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { detail: "?" })) as unknown as typeof fetch;
    const r = await callProviderOcr(ocrInput, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("empty");
  });

  // ⚠️ L'URL SIGNÉE EST UN DROIT D'ACCÈS AU DOCUMENT. Si le fournisseur nous
  // la renvoie en écho dans son message d'erreur, elle ne doit pas atterrir
  // dans un journal du Socle.
  it("écarte un message d'erreur qui contient l'URL signée", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(`could not fetch document at ${ocrInput.url}`, { status: 422 })
    ) as unknown as typeof fetch;
    const r = await callProviderOcr(ocrInput, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.detail).toBe("[réponse du fournisseur écartée : elle contenait la requête]");
      expect(r.detail).not.toContain("token=abc");
    }
  });

  it("pas de réponse du fournisseur ⇒ échec réseau", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    const r = await callProviderOcr(ocrInput, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("network");
  });
});

describe("callProviderTranscription", () => {
  const audio = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
  const sttInput = { apiKey: "sk-test", audio, mimeType: "audio/wav", filename: "tour.wav", language: "fr" };

  it("envoie le fichier au modèle de transcription par lots, et rend le texte et la durée", async () => {
    let sent: FormData | null = null;
    const fetchImpl = vi.fn(async (u: string, init: any) => {
      expect(u).toBe("https://api.mistral.ai/v1/audio/transcriptions");
      sent = init.body as FormData;
      return jsonResponse(200, {
        text: "  Il y a un dépôt sauvage devant le 12 rue Jean Jaurès.  ",
        language: "fr",
        usage: { prompt_audio_seconds: 5 },
      });
    }) as unknown as typeof fetch;

    const r = await callProviderTranscription(sttInput, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toBe("Il y a un dépôt sauvage devant le 12 rue Jean Jaurès.");
      expect(r.language).toBe("fr");
      expect(r.audioSeconds).toBe(5);
    }
    // ⚠️ Jamais un modèle « realtime » : il refuse l'envoi d'un fichier (lot 0).
    expect(sent!.get("model")).toBe("voxtral-mini-latest");
    expect(sent!.get("language")).toBe("fr");
    const file = sent!.get("file") as Blob;
    expect(file.size).toBe(audio.length);
  });

  it("laisse la détection de langue au fournisseur quand aucune n'est donnée", async () => {
    let sent: FormData | null = null;
    const fetchImpl = vi.fn(async (_u: string, init: any) => {
      sent = init.body;
      return jsonResponse(200, { text: "Hello" });
    }) as unknown as typeof fetch;
    const r = await callProviderTranscription({ ...sttInput, language: null }, fetchImpl);
    expect(sent!.has("language")).toBe(false);
    if (r.ok) expect(r.audioSeconds).toBe(null);
  });

  // Un silence transcrit en « » n'est pas une panne (motif de la page blanche).
  it("un enregistrement sans parole n'est pas une erreur", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { text: "" })) as unknown as typeof fetch;
    const r = await callProviderTranscription(sttInput, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("");
  });

  it("une réponse sans texte, une erreur HTTP ou l'absence de réponse sont des échecs", async () => {
    const empty = await callProviderTranscription(
      sttInput, vi.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch,
    );
    expect(empty.ok).toBe(false);
    const http = await callProviderTranscription(
      sttInput, vi.fn(async () => new Response("invalid model", { status: 400 })) as unknown as typeof fetch,
    );
    expect(http.ok).toBe(false);
    if (!http.ok) expect(http.status).toBe(400);
    const network = await callProviderTranscription(
      sttInput, vi.fn(async () => { throw new Error("timeout"); }) as unknown as typeof fetch,
    );
    expect(network.ok).toBe(false);
    if (!network.ok) expect(network.kind).toBe("network");
  });
});

describe("callProviderSpeech", () => {
  const ttsInput = {
    apiKey: "sk-test",
    text: "Pour signaler un dépôt sauvage, j'ai besoin de l'adresse exacte.",
    voiceId: "e0580ce5-e63c-4cbe-88c8-a983b80c5f1f",
    format: "mp3" as const,
  };

  it("demande la voix choisie par le Socle et décode l'audio rendu en base64", async () => {
    let body: any = null;
    const fetchImpl = vi.fn(async (u: string, init: any) => {
      expect(u).toBe("https://api.mistral.ai/v1/audio/speech");
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ audio_data: btoa("ID3abc") }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const r = await callProviderSpeech(ttsInput, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(new TextDecoder().decode(r.audio)).toBe("ID3abc");
    expect(body).toEqual({
      model: "voxtral-mini-tts-2603",
      input: ttsInput.text,
      voice_id: ttsInput.voiceId,
      response_format: "mp3",
    });
  });

  it("accepte aussi un audio rendu brut", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } })
    ) as unknown as typeof fetch;
    const r = await callProviderSpeech(ttsInput, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) expect([...r.audio]).toEqual([1, 2, 3]);
  });

  it("une réponse sans audio est une erreur", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } })
    ) as unknown as typeof fetch;
    const r = await callProviderSpeech(ttsInput, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("empty");
  });

  // Le texte prononcé est celui d'un usager ou d'une réponse qui lui est
  // destinée : renvoyé en écho, il ne doit pas atterrir dans un journal.
  it("écarte un message d'erreur qui contient le texte à prononcer", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(`restricted content: ${ttsInput.text}`, { status: 403 })
    ) as unknown as typeof fetch;
    const r = await callProviderSpeech(ttsInput, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("[réponse du fournisseur écartée : elle contenait la requête]");
  });
});
