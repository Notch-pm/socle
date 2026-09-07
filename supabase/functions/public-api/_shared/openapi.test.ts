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
        "/v1/portal/tenant",
        "/v1/portal/procedures",
        "/v1/portal/procedures/{id}",
        "/v1/portal/page",
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

  it("annonce la version 1.14.0 du contrat", () => {
    expect(doc.info.version).toBe("1.14.0");
  });

  it("décrit les textes traduits d'une section, dans un schéma à PART", () => {
    // ⚠️ Pas un élargissement de `Translations` : celui-là est servi sur
    // `Category` et `Procedure`, où `title`/`body` n'existent pas. Y ajouter ces
    // clés dirait au consommateur qu'elles peuvent y apparaître — c'est faux.
    const section = doc.components.schemas.PortalSectionTranslations;
    expect(Object.keys(section.additionalProperties.properties))
      .toEqual(["title", "subtitle", "placeholder", "body"]);
    expect(section.description).toContain("champ par champ");
    expect(Object.keys(doc.components.schemas.Translations.additionalProperties.properties))
      .toEqual(["name", "short_description"]);

    for (const kind of ["Recherche", "Demarches", "Actus", "Compte", "Texte", "Footer"]) {
      const schema = doc.components.schemas[`Portal${kind}Section`];
      expect(schema.properties.translations, kind).toEqual({
        $ref: "#/components/schemas/PortalSectionTranslations",
      });
      expect(schema.required, kind).toContain("translations");
    }
  });

  it("décrit les DEUX textes traduisibles, et le repli champ par champ", () => {
    // Ajout du 2026-09-07 : `short_description` rejoint `name` sous chaque
    // langue. Un consommateur qui replierait la langue entière au lieu du champ
    // masquerait un libellé traduit sous prétexte que le descriptif manque.
    const props = doc.components.schemas.Translations.additionalProperties.properties;
    expect(Object.keys(props)).toEqual(["name", "short_description"]);
    expect(doc.components.schemas.Translations.description).toContain("champ par champ");
  });

  it("sert les schémas de saisie sur le détail, jamais sur la liste", () => {
    // La bascule du contrat 1.12.0 : le formulaire d'une démarche existe pour
    // le portail, mais seulement une démarche à la fois, et seulement publiée.
    const detail = doc.paths["/v1/portal/procedures/{id}"].get;
    expect(detail.description).toMatch(/form_schema/);
    expect(detail.description).toMatch(/requester_config/);
    expect(detail.responses["200"].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/PortalProcedureDetail",
    );
    expect(detail.responses).toHaveProperty("404");

    const listSchema = doc.paths["/v1/portal/procedures"].get.responses["200"]
      .content["application/json"].schema.items.$ref;
    expect(listSchema).toBe("#/components/schemas/PortalProcedure");
    expect(doc.components.schemas.PortalProcedure.properties).not.toHaveProperty("form_schema");
    // Et la liste dit où aller chercher le formulaire.
    expect(doc.paths["/v1/portal/procedures"].get.description).toContain(
      "GET /v1/portal/procedures/{id}",
    );
  });

  it("avertit que la clé machine d'un champ est `key`, pas son `id`", () => {
    // Le piège coûteux : déposer `form_data` indexé par `id` produirait des
    // demandes dont aucun agent ne reconnaît les champs.
    const detail = doc.paths["/v1/portal/procedures/{id}"].get.description;
    expect(detail).toMatch(/`key`/);
    expect(detail).toMatch(/conditions/);
  });

  it("dit qui propose chaque démarche du portail, et que la liste n'est jamais vide", () => {
    const schema = doc.components.schemas.PortalProcedure;
    expect(schema.required).toContain("organizations");
    expect(schema.properties.organizations.items.$ref).toBe("#/components/schemas/PortalOrganizationRef");
    expect(schema.properties.organizations.description).toMatch(/Jamais vide/);
    const route = doc.paths["/v1/portal/procedures"].get.description;
    expect(route).toContain("**quatre** conditions");
    expect(route).toMatch(/activée/);
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

describe("contrat — portail usagers", () => {
  const doc = buildOpenApiDocument("https://example.supabase.co/functions/v1/public-api") as any;
  const tenant = doc.paths["/v1/portal/tenant"].get;

  it("prend le nom d'hôte en paramètre obligatoire", () => {
    expect(tenant.tags).toEqual(["Portail"]);
    const hostname = tenant.parameters.find((p: any) => p.name === "hostname");
    expect(hostname).toMatchObject({ in: "query", required: true });
    expect(hostname.schema.maxLength).toBe(253);
  });

  it("promet qu'ajouter une collectivité ne demande aucun déploiement", () => {
    // C'est LA propriété que le portail achète en appelant cette route : si le
    // contrat cesse de la tenir, le portail redevient une application par
    // collectivité. Épinglée ici pour que la promesse ne s'efface pas d'une
    // réécriture de description.
    expect(tenant.description).toContain("aucun déploiement");
  });

  it("documente le 404 indistinct — la route ne renseigne pas sur l'existence d'une collectivité", () => {
    expect(tenant.responses).toHaveProperty("400");
    expect(tenant.responses).toHaveProperty("404");
    expect(tenant.description).toMatch(/inconnu.*hors périmètre.*obsolète/s);
  });

  it("sert un tenant minimal — pas une fiche organisation", () => {
    const schema = doc.components.schemas.Tenant;
    expect(Object.keys(schema.properties).sort()).toEqual([
      "hostname",
      "id",
      "languages",
      "name",
      "slug",
    ]);
    // Une page publique : rien de ce qui suit n'a de raison d'y être servi.
    for (const leak of ["address", "phone", "email", "metadata", "email_sender_name"]) {
      expect(schema.properties).not.toHaveProperty(leak);
    }
  });
});

describe("contrat — démarches du portail", () => {
  const doc = buildOpenApiDocument("https://example.supabase.co/functions/v1/public-api") as any;
  const procedures = doc.paths["/v1/portal/procedures"].get;

  it("exige l'identifiant de la collectivité résolue", () => {
    expect(procedures.tags).toEqual(["Portail"]);
    expect(procedures.parameters).toEqual([
      expect.objectContaining({ name: "tenant_id", in: "query", required: true }),
    ]);
  });

  it("détourne explicitement de refaire le filtrage côté consommateur", () => {
    // La raison d'être de la route. Sans cette phrase, un intégrateur repartirait
    // de /v1/procedures et réimplémenterait trois règles qu'il verrait diverger.
    expect(procedures.description).toContain("N'appliquez pas ces règles vous-même");
    expect(procedures.description).toMatch(/production/);
    expect(procedures.description).toMatch(/externe/);
    expect(procedures.description).toMatch(/période de publication/);
  });

  it("annonce qu'une liste vide est normale", () => {
    expect(procedures.description).toContain("n'a encore rien publié");
    expect(procedures.responses["200"].description).toContain("Peut être vide");
  });

  it("sert une démarche amputée du paramétrage d'instruction", () => {
    const schema = doc.components.schemas.PortalProcedure;
    expect(Object.keys(schema.properties).sort()).toEqual([
      "id",
      "input_duration_minutes",
      "name",
      "organizations",
      "short_description",
      "translations",
      "user_description",
    ]);
    for (const leak of ["form_schema", "knowledge_base", "agent_description", "requester_config"]) {
      expect(schema.properties).not.toHaveProperty(leak);
    }
  });
});

describe("contrat — libellés traduits", () => {
  const doc = buildOpenApiDocument("https://example.supabase.co/functions/v1/public-api") as any;
  const ref = { $ref: "#/components/schemas/Translations" };

  it("décrit les traductions une fois, et les trois ressources s'y réfèrent", () => {
    // Un seul schéma : les démarches, les catégories et le portail ne peuvent
    // pas se mettre à décrire trois formes différentes du même objet.
    expect(doc.components.schemas.Translations).toBeTruthy();
    expect(doc.components.schemas.Category.properties.translations).toEqual(ref);
    expect(doc.components.schemas.Procedure.properties.translations).toEqual(ref);
    expect(doc.components.schemas.PortalProcedure.properties.translations).toEqual(ref);
  });

  it("dit les deux règles qu'un consommateur ne peut pas deviner", () => {
    // Sans elles, un intégrateur cherche une clé « fr » qui n'existe pas, puis
    // affiche un libellé vide là où il devait retomber sur le français.
    const description = doc.components.schemas.Translations.description;
    expect(description).toContain("`fr`");
    expect(description).toContain("repli");
  });

  it("dit où trouver les langues activées par la collectivité", () => {
    const languages = doc.components.schemas.Tenant.properties.languages;
    expect(languages.type).toBe("array");
    expect(languages.description).toContain("français");
    expect(languages.description).toContain("résolu");
    expect(doc.info.description).toContain("## Langues");
  });
});

describe("contrat — page publiée du portail", () => {
  const doc = buildOpenApiDocument("https://example.supabase.co/functions/v1/public-api") as any;
  const page = doc.paths["/v1/portal/page"].get;

  it("prend la collectivité résolue, et une adresse de page par défaut", () => {
    expect(page.tags).toEqual(["Portail"]);
    expect(page.parameters).toEqual([
      expect.objectContaining({ name: "tenant_id", in: "query", required: true }),
      expect.objectContaining({ name: "slug", in: "query", required: false }),
    ]);
    expect(page.parameters[1].schema.default).toBe("accueil");
  });

  it("dit que 404 n'est pas une panne, et que le brouillon n'est jamais servi", () => {
    // Les deux phrases que le portail doit lire avant de se brancher : sans la
    // première il afficherait une erreur à une collectivité qui n'a rien
    // publié ; sans la seconde il chercherait une route vers le brouillon.
    expect(page.description).toContain("n'est pas une panne");
    expect(page.description).toContain("sauvegarder n'est pas publier");
  });

  it("promet des références résolues et exige d'ignorer les kinds inconnus", () => {
    expect(page.description).toContain("références sont déjà résolues");
    expect(page.description).toContain("Ignorez les `kind`");
  });

  it("discrimine les sections par kind, une par type de la palette", () => {
    const items = doc.components.schemas.PortalPage.properties.sections.items;
    expect(Object.keys(items.discriminator.mapping).sort()).toEqual([
      "actus",
      "compte",
      "demarches",
      "footer",
      "recherche",
      "texte",
    ]);
    for (const ref of items.oneOf) {
      const name = ref.$ref.split("/").pop();
      expect(doc.components.schemas[name].required).toContain("kind");
    }
  });
});
