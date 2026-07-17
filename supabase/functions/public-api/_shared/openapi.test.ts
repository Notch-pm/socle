import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi.ts";

describe("buildOpenApiDocument", () => {
  const doc = buildOpenApiDocument("https://example.supabase.co/functions/v1/public-api") as any;

  it("est un document OpenAPI 3.1 avec le serveur injecté", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers[0].url).toBe("https://example.supabase.co/functions/v1/public-api");
  });

  it("déclare le schéma de sécurité clé API bearer", () => {
    expect(doc.components.securitySchemes.bearerApiKey).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(doc.security).toEqual([{ bearerApiKey: [] }]);
  });

  it("expose tous les endpoints prévus, en lecture seule (GET)", () => {
    const paths = Object.keys(doc.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/v1/organizations",
        "/v1/organizations/{id}",
        "/v1/categories",
        "/v1/procedures",
        "/v1/procedures/{id}",
        "/v1/document-types",
        "/v1/quartiers",
        "/v1/documents/signed-url",
      ]),
    );
    for (const path of paths) {
      expect(Object.keys(doc.paths[path])).toEqual(["get"]);
    }
  });

  it("documente les erreurs 401 sur les listes et 400/404 sur les accès par id", () => {
    expect(doc.paths["/v1/organizations"].get.responses).toHaveProperty("401");
    const byId = doc.paths["/v1/organizations/{id}"].get.responses;
    expect(byId).toHaveProperty("400");
    expect(byId).toHaveProperty("404");
  });

  it("définit les schémas clés du contrat", () => {
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining([
        "Organization",
        "Category",
        "Procedure",
        "RequesterConfig",
        "FormSchema",
        "KnowledgeBase",
        "DocumentType",
        "Quartier",
        "SignedUrl",
        "Error",
      ]),
    );
  });
});
