/**
 * Document OpenAPI 3.1 de l'API usagers — servi tel quel à `GET /openapi.json`.
 * Même exigence que `public-api` : la documentation est un livrable de premier
 * ordre (descriptions en français, erreurs documentées par endpoint).
 */

function errorResponses(...codes: Array<"400" | "401" | "403" | "404" | "409" | "500">) {
  const refByCode: Record<string, string> = {
    "400": "#/components/responses/BadRequest",
    "401": "#/components/responses/Unauthorized",
    "403": "#/components/responses/Forbidden",
    "404": "#/components/responses/NotFound",
    "409": "#/components/responses/Conflict",
    "500": "#/components/responses/InternalError",
  };
  const map: Record<string, { $ref: string }> = {};
  for (const c of codes) map[c] = { $ref: refByCode[c] };
  return map;
}

const CONTACT_RESPONSE = {
  description: "La fiche usager complète (rôles et références externes inclus).",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Contact" } } },
};

const ID_PARAM = {
  name: "id",
  in: "path",
  required: true,
  description: "Identifiant (UUID) de l'usager.",
  schema: { type: "string", format: "uuid" },
};

export function buildOpenApiDocument(serverUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "API Socle — Référentiel des usagers",
      version: "1.0.0",
      description: [
        "API du **référentiel des usagers** de la gamme (contacts : personnes physiques,",
        "entreprises, associations, administrations). Elle permet de **consulter, créer,",
        "modifier et archiver** (obsolescence réversible) les usagers d'une collectivité.",
        "**Aucune suppression** n'est possible via cette API.",
        "",
        "Un usager n'existe **qu'une seule fois par organisation principale** : Ariane, Clara,",
        "Iris et le portail citoyen consomment et alimentent la même fiche.",
        "",
        "## Authentification",
        "Chaque appel doit porter une **clé API** dans l'en-tête `Authorization: Bearer <clé>`.",
        "Les clés sont **destinées à un usage serveur-à-serveur** et doivent porter le scope",
        "**`contacts`** (une clé de lecture du référentiel général ne suffit pas : les usagers",
        "sont des données personnelles). Une clé est rattachée à une **organisation principale**",
        "et ne donne accès qu'aux usagers de cette organisation (isolation multi-tenant).",
        "",
        "## Données sensibles",
        "`internal_notes` est une note **réservée aux agents** : un consommateur qui sert des",
        "usagers finaux (portail citoyen) ne doit jamais la leur retransmettre.",
        "",
        "## Écritures",
        "`POST /v1/contacts` crée une fiche ; `PATCH /v1/contacts/{id}` modifie les champs",
        "fournis uniquement. `role_ids` et `external_references` **remplacent** l'ensemble",
        "existant quand ils sont fournis (les omettre = ne rien toucher). `contact_type` est",
        "immuable. Le statut se change via `/archive` et `/restore`.",
        "",
        "## Erreurs",
        "Toute erreur renvoie `{ \"error\": { \"code\": \"...\", \"message\": \"...\" } }` :",
        "`400` (payload invalide), `401` (clé absente/invalide/révoquée/expirée), `403` (scope",
        "`contacts` manquant), `404` (fiche inexistante ou hors périmètre), `405` (méthode non",
        "autorisée), `409` (conflit d'unicité : SIRET ou référence externe déjà utilisés),",
        "`500` (erreur interne).",
      ].join("\n"),
      contact: { name: "Équipe Socle" },
    },
    servers: [{ url: serverUrl, description: "Point d'entrée de l'API" }],
    security: [{ bearerApiKey: [] }],
    tags: [
      { name: "Usagers", description: "Fiches usagers (consultation, création, modification, archivage)." },
      { name: "Rôles", description: "Catalogue des rôles de contact de l'organisation." },
    ],
    paths: {
      "/v1/contacts": {
        get: {
          tags: ["Usagers"],
          summary: "Lister les usagers",
          description:
            "Renvoie les usagers de l'organisation de la clé, triés par nom d'affichage. " +
            "Filtres cumulables ; `source` + `external_id` permettent de retrouver un usager " +
            "par son identifiant dans un logiciel tiers.",
          parameters: [
            {
              name: "type",
              in: "query",
              required: false,
              description: "Filtre sur le type de contact.",
              schema: { type: "string", enum: ["personne", "entreprise", "association", "administration"] },
            },
            {
              name: "status",
              in: "query",
              required: false,
              description: "Filtre sur le statut (par défaut, tous les statuts sont renvoyés).",
              schema: { type: "string", enum: ["active", "archived"] },
            },
            {
              name: "search",
              in: "query",
              required: false,
              description: "Recherche insensible à la casse dans le nom d'affichage.",
              schema: { type: "string" },
            },
            {
              name: "email",
              in: "query",
              required: false,
              description:
                "Adresse email exacte (comparaison insensible à la casse, pas de recherche " +
                "partielle) — pour rapprocher un usager de l'expéditeur d'un message.",
              schema: { type: "string" },
            },
            {
              name: "source",
              in: "query",
              required: false,
              description: "Avec `external_id` : source de la référence externe (ex. `portail_citoyen`).",
              schema: { type: "string" },
            },
            {
              name: "external_id",
              in: "query",
              required: false,
              description: "Avec `source` : identifiant de l'usager dans ce système tiers.",
              schema: { type: "string" },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              description: "Nombre maximum de fiches renvoyées (défaut 100, maximum 500).",
              schema: { type: "integer", minimum: 1, maximum: 500, default: 100 },
            },
            {
              name: "offset",
              in: "query",
              required: false,
              description: "Décalage de pagination.",
              schema: { type: "integer", minimum: 0, default: 0 },
            },
          ],
          responses: {
            "200": {
              description: "Liste des usagers.",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Contact" } },
                },
              },
            },
            ...errorResponses("400", "401", "403", "500"),
          },
        },
        post: {
          tags: ["Usagers"],
          summary: "Créer un usager",
          description:
            "Crée une fiche usager. `contact_type` gouverne les champs obligatoires : la " +
            "**civilité** pour une personne physique, la **raison sociale** pour une structure.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ContactCreate" } } },
          },
          responses: {
            "201": CONTACT_RESPONSE,
            ...errorResponses("400", "401", "403", "409", "500"),
          },
        },
      },
      "/v1/contacts/{id}": {
        get: {
          tags: ["Usagers"],
          summary: "Consulter un usager",
          parameters: [ID_PARAM],
          responses: {
            "200": CONTACT_RESPONSE,
            ...errorResponses("400", "401", "403", "404", "500"),
          },
        },
        patch: {
          tags: ["Usagers"],
          summary: "Modifier un usager",
          description:
            "Modification **partielle** : seuls les champs fournis sont modifiés. `role_ids` et " +
            "`external_references`, s'ils sont fournis, **remplacent** l'ensemble existant.",
          parameters: [ID_PARAM],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ContactUpdate" } } },
          },
          responses: {
            "200": CONTACT_RESPONSE,
            ...errorResponses("400", "401", "403", "404", "409", "500"),
          },
        },
      },
      "/v1/contacts/{id}/archive": {
        post: {
          tags: ["Usagers"],
          summary: "Archiver un usager (obsolescence réversible)",
          description:
            "Passe la fiche au statut `archived`. La fiche reste consultable et référençable ; " +
            "l'opération est réversible via `/restore`. Idempotent.",
          parameters: [ID_PARAM],
          responses: {
            "200": CONTACT_RESPONSE,
            ...errorResponses("400", "401", "403", "404", "500"),
          },
        },
      },
      "/v1/contacts/{id}/restore": {
        post: {
          tags: ["Usagers"],
          summary: "Réactiver un usager archivé",
          description: "Repasse la fiche au statut `active`. Idempotent.",
          parameters: [ID_PARAM],
          responses: {
            "200": CONTACT_RESPONSE,
            ...errorResponses("400", "401", "403", "404", "500"),
          },
        },
      },
      "/v1/contact-roles": {
        get: {
          tags: ["Rôles"],
          summary: "Lister les rôles de contact",
          description:
            "Catalogue des rôles de l'organisation (Habitant, Élu, Agent…). Les identifiants " +
            "renvoyés alimentent `role_ids` à la création/modification d'un usager.",
          responses: {
            "200": {
              description: "Liste des rôles.",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/ContactRole" } },
                },
              },
            },
            ...errorResponses("401", "403", "500"),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerApiKey: {
          type: "http",
          scheme: "bearer",
          description:
            "Clé API délivrée par un super administrateur Socle, portant le scope `contacts`.",
        },
      },
      responses: {
        BadRequest: {
          description: "Requête invalide (payload ou paramètre).",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Unauthorized: {
          description: "Clé API absente, invalide, révoquée ou expirée.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Forbidden: {
          description: "La clé ne porte pas le scope `contacts`.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        NotFound: {
          description: "Fiche inexistante ou hors du périmètre de la clé.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Conflict: {
          description: "Conflit d'unicité (SIRET ou référence externe déjà utilisés).",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        InternalError: {
          description: "Erreur interne.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", description: "Code d'erreur stable." },
                message: { type: "string", description: "Message lisible en français." },
              },
            },
          },
        },
        ContactRoleRef: {
          type: "object",
          description: "Rôle porté par l'usager.",
          required: ["id", "name"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", examples: ["Habitant"] },
          },
        },
        ExternalReference: {
          type: "object",
          description: "Identifiant de l'usager dans un logiciel tiers.",
          required: ["id", "source", "external_id"],
          properties: {
            id: { type: "string", format: "uuid" },
            source: { type: "string", examples: ["portail_citoyen"] },
            external_id: { type: "string", examples: ["USR-12345"] },
            created_at: { type: ["string", "null"], format: "date-time" },
            updated_at: { type: ["string", "null"], format: "date-time" },
          },
        },
        ExternalReferenceInput: {
          type: "object",
          description: "Référence externe à rattacher (une seule par source).",
          required: ["source", "external_id"],
          properties: {
            source: { type: "string", examples: ["portail_citoyen"] },
            external_id: { type: "string", examples: ["USR-12345"] },
          },
        },
        ContactRelation: {
          type: "object",
          description:
            "Relation dirigée entre deux usagers. Dans `relations`, l'usager porteur est " +
            "<rôle> de `contact` (ex. Gérant de la Boulangerie) ; dans `reverse_relations`, " +
            "`contact` est <rôle> de l'usager porteur.",
          required: ["id", "role", "contact"],
          properties: {
            id: { type: "string", format: "uuid" },
            role: { $ref: "#/components/schemas/ContactRoleRef" },
            contact: {
              type: "object",
              required: ["id", "contact_type"],
              properties: {
                id: { type: "string", format: "uuid" },
                display_name: { type: ["string", "null"] },
                contact_type: { type: "string" },
              },
            },
          },
        },
        ContactRelationInput: {
          type: "object",
          description:
            "Relation sortante à rattacher : l'usager est <role_id> de <related_contact_id>. " +
            "La cible doit être une structure (entreprise, association, administration) — " +
            "jamais une personne physique.",
          required: ["related_contact_id", "role_id"],
          properties: {
            related_contact_id: { type: "string", format: "uuid" },
            role_id: { type: "string", format: "uuid", description: "Rôle du catalogue (/v1/contact-roles)." },
          },
        },
        Contact: {
          type: "object",
          description:
            "Fiche usager complète. `display_name` est calculé (nom d'usage/nom + prénom, ou " +
            "raison sociale). `internal_notes` est réservée aux agents.",
          required: ["id", "organization_id", "contact_type", "status", "roles", "external_references"],
          properties: {
            id: { type: "string", format: "uuid" },
            organization_id: { type: "string", format: "uuid" },
            contact_type: {
              type: "string",
              enum: ["personne", "entreprise", "association", "administration"],
            },
            civility: { type: ["string", "null"], enum: ["madame", "monsieur", null] },
            first_name: { type: ["string", "null"] },
            last_name: { type: ["string", "null"], description: "Nom de naissance." },
            usage_name: { type: ["string", "null"], description: "Nom d'usage." },
            birth_date: { type: ["string", "null"], format: "date" },
            legal_name: { type: ["string", "null"], description: "Raison sociale." },
            siret: { type: ["string", "null"], description: "14 chiffres, unique par organisation." },
            display_name: { type: ["string", "null"], description: "Nom d'affichage calculé." },
            email: { type: ["string", "null"] },
            mobile_phone: { type: ["string", "null"] },
            landline_phone: { type: ["string", "null"] },
            address_line1: { type: ["string", "null"] },
            address_line2: { type: ["string", "null"] },
            postal_code: { type: ["string", "null"] },
            city: { type: ["string", "null"] },
            country: { type: "string", default: "France" },
            preferred_channel: { type: ["string", "null"], enum: ["email", "telephone", "courrier", null] },
            consent_email: { type: "boolean" },
            consent_sms: { type: "boolean" },
            internal_notes: {
              type: ["string", "null"],
              description: "Note interne **réservée aux agents** (ne jamais montrer à l'usager).",
            },
            status: { type: "string", enum: ["active", "archived"] },
            roles: { type: "array", items: { $ref: "#/components/schemas/ContactRoleRef" } },
            external_references: {
              type: "array",
              items: { $ref: "#/components/schemas/ExternalReference" },
            },
            relations: {
              type: "array",
              items: { $ref: "#/components/schemas/ContactRelation" },
              description: "Cet usager est <rôle> de… (relations sortantes).",
            },
            reverse_relations: {
              type: "array",
              items: { $ref: "#/components/schemas/ContactRelation" },
              description: "… est <rôle> de cet usager (relations entrantes, lecture seule).",
            },
            created_at: { type: ["string", "null"], format: "date-time" },
            updated_at: { type: ["string", "null"], format: "date-time" },
          },
        },
        ContactCreate: {
          type: "object",
          description:
            "Création d'un usager. Personne physique : `civility` obligatoire, `legal_name`/" +
            "`siret` interdits. Structure : `legal_name` obligatoire, champs d'identité interdits.",
          required: ["contact_type"],
          properties: {
            contact_type: {
              type: "string",
              enum: ["personne", "entreprise", "association", "administration"],
            },
            civility: { type: ["string", "null"], enum: ["madame", "monsieur", null] },
            first_name: { type: ["string", "null"] },
            last_name: { type: ["string", "null"] },
            usage_name: { type: ["string", "null"] },
            birth_date: { type: ["string", "null"], format: "date" },
            legal_name: { type: ["string", "null"] },
            siret: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            mobile_phone: { type: ["string", "null"] },
            landline_phone: { type: ["string", "null"] },
            address_line1: { type: ["string", "null"] },
            address_line2: { type: ["string", "null"] },
            postal_code: { type: ["string", "null"] },
            city: { type: ["string", "null"] },
            country: { type: "string", default: "France" },
            preferred_channel: { type: ["string", "null"], enum: ["email", "telephone", "courrier", null] },
            consent_email: { type: "boolean", default: false },
            consent_sms: { type: "boolean", default: false },
            internal_notes: { type: ["string", "null"] },
            role_ids: {
              type: "array",
              items: { type: "string", format: "uuid" },
              description: "Rôles à rattacher (voir /v1/contact-roles).",
            },
            external_references: {
              type: "array",
              items: { $ref: "#/components/schemas/ExternalReferenceInput" },
            },
            relations: {
              type: "array",
              items: { $ref: "#/components/schemas/ContactRelationInput" },
              description: "Relations sortantes (remplace l'ensemble si fourni).",
            },
          },
        },
        ContactUpdate: {
          type: "object",
          description:
            "Modification partielle : mêmes champs que la création **sauf** `contact_type` " +
            "(immuable). `role_ids` / `external_references` / `relations` remplacent l'ensemble existant.",
          properties: {
            civility: { type: ["string", "null"], enum: ["madame", "monsieur", null] },
            first_name: { type: ["string", "null"] },
            last_name: { type: ["string", "null"] },
            usage_name: { type: ["string", "null"] },
            birth_date: { type: ["string", "null"], format: "date" },
            legal_name: { type: ["string", "null"] },
            siret: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            mobile_phone: { type: ["string", "null"] },
            landline_phone: { type: ["string", "null"] },
            address_line1: { type: ["string", "null"] },
            address_line2: { type: ["string", "null"] },
            postal_code: { type: ["string", "null"] },
            city: { type: ["string", "null"] },
            country: { type: "string" },
            preferred_channel: { type: ["string", "null"], enum: ["email", "telephone", "courrier", null] },
            consent_email: { type: "boolean" },
            consent_sms: { type: "boolean" },
            internal_notes: { type: ["string", "null"] },
            role_ids: { type: "array", items: { type: "string", format: "uuid" } },
            external_references: {
              type: "array",
              items: { $ref: "#/components/schemas/ExternalReferenceInput" },
            },
            relations: {
              type: "array",
              items: { $ref: "#/components/schemas/ContactRelationInput" },
            },
          },
        },
        ContactRole: {
          type: "object",
          description: "Entrée du catalogue de rôles de l'organisation.",
          required: ["id", "organization_id", "name"],
          properties: {
            id: { type: "string", format: "uuid" },
            organization_id: { type: "string", format: "uuid" },
            name: { type: "string", examples: ["Habitant"] },
            created_at: { type: ["string", "null"], format: "date-time" },
          },
        },
      },
    },
  };
}
