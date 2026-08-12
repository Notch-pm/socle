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
      "/v1/contacts/match",
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

  it("documente les filtres de la liste, dont l'email exact, le téléphone et le quartier", () => {
    const names = doc.paths["/v1/contacts"].get.parameters.map((p: { name: string }) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "type",
        "status",
        "search",
        "email",
        "phone",
        "source",
        "external_id",
        "quartier_id",
        "limit",
        "offset",
      ]),
    );
  });

  it("documente le rapprochement d'identités (/match)", () => {
    const match = doc.paths["/v1/contacts/match"];
    expect(Object.keys(match)).toEqual(["post"]); // POST seul, lecture seule
    // Le candidat embarque la fiche via le MÊME schéma que la liste.
    const matchSchema = doc.components.schemas.ContactMatch;
    expect(matchSchema.properties.contact.$ref).toBe("#/components/schemas/Contact");
    expect(matchSchema.properties.reasons.items.enum).toEqual([
      "email",
      "phone",
      "siret",
      "name_exact",
      "name_similar",
      "birth_date",
    ]);
    // La requête accepte l'identité partielle, sans champ obligatoire.
    const request = doc.components.schemas.ContactMatchRequest;
    expect(request.required).toBeUndefined();
    expect(Object.keys(request.properties)).toEqual(
      expect.arrayContaining([
        "contact_type",
        "first_name",
        "last_name",
        "usage_name",
        "legal_name",
        "siret",
        "birth_date",
        "email",
        "phones",
        "status",
        "exclude_ids",
        "limit",
      ]),
    );
  });

  it("documente les coordonnées et le quartier dans la fiche et les payloads", () => {
    for (const schema of ["Contact", "ContactCreate", "ContactUpdate"]) {
      const properties = doc.components.schemas[schema].properties;
      expect(properties).toHaveProperty("address_lat");
      expect(properties).toHaveProperty("address_lon");
      expect(properties).toHaveProperty("quartier_id");
    }
    // quartier_auto est en lecture seule : présent dans Contact, pas dans les payloads.
    expect(doc.components.schemas.Contact.properties).toHaveProperty("quartier_auto");
    expect(doc.components.schemas.ContactCreate.properties).not.toHaveProperty("quartier_auto");
    expect(doc.components.schemas.ContactUpdate.properties).not.toHaveProperty("quartier_auto");
  });

  it("déclare l'en-tête X-Organization-Id (clé plateforme) et le référence sur tous les endpoints", () => {
    const header = doc.components.parameters.XOrganizationId;
    expect(header).toMatchObject({
      name: "X-Organization-Id",
      in: "header",
      required: false,
      schema: { type: "string", format: "uuid" },
    });
    expect(header.description).toMatch(/plateforme/);

    for (const [pathKey, operations] of Object.entries(doc.paths) as [string, Record<string, any>][]) {
      for (const [method, operation] of Object.entries(operations)) {
        const params = (operation as { parameters?: Array<{ $ref?: string }> }).parameters ?? [];
        expect(
          params.some((p) => p.$ref === "#/components/parameters/XOrganizationId"),
          `${method.toUpperCase()} ${pathKey} doit référencer XOrganizationId`,
        ).toBe(true);
      }
    }
  });
});
