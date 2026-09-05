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
        "/v1/organizations/{id}/branding",
        "/v1/categories",
        "/v1/procedures",
        "/v1/procedures/{id}",
        "/v1/document-types",
        "/v1/document-templates",
        "/v1/document-templates/{id}",
        "/v1/document-templates/{id}/signed-url",
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
        "CommunicationConfig",
        "VisibilityConfig",
        "DocumentType",
        "Quartier",
        "SignedUrl",
        "Error",
      ]),
    );
  });

  it("documente la visibilité : bornes incluses, et null lu comme les défauts", () => {
    const visibility = doc.components.schemas.VisibilityConfig;
    expect(Object.keys(visibility.properties)).toEqual([
      "portalVisible",
      "publicationPeriodEnabled",
      "publicationStart",
      "publicationEnd",
    ]);
    // Les bornes sont des jours civils, pas des instants.
    expect(visibility.properties.publicationStart.format).toBe("date");
    expect(visibility.properties.publicationEnd.format).toBe("date");
    // Sans ces deux phrases, un consommateur devine — et devinera de travers.
    expect(visibility.description).toContain("incluses");
    expect(visibility.description).toContain("conservées");
    expect(doc.components.schemas.CommunicationConfig.description).toContain("défaut");
    expect(doc.components.schemas.Procedure.properties.communication_config.$ref).toBe(
      "#/components/schemas/CommunicationConfig",
    );
  });

  it("documente le statut, et le distingue de la visibilité", () => {
    const status = doc.components.schemas.Procedure.properties.status;
    expect(status.enum).toEqual(["brouillon", "production"]);
    // Deux notions voisines : le contrat doit dire laquelle fait quoi.
    expect(status.description).toContain("communication_config.visibility");
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

  it("documente la charte graphique : héritage résolu, et le piège des colonnes brutes", () => {
    const branding = doc.paths["/v1/organizations/{id}/branding"].get;
    expect(branding.tags).toEqual(["Charte graphique"]);
    // Scope `read` : contrairement au relais SMTP, rien ici n'est un secret.
    expect(branding.responses).not.toHaveProperty("403");
    expect(branding.responses).toHaveProperty("404");
    // Le contrat doit dire que l'héritage est déjà fait…
    expect(branding.description).toContain("héritage est déjà résolu");
    // …et détourner explicitement de la reconstitution depuis la fiche organisation,
    // où les colonnes d'une organisation qui hérite sont nulles.
    expect(branding.description).toContain("Ne reconstituez pas");
    const schema = doc.components.schemas.Branding;
    expect(schema.properties.source_organization_id).toBeDefined();
    expect(schema.properties.inherited).toBeDefined();
    expect(schema.properties.configured).toBeDefined();
  });
});

describe("contrat — documents et courriers", () => {
  const doc = buildOpenApiDocument("https://example.supabase.co/functions/v1/public-api") as any;

  it("annonce la version 1.6.0 du contrat", () => {
    expect(doc.info.version).toBe("1.6.0");
  });

  it("sert les documents d'une démarche déjà résolus", () => {
    expect(doc.components.schemas.Procedure.properties.documents.$ref).toBe(
      "#/components/schemas/ProcedureDocuments",
    );
    const items = doc.components.schemas.ProcedureDocuments.properties.items;
    expect(items.items.$ref).toBe("#/components/schemas/ProcedureDocument");
  });

  it("avertit que les conditions ne s'appliquent pas sans restrict_visibility", () => {
    // Le piège coûteux : appliquer les conditions sans lire le drapeau masquerait
    // des documents que le paramétreur a rendus visibles.
    const desc =
      doc.components.schemas.ProcedureDocuments.properties.restrict_visibility.description;
    expect(desc).toContain("tous");
    expect(desc).toMatch(/masquerait/);
  });

  it("distingue les deux groupes et les trois conditions", () => {
    const props = doc.components.schemas.ProcedureDocument.properties;
    expect(props.group.enum).toEqual(["document", "courrier"]);
    expect(props.visibility.enum).toEqual(["toujours", "positive", "negative"]);
    expect(props.type.enum).toEqual(["interne", "externe", "courrier"]);
  });

  it("n'expose jamais le chemin de stockage d'un document", () => {
    // Le fichier passe par une URL signée : un chemin brut inviterait le
    // consommateur à le reconstruire, et déplacerait la garde de périmètre.
    expect(Object.keys(doc.components.schemas.DocumentTemplate.properties)).not.toContain(
      "file_path",
    );
    expect(doc.paths["/v1/document-templates/{id}/signed-url"].get.responses["200"]).toBeTruthy();
  });

  it("filtre le catalogue sur les trois qualifications", () => {
    const [param] = doc.paths["/v1/document-templates"].get.parameters;
    expect(param.name).toBe("type");
    expect(param.schema.enum).toEqual(["interne", "externe", "courrier"]);
  });

  it("documente le bloc brut sans encourager à le résoudre soi-même", () => {
    const desc = doc.components.schemas.DocumentsConfig.description;
    expect(desc).toContain("Procedure.documents");
    expect(doc.components.schemas.CommunicationConfig.properties.documents.$ref).toBe(
      "#/components/schemas/DocumentsConfig",
    );
  });
});
