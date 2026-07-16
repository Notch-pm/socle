import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi.ts";

describe("openapi (contacts-api)", () => {
  const doc = buildOpenApiDocument("https://example.test/functions/v1/contacts-api") as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;

  it("décrit tous les endpoints, sans DELETE", () => {
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/v1/contact-roles",
      "/v1/contacts",
      "/v1/contacts/{id}",
      "/v1/contacts/{id}/archive",
      "/v1/contacts/{id}/restore",
    ]);
    for (const operations of Object.values(doc.paths) as Record<string, unknown>[]) {
      expect("delete" in operations).toBe(false);
    }
  });

  it("référence le serveur fourni et l'auth par clé", () => {
    expect(doc.servers[0].url).toBe("https://example.test/functions/v1/contacts-api");
    expect(doc.components.securitySchemes.bearerApiKey.scheme).toBe("bearer");
  });

  it("documente le conflit 409 sur les écritures", () => {
    expect(doc.paths["/v1/contacts"].post.responses["409"]).toBeDefined();
    expect(doc.paths["/v1/contacts/{id}"].patch.responses["409"]).toBeDefined();
  });

  it("documente les filtres de la liste, dont l'email exact", () => {
    const names = doc.paths["/v1/contacts"].get.parameters.map((p: { name: string }) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["type", "status", "search", "email", "source", "external_id", "limit", "offset"]),
    );
  });
});
