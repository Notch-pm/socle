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
        "/v1/organizations/{id}/smtp",
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

  it("documente le serveur d'envoi : scope smtp, 403 et 404 possibles", () => {
    const smtp = doc.paths["/v1/organizations/{id}/smtp"].get;
    expect(smtp.tags).toEqual(["Messagerie"]);
    expect(smtp.responses).toHaveProperty("403");
    expect(smtp.responses).toHaveProperty("404");
    expect(doc.info.description).toContain("`smtp`");
    // Le mot de passe est servi en clair : le contrat doit le dire.
    expect(doc.components.schemas.SmtpSettings.properties.password.description).toContain("clair");
    // Héritage : la réponse dit quelle organisation porte réellement le relais.
    expect(doc.components.schemas.SmtpSettings.properties.source_organization_id).toBeDefined();
    expect(smtp.description).toContain("Héritage");
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

  it("mentionne le scope read requis dans le narratif d'authentification", () => {
    expect(doc.info.description).toMatch(/scope \*\*`read`\*\*/);
    expect(doc.info.description).toMatch(/403/);
  });

  it("documente le paramètre organization_id de /v1/quartiers (clé plateforme + geometry)", () => {
    const params = doc.paths["/v1/quartiers"].get.parameters.map((p: { name: string }) => p.name);
    expect(params).toEqual(expect.arrayContaining(["geometry", "organization_id"]));
    const orgIdParam = doc.paths["/v1/quartiers"].get.parameters.find(
      (p: { name: string }) => p.name === "organization_id",
    );
    expect(orgIdParam).toMatchObject({
      in: "query",
      required: false,
      schema: { type: "string", format: "uuid" },
    });
    expect(orgIdParam.description).toMatch(/plateforme/);
    expect(doc.paths["/v1/quartiers"].get.responses).toHaveProperty("400");
  });
});
