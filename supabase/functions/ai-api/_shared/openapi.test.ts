import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi.ts";
import { ERROR_CODES, errorBody, errorResponse } from "./errors.ts";

const doc = buildOpenApiDocument("https://ex.supabase.co/functions/v1/ai-api") as any;

describe("buildOpenApiDocument", () => {
  it("est un document OpenAPI 3.1 avec le serveur injecté", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe("https://ex.supabase.co/functions/v1/ai-api");
    expect(doc.info.version).toBe("1.3.0");
  });

  it("déclare la sécurité par clé API bearer", () => {
    expect(doc.components.securitySchemes.bearerApiKey).toMatchObject({
      type: "http", scheme: "bearer",
    });
    expect(doc.security).toEqual([{ bearerApiKey: [] }]);
  });

  it("expose les trois endpoints, avec la bonne méthode", () => {
    expect(Object.keys(doc.paths).sort()).toEqual(["/v1/completions", "/v1/ocr", "/v1/usage"]);
    expect(Object.keys(doc.paths["/v1/completions"])).toEqual(["post"]);
    expect(Object.keys(doc.paths["/v1/ocr"])).toEqual(["post"]);
    expect(Object.keys(doc.paths["/v1/usage"])).toEqual(["get"]);
  });

  // ⚠️ Les DEUX routes payantes doivent annoncer les mêmes refus. Une seule qui
  // documenterait 429 laisserait croire à un consommateur que l'autre ne peut
  // pas manquer de crédit — et il n'écrirait pas le seul cas qu'il doit traiter.
  it("les deux routes payantes documentent les mêmes refus", () => {
    for (const route of ["/v1/completions", "/v1/ocr"] as const) {
      const codes = Object.keys(doc.paths[route].post.responses).sort();
      expect(codes).toEqual(["200", "400", "401", "403", "404", "429", "500", "502", "503"]);
    }
    // La lecture, elle, ne dépense rien : ni 429 ni panne de fournisseur.
    const usage = Object.keys(doc.paths["/v1/usage"].get.responses);
    expect(usage).not.toContain("429");
    expect(usage).not.toContain("502");
  });

  // Le document est le seul endroit où un consommateur apprend que l'octet du
  // document ne traverse pas le Socle — la garantie la plus forte de l'API.
  it("dit que l'OCR reçoit une URL signée, pas le document", () => {
    const description = doc.paths["/v1/ocr"].post.description;
    expect(description).toContain("URL signée");
    expect(description).toContain("ne transite pas par le Socle");
  });

  // ⚠️ Piège réel du mode JSON : sans le mot dans le prompt, le fournisseur
  // refuse. Le contrat doit le dire, sinon chaque consommateur le découvre en
  // production.
  it("dit ce que « response_format » exige, et ce qu'il ne garantit pas", () => {
    const format = doc.components.schemas.CompletionRequest.properties.response_format;
    expect(format.enum).toEqual(["json", null]);
    expect(format.description).toContain("doit figurer dans `system`");
    expect(format.description).toContain("valide, pas conforme");
  });

  // La documentation est l'endroit où les équipes consommatrices lisent ce qui
  // part chez le fournisseur — et ce que le Socle ne garde pas.
  it("écrit noir sur blanc que rien n'est conservé, et la limite honnête", () => {
    expect(doc.info.description).toContain("ne conserve NI le prompt NI la réponse");
    expect(doc.info.description).toContain("il ne le garde pas");
  });

  it("annonce le scope dédié et l'obligation d'imputation", () => {
    expect(doc.info.description).toContain("`ai`");
    expect(doc.info.description).toContain("api_keys.consumer");
    expect(doc.info.description).toContain("X-Organization-Id");
  });

  it("dit que le budget est par collectivité, tous produits confondus", () => {
    expect(doc.info.description).toContain("tous produits confondus");
    expect(doc.info.description).toContain("jamais le compteur ni le plafond");
  });

  it("documente les quatre réponses propres à cette API", () => {
    const responses = doc.paths["/v1/completions"].post.responses;
    for (const code of ["429", "502", "503"]) expect(responses[code]).toBeTruthy();
    expect(JSON.stringify(doc.components.responses.QuotaExceeded))
      .toContain("fournisseur n'a pas été appelé");
    expect(JSON.stringify(doc.components.responses.ProviderUnavailable))
      .toContain("Rien n'a été consommé");
  });

  it("interdit les clés inconnues dans le corps documenté", () => {
    expect(doc.components.schemas.CompletionRequest.additionalProperties).toBe(false);
    expect(doc.components.schemas.CompletionRequest.required).toEqual(["system", "messages"]);
  });

  it("dit que `estimated_tokens` n'est qu'une indication", () => {
    expect(doc.components.schemas.CompletionRequest.properties.estimated_tokens.description)
      .toContain("Indication");
  });
});

describe("ERROR_CODES", () => {
  it("mappe chaque code sur son statut, dont les quatre nouveaux", () => {
    expect(ERROR_CODES.ai_quota_exceeded).toBe(429);
    expect(ERROR_CODES.ai_unavailable).toBe(502);
    expect(ERROR_CODES.not_configured).toBe(503);
    expect(ERROR_CODES.payload_too_large).toBe(400);
  });

  it("rend une réponse JSON à l'enveloppe de la gamme", async () => {
    const res = errorResponse("ai_quota_exceeded", "Plafond atteint.", {});
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: { code: "ai_quota_exceeded", message: "Plafond atteint." },
    });
    expect(errorBody("x", "y")).toEqual({ error: { code: "x", message: "y" } });
  });
});
