import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi.ts";
import { ERROR_CODES, errorBody, errorResponse } from "./errors.ts";

const doc = buildOpenApiDocument("https://ex.supabase.co/functions/v1/ai-api") as any;

describe("buildOpenApiDocument", () => {
  it("est un document OpenAPI 3.1 avec le serveur injecté", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe("https://ex.supabase.co/functions/v1/ai-api");
    expect(doc.info.version).toBe("1.0.0");
  });

  it("déclare la sécurité par clé API bearer", () => {
    expect(doc.components.securitySchemes.bearerApiKey).toMatchObject({
      type: "http", scheme: "bearer",
    });
    expect(doc.security).toEqual([{ bearerApiKey: [] }]);
  });

  it("expose les deux endpoints, avec la bonne méthode", () => {
    expect(Object.keys(doc.paths).sort()).toEqual(["/v1/completions", "/v1/usage"]);
    expect(Object.keys(doc.paths["/v1/completions"])).toEqual(["post"]);
    expect(Object.keys(doc.paths["/v1/usage"])).toEqual(["get"]);
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
