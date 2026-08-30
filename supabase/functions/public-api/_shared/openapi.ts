/**
 * Document OpenAPI 3.1 de l'API publique Socle — servi tel quel à
 * `GET /openapi.json` et rendu par Redoc à `GET /docs`. **La documentation est
 * un livrable de premier ordre** : descriptions en français, formats décrits,
 * exemples, et erreurs (400/401/403/404/405/500) documentées par endpoint.
 *
 * Les schémas des JSON possédés (`FormSchema`, `RequesterConfig`,
 * `KnowledgeBase`, `CommunicationConfig`) reflètent les modules sources
 * (contrat public) : `src/features/procedures/{formSchema,requesterFields,
 * knowledgeBase,conditions,communication}.ts`.
 */

const ERROR_SCHEMA_REF = "#/components/schemas/Error";

function errorResponses(...codes: Array<"400" | "401" | "403" | "404" | "500">) {
  const map: Record<string, { $ref: string }> = {};
  const refByCode: Record<string, string> = {
    "400": "#/components/responses/BadRequest",
    "401": "#/components/responses/Unauthorized",
    "403": "#/components/responses/Forbidden",
    "404": "#/components/responses/NotFound",
    "500": "#/components/responses/InternalError",
  };
  for (const c of codes) map[c] = { $ref: refByCode[c] };
  return map;
}

export function buildOpenApiDocument(serverUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "API Socle — Référentiel de la gamme",
      version: "1.5.0",
      description: [
        "API **en lecture seule** exposant le référentiel central de la gamme : les",
        "**organisations** (et sous-organisations) avec l'intégralité de leur configuration,",
        "les **démarches** (descriptif + formulaire + informations demandeur + base de",
        "connaissances + communication), les **catégories** (libellé + icône), les **types de pièce",
        "justificative** et les **quartiers** (découpage du territoire en polygones).",
        "",
        "Ces données sont la **source de vérité** consommée en aval par les autres",
        "applications de la gamme (Ariane, Clara, …) et, potentiellement, par des",
        "partenaires externes.",
        "",
        "## Authentification",
        "Chaque appel doit porter une **clé API** dans l'en-tête",
        "`Authorization: Bearer <clé>`. Les clés sont **destinées à un usage serveur-à-serveur**",
        "(ne pas les exposer dans un navigateur). Une clé est délivrée par un super",
        "administrateur Socle et est soit **rattachée à une organisation principale** — elle ne",
        "donne accès qu'à **cette organisation et à toute sa descendance** (isolation",
        "multi-tenant) —, soit une **clé plateforme** (`organization_id` nul, liaison unique",
        "Socle↔Clara) dont le périmètre couvre **toutes** les organisations, toutes racines",
        "confondues. Ce second cas exige un paramètre supplémentaire pour les géométries de",
        "quartiers — voir `GET /v1/quartiers`.",
        "",
        "La clé doit en outre porter le scope **`read`** : une clé qui ne l'a pas (par exemple",
        "limitée aux usagers) reçoit une réponse **403**.",
        "",
        "Le **serveur d'envoi** (`GET /v1/organizations/{id}/smtp`) exige un scope supplémentaire,",
        "**`smtp`**, à demander explicitement à la création de la clé : c'est la seule ressource",
        "de cette API qui sert des **identifiants** (mot de passe du relais de la collectivité).",
        "Elle est servie pour toute organisation du périmètre de la clé, héritage résolu.",
        "",
        "## Formats",
        "Réponses en **JSON** (`application/json`, UTF-8). Les dates sont au format ISO 8601.",
        "Les blocs de configuration possédés (`form_schema`, `requester_config`,",
        "`knowledge_base`, `communication_config`) sont des objets JSON dont la structure est",
        "décrite dans les schémas.",
        "",
        "## Erreurs",
        "Toute erreur renvoie `{ \"error\": { \"code\": \"...\", \"message\": \"...\" } }` avec un",
        "statut HTTP adapté : `400` (requête invalide), `401` (clé absente/invalide/révoquée/",
        "expirée), `403` (accès refusé), `404` (ressource inexistante ou hors périmètre),",
        "`405` (méthode non autorisée — l'API est en lecture seule), `500` (erreur interne).",
      ].join("\n"),
      contact: { name: "Équipe Socle" },
    },
    servers: [{ url: serverUrl, description: "Point d'entrée de l'API" }],
    security: [{ bearerApiKey: [] }],
    tags: [
      { name: "Organisations", description: "Organisations et sous-organisations." },
      { name: "Catégories", description: "Catégories de démarches (libellé + icône)." },
      { name: "Démarches", description: "Démarches et leur configuration intégrale." },
      {
        name: "Types de pièce",
        description: "Types de pièce justificative référencés par les champs PJ.",
      },
      {
        name: "Quartiers",
        description:
          "Découpage du territoire de l'organisation principale en quartiers (polygones). " +
          "Les usagers y sont rattachés automatiquement selon leur adresse (voir l'API usagers).",
      },
      {
        name: "Messagerie",
        description:
          "Serveur d'envoi (SMTP) de l'organisation principale, consommé par les applications " +
          "de la gamme qui expédient les mails de la collectivité. Scope `smtp` requis.",
      },
      {
        name: "Charte graphique",
        description:
          "Logos et couleurs de la collectivité, héritage déjà résolu — de quoi habiller " +
          "une interface aux couleurs de l'organisation sans remonter sa hiérarchie.",
      },
      { name: "Documents", description: "Accès temporaire aux documents privés." },
    ],
    paths: {
      "/v1/organizations": {
        get: {
          tags: ["Organisations"],
          summary: "Lister les organisations",
          description:
            "Renvoie les organisations du périmètre de la clé (organisation principale + " +
            "descendance). Par défaut une **liste plate** ; `tree=true` renvoie un **arbre imbriqué**.",
          parameters: [
            {
              name: "status",
              in: "query",
              required: false,
              description: "Filtre sur le statut.",
              schema: { type: "string", enum: ["active", "obsolete"] },
            },
            {
              name: "tree",
              in: "query",
              required: false,
              description: "Si `true`, renvoie un arbre imbriqué (`children`) au lieu d'une liste plate.",
              schema: { type: "boolean", default: false },
            },
          ],
          responses: {
            "200": {
              description: "Liste des organisations.",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      { type: "array", items: { $ref: "#/components/schemas/Organization" } },
                      { type: "array", items: { $ref: "#/components/schemas/OrganizationTreeNode" } },
                    ],
                  },
                },
              },
            },
            ...errorResponses("401", "500"),
          },
        },
      },
      "/v1/organizations/{id}": {
        get: {
          tags: ["Organisations"],
          summary: "Récupérer une organisation",
          description: "Configuration complète d'une organisation du périmètre de la clé.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Identifiant UUID de l'organisation.",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "L'organisation.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Organization" } },
              },
            },
            ...errorResponses("400", "401", "404", "500"),
          },
        },
      },
      "/v1/organizations/{id}/smtp": {
        get: {
          tags: ["Messagerie"],
          summary: "Serveur d'envoi (SMTP) applicable à une organisation",
          description: [
            "Identifiants du relais de messagerie **applicable à l'organisation demandée**, pour",
            "qu'une application de la gamme expédie les mails de la collectivité depuis son",
            "propre domaine. **Seule ressource de cette API qui sert un secret** — d'où deux",
            "gardes cumulatives :",
            "",
            "- la clé porte le scope **`smtp`** (sinon `403`) ;",
            "- l'organisation est dans le **périmètre** de la clé (sinon `404`).",
            "",
            "**Héritage** : le relais se définit d'ordinaire sur l'organisation principale et vaut",
            "pour toute sa descendance ; une sous-organisation peut néanmoins en avoir un propre.",
            "La réponse est donc **résolue** — celui de l'organisation, ou celui de l'ancêtre le",
            "plus proche dont elle hérite — et `source_organization_id` indique laquelle des deux",
            "le porte. Interroger une sous-organisation est légitime et suffit : aucun besoin de",
            "remonter l'arbre soi-même.",
            "",
            "Aucun relais défini (ou configuration incomplète : hôte ou adresse d'expédition",
            "manquants) ⇒ **200** avec `configured: false` et tous les champs nuls. Le",
            "consommateur retombe alors sur son propre repli — il ne tente pas d'expédier.",
          ].join("\n"),
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Identifiant UUID de l'organisation (principale ou sous-organisation).",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Le serveur d'envoi, ou l'absence de configuration.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SmtpSettings" } },
              },
            },
            ...errorResponses("400", "401", "403", "404", "500"),
          },
        },
      },
      "/v1/organizations/{id}/branding": {
        get: {
          tags: ["Charte graphique"],
          summary: "Charte graphique applicable à une organisation",
          description: [
            "Logos et couleurs **applicables à l'organisation demandée** : de quoi présenter une",
            "interface aux couleurs de la collectivité. Scope `read` — rien ici n'est un secret,",
            "contrairement au serveur d'envoi.",
            "",
            "**L'héritage est déjà résolu.** Une charte se définit d'ordinaire sur l'organisation",
            "principale et vaut pour toute sa descendance ; une sous-organisation peut néanmoins en",
            "avoir une propre. La réponse est celle qui s'applique — la sienne, ou celle de",
            "l'ancêtre le plus proche dont elle hérite — et `source_organization_id` dit laquelle",
            "des deux la porte (`inherited` le résume). Interroger une sous-organisation est donc",
            "légitime et suffit.",
            "",
            "⚠️ **Ne reconstituez pas cette charte depuis `GET /v1/organizations/{id}`.** Les",
            "colonnes brutes d'une organisation qui hérite sont **nulles** : vous peindriez du vide",
            "au lieu des couleurs de sa collectivité.",
            "",
            "Aucun élément défini nulle part au-dessus ⇒ **200** avec `configured: false` et les",
            "quatre champs nuls : le consommateur retombe sur son habillage par défaut. Ce n'est",
            "pas une erreur, seulement une collectivité qui n'a pas encore rempli sa charte.",
          ].join("\n"),
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Identifiant UUID de l'organisation (principale ou sous-organisation).",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "La charte applicable, ou l'absence de charte.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Branding" } },
              },
            },
            ...errorResponses("400", "401", "404", "500"),
          },
        },
      },
      "/v1/categories": {
        get: {
          tags: ["Catégories"],
          summary: "Lister les catégories",
          description: "Catégories (libellé + icône) du périmètre de la clé.",
          responses: {
            "200": {
              description: "Liste des catégories.",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Category" } },
                },
              },
            },
            ...errorResponses("401", "500"),
          },
        },
      },
      "/v1/procedures": {
        get: {
          tags: ["Démarches"],
          summary: "Lister les démarches",
          description:
            "Démarches de l'organisation principale du périmètre. Filtrables par catégorie, " +
            "type, ou activation pour une organisation donnée.",
          parameters: [
            {
              name: "category_id",
              in: "query",
              required: false,
              description: "Ne renvoyer que les démarches de cette catégorie.",
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "type",
              in: "query",
              required: false,
              description: "Filtre sur le type de démarche.",
              schema: { type: "string", enum: ["interne", "externe"] },
            },
            {
              name: "enabled_for",
              in: "query",
              required: false,
              description:
                "Ne renvoyer que les démarches **activées** pour cette organisation " +
                "(qui doit appartenir au périmètre de la clé).",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Liste des démarches.",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Procedure" } },
                },
              },
            },
            ...errorResponses("400", "401", "500"),
          },
        },
      },
      "/v1/procedures/{id}": {
        get: {
          tags: ["Démarches"],
          summary: "Récupérer une démarche",
          description:
            "Configuration **intégrale** d'une démarche : descriptif, informations demandeur " +
            "(`requester_config`), formulaire (`form_schema`), base de connaissances " +
            "(`knowledge_base`), communication (`communication_config`), traductions et mots-clés.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Identifiant UUID de la démarche.",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "La démarche.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Procedure" } },
              },
            },
            ...errorResponses("400", "401", "404", "500"),
          },
        },
      },
      "/v1/document-types": {
        get: {
          tags: ["Types de pièce"],
          summary: "Lister les types de pièce justificative",
          description:
            "Types de pièce du périmètre, référencés par le champ `documentTypeId` des pièces " +
            "justificatives dans `form_schema`.",
          responses: {
            "200": {
              description: "Liste des types de pièce.",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/DocumentType" } },
                },
              },
            },
            ...errorResponses("401", "500"),
          },
        },
      },
      "/v1/quartiers": {
        get: {
          tags: ["Quartiers"],
          summary: "Lister les quartiers",
          description:
            "Quartiers de l'organisation principale du périmètre, triés par nom. Par défaut " +
            "**sans géométrie** ; `geometry=true` ajoute le polygone de chaque quartier en " +
            "**GeoJSON** (MultiPolygon, WGS 84 — directement affichable sur une carte). " +
            "Le rattachement des usagers à un quartier est porté par l'API usagers " +
            "(`quartier_id` sur les fiches).",
          parameters: [
            {
              name: "geometry",
              in: "query",
              required: false,
              description: "Si `true`, inclut la géométrie GeoJSON de chaque quartier.",
              schema: { type: "boolean", default: false },
            },
            {
              name: "organization_id",
              in: "query",
              required: false,
              description:
                "Organisation visée (UUID), **requis avec `geometry=true` pour une clé " +
                "plateforme uniquement** (le découpage en quartiers n'existe qu'au niveau " +
                "d'une organisation principale, et une clé plateforme n'en a pas une seule) : " +
                "l'organisation est résolue vers sa racine, qui détermine le découpage renvoyé. " +
                "Absent, mal formé, ou hors du périmètre de la clé → `400` (à la différence des " +
                "autres endpoints, ce n'est pas un `404` : on ne fait pas la différence entre " +
                "« inconnu » et « hors périmètre » sur ce paramètre). Une clé rattachée à une " +
                "organisation ignore ce paramètre (son périmètre est déjà fixé) ; il n'a d'effet " +
                "que sur les géométries, jamais sur la liste des quartiers elle-même.",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Liste des quartiers.",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Quartier" } },
                },
              },
            },
            ...errorResponses("400", "401", "500"),
          },
        },
      },
      "/v1/documents/signed-url": {
        get: {
          tags: ["Documents"],
          summary: "Obtenir une URL signée pour un document",
          description:
            "Renvoie une **URL signée temporaire** (5 min) permettant de télécharger un document " +
            "de la base de connaissances (bucket privé). Le `path` est celui stocké dans " +
            "`knowledge_base` (`agentDocuments[].path` / `trainingDocuments[].path`). Son " +
            "premier segment (l'organisation) doit appartenir au périmètre de la clé.",
          parameters: [
            {
              name: "path",
              in: "query",
              required: true,
              description: "Chemin du document dans le bucket (tel que fourni par la démarche).",
              schema: { type: "string" },
              example: "d5227d25-f327-493a-a9a2-278397531e33/1a2b/agent/uid-guide.pdf",
            },
          ],
          responses: {
            "200": {
              description: "URL signée.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SignedUrl" } },
              },
            },
            ...errorResponses("400", "401", "403", "404", "500"),
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
            "Clé API délivrée par un super administrateur Socle, rattachée à une organisation " +
            "principale. À envoyer en `Authorization: Bearer <clé>`.",
        },
      },
      responses: {
        BadRequest: errorResponseObject("bad_request", "Paramètre ou identifiant invalide."),
        Unauthorized: errorResponseObject(
          "unauthorized",
          "Clé API absente, invalide, révoquée ou expirée.",
        ),
        Forbidden: errorResponseObject("forbidden", "Accès refusé à cette ressource."),
        NotFound: errorResponseObject(
          "not_found",
          "Ressource inexistante ou hors du périmètre de la clé.",
        ),
        InternalError: errorResponseObject("internal_error", "Erreur interne du serveur."),
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
                code: {
                  type: "string",
                  description: "Code d'erreur stable.",
                  enum: [
                    "bad_request",
                    "unauthorized",
                    "forbidden",
                    "not_found",
                    "method_not_allowed",
                    "internal_error",
                  ],
                },
                message: { type: "string", description: "Message lisible (français)." },
              },
            },
          },
          example: { error: { code: "not_found", message: "Organisation introuvable." } },
        },
        Organization: {
          type: "object",
          description: "Organisation ou sous-organisation avec sa configuration.",
          properties: {
            id: { type: "string", format: "uuid" },
            parent_id: {
              type: ["string", "null"],
              format: "uuid",
              description: "Organisation parente (null pour une organisation principale).",
            },
            name: { type: "string" },
            slug: { type: ["string", "null"] },
            type: { type: ["string", "null"], description: "Type libre (ex. collectivité, service)." },
            status: { type: "string", enum: ["active", "obsolete"] },
            address: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            email: { type: ["string", "null"], format: "email" },
            logo_url: { type: ["string", "null"], format: "uri" },
            email_sender_override: {
              type: "boolean",
              description: "Si vrai, un nom d'expéditeur propre à l'organisation est utilisé.",
            },
            email_sender_name: { type: ["string", "null"] },
            metadata: { type: ["object", "null"], additionalProperties: true },
            created_at: { type: ["string", "null"], format: "date-time" },
          },
          example: {
            id: "d5227d25-f327-493a-a9a2-278397531e33",
            parent_id: null,
            name: "ACCM",
            slug: "accm",
            type: "collectivité",
            status: "active",
            address: "1 place de la Mairie",
            phone: "0490000000",
            email: "contact@accm.fr",
            logo_url: null,
            email_sender_override: false,
            email_sender_name: null,
            metadata: null,
            created_at: "2026-01-15T09:00:00Z",
          },
        },
        Branding: {
          type: "object",
          description:
            "Charte graphique applicable, héritage résolu. `source_organization_id` dit qui la " +
            "porte ; `configured: false` signifie qu'aucun élément n'est défini, ni ici ni " +
            "au-dessus.",
          properties: {
            organization_id: { type: "string", format: "uuid" },
            source_organization_id: {
              type: ["string", "null"],
              format: "uuid",
              description: "Organisation qui porte la charte servie (elle-même, ou un ancêtre).",
            },
            inherited: {
              type: "boolean",
              description: "La charte vient d'un ancêtre, pas de l'organisation demandée.",
            },
            configured: {
              type: "boolean",
              description: "Au moins un des quatre éléments est défini.",
            },
            logo_url: { type: ["string", "null"], format: "uri", description: "Logo couleur." },
            logo_white_url: {
              type: ["string", "null"],
              format: "uri",
              description: "Logo blanc, pour les fonds sombres.",
            },
            primary_color: {
              type: ["string", "null"],
              pattern: "^#[0-9a-f]{6}$",
              description: "Couleur principale, notation hexadécimale minuscule.",
            },
            secondary_color: {
              type: ["string", "null"],
              pattern: "^#[0-9a-f]{6}$",
              description: "Couleur secondaire, notation hexadécimale minuscule.",
            },
          },
          example: {
            organization_id: "44b8ebdb-2e7b-4cfa-b4c7-51896b5ff606",
            source_organization_id: "d5227d25-f327-493a-a9a2-278397531e33",
            inherited: true,
            configured: true,
            logo_url: "https://exemple.fr/logo.png",
            logo_white_url: "https://exemple.fr/logo-blanc.svg",
            primary_color: "#1f8a5b",
            secondary_color: "#ffd166",
          },
        },
        SmtpSettings: {
          type: "object",
          description:
            "Serveur d'envoi applicable à une organisation, héritage résolu. " +
            "`configured: false` ⇒ aucun relais exploitable n'est défini, ni ici ni au-dessus, " +
            "et tous les autres champs sont nuls.",
          required: ["organization_id", "configured"],
          properties: {
            organization_id: {
              type: "string",
              format: "uuid",
              description: "Organisation demandée.",
            },
            source_organization_id: {
              type: ["string", "null"],
              format: "uuid",
              description:
                "Organisation qui porte réellement ce relais : celle demandée, ou l'ancêtre " +
                "dont elle hérite. Nulle si `configured: false`.",
            },
            configured: {
              type: "boolean",
              description: "Un relais exploitable est défini (hôte ET adresse d'expédition).",
            },
            host: { type: ["string", "null"], description: "Hôte SMTP." },
            port: {
              type: ["integer", "null"],
              description: "Port SMTP (587 par défaut ; 465 = TLS implicite).",
            },
            username: {
              type: ["string", "null"],
              description: "Identifiant SMTP, nul si le relais n'authentifie pas.",
            },
            password: {
              type: ["string", "null"],
              description:
                "Mot de passe SMTP, **en clair** : à ranger côté consommateur dans un coffre " +
                "(Vault, secret d'exécution), jamais dans une colonne lisible ni un bundle client.",
            },
            from_email: { type: ["string", "null"], format: "email" },
            from_name: { type: ["string", "null"] },
            use_tls: { type: ["boolean", "null"] },
            updated_at: { type: ["string", "null"], format: "date-time" },
          },
          example: {
            organization_id: "d5227d25-f327-493a-a9a2-278397531e33",
            source_organization_id: "d5227d25-f327-493a-a9a2-278397531e33",
            configured: true,
            host: "smtp.accm.fr",
            port: 587,
            username: "notifications@accm.fr",
            password: "•••••",
            from_email: "ne-pas-repondre@accm.fr",
            from_name: "ACCM",
            use_tls: true,
            updated_at: "2026-08-20T10:00:00Z",
          },
        },
        OrganizationTreeNode: {
          allOf: [
            { $ref: "#/components/schemas/Organization" },
            {
              type: "object",
              properties: {
                children: {
                  type: "array",
                  description: "Sous-organisations imbriquées (mode `tree=true`).",
                  items: { $ref: "#/components/schemas/OrganizationTreeNode" },
                },
              },
            },
          ],
        },
        Category: {
          type: "object",
          description: "Catégorie de démarches.",
          properties: {
            id: { type: "string", format: "uuid" },
            organization_id: { type: ["string", "null"], format: "uuid" },
            name: { type: "string", description: "Libellé de la catégorie." },
            icon: {
              type: ["string", "null"],
              description: "Icône (identifiant d'icône lucide-react, ex. \"FileText\").",
            },
            created_at: { type: ["string", "null"], format: "date-time" },
          },
          example: {
            id: "b1e2c3d4-0000-0000-0000-000000000001",
            organization_id: "d5227d25-f327-493a-a9a2-278397531e33",
            name: "État civil",
            icon: "FileText",
            created_at: "2026-01-20T10:00:00Z",
          },
        },
        Procedure: {
          type: "object",
          description: "Démarche et sa configuration intégrale.",
          properties: {
            id: { type: "string", format: "uuid" },
            organization_id: {
              type: ["string", "null"],
              format: "uuid",
              description: "Organisation principale propriétaire du catalogue.",
            },
            category_id: { type: ["string", "null"], format: "uuid" },
            name: { type: "string" },
            type: { type: "string", enum: ["interne", "externe"] },
            status: {
              type: "string",
              enum: ["brouillon", "production"],
              description:
                "Cycle de vie du **paramétrage** : `brouillon` = configuration en cours " +
                "d'écriture, à ne pas servir aux usagers ; `production` = déclarée prête. " +
                "À ne pas confondre avec `communication_config.visibility` : celui-ci dit " +
                "**où et quand** proposer une démarche déjà prête, celui-là dit si elle " +
                "l'est. Une démarche en brouillon n'est proposée nulle part, quelle que " +
                "soit sa visibilité.",
            },
            keywords: { type: "array", items: { type: "string" } },
            short_description: { type: ["string", "null"] },
            user_description: { type: ["string", "null"] },
            agent_description: { type: ["string", "null"] },
            input_duration_minutes: {
              type: ["integer", "null"],
              description: "Durée estimée de saisie (minutes).",
            },
            order_index: { type: ["integer", "null"], description: "Rang d'affichage." },
            requester_config: {
              $ref: "#/components/schemas/RequesterConfig",
            },
            form_schema: { $ref: "#/components/schemas/FormSchema" },
            knowledge_base: { $ref: "#/components/schemas/KnowledgeBase" },
            communication_config: { $ref: "#/components/schemas/CommunicationConfig" },
            translations: {
              type: ["object", "null"],
              additionalProperties: true,
              description: "Traductions éventuelles (structure libre).",
            },
            created_at: { type: ["string", "null"], format: "date-time" },
            updated_at: { type: ["string", "null"], format: "date-time" },
          },
        },
        RequesterConfig: {
          type: ["object", "null"],
          description:
            "Informations demandées au requérant, par public. Chaque public " +
            "(`citoyen`/`entreprise`/`association`) est activable, et chaque champ vaut " +
            "`masque`, `visible` ou `obligatoire`.",
          properties: {
            citoyen: { $ref: "#/components/schemas/AudienceConfig" },
            entreprise: { $ref: "#/components/schemas/AudienceConfig" },
            association: { $ref: "#/components/schemas/AudienceConfig" },
          },
          example: {
            citoyen: {
              enabled: true,
              fields: { nom_usuel: "obligatoire", courriel: "visible", tel_fixe: "masque" },
            },
            entreprise: { enabled: false, fields: {} },
            association: { enabled: false, fields: {} },
          },
        },
        AudienceConfig: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            fields: {
              type: "object",
              additionalProperties: { type: "string", enum: ["masque", "visible", "obligatoire"] },
              description: "État par clé de champ (ex. civilite, nom_usuel, courriel, siret…).",
            },
          },
        },
        FormSchema: {
          type: ["object", "null"],
          description:
            "Formulaire possédé : liste ordonnée de nœuds (champ ou section). Un champ peut être " +
            "simple, un choix (avec options) ou une pièce justificative. Les conditions " +
            "d'affichage (`visibleIf`) et d'obligation (`requiredIf`) suivent le schéma `Condition`.",
          properties: {
            version: { type: "integer", enum: [1] },
            content: {
              type: "array",
              items: {
                oneOf: [
                  { $ref: "#/components/schemas/FormField" },
                  { $ref: "#/components/schemas/FormSection" },
                ],
              },
            },
          },
        },
        FormSection: {
          type: "object",
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["section"] },
            title: { type: "string" },
            description: { type: "string" },
            visibleIf: { $ref: "#/components/schemas/Condition" },
            fields: { type: "array", items: { $ref: "#/components/schemas/FormField" } },
          },
        },
        FormField: {
          type: "object",
          description: "Champ de formulaire (simple, choix ou pièce justificative).",
          properties: {
            id: { type: "string" },
            key: { type: "string", description: "Clé machine — la donnée du contrat en aval." },
            label: { type: "string" },
            help: { type: "string" },
            placeholder: { type: "string" },
            required: { type: "boolean" },
            type: {
              type: "string",
              enum: [
                "text",
                "textarea",
                "number",
                "date",
                "email",
                "phone",
                "boolean",
                "select",
                "radio",
                "checkboxes",
                "attachment",
              ],
            },
            maxLength: { type: "integer", description: "Champs texte." },
            options: {
              type: "array",
              description: "Champs de choix (select/radio/checkboxes).",
              items: {
                type: "object",
                properties: { value: { type: "string" }, label: { type: "string" } },
              },
            },
            documentTypeId: {
              type: "string",
              format: "uuid",
              description: "Pièce justificative : type de pièce référencé (voir /v1/document-types).",
            },
            maxFiles: { type: "integer", description: "Pièce justificative : 1 à 5 fichiers." },
            acceptedFormats: {
              type: "array",
              items: { type: "string" },
              description: "Pièce justificative : formats acceptés (ex. [\"pdf\", \"jpg\"]).",
            },
            visibleIf: { $ref: "#/components/schemas/Condition" },
            requiredIf: { $ref: "#/components/schemas/Condition" },
          },
        },
        Condition: {
          type: "object",
          description: "Condition d'affichage/obligation : combinaison de règles.",
          properties: {
            combinator: { type: "string", enum: ["and", "or"] },
            rules: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  fieldId: { type: "string" },
                  operator: {
                    type: "string",
                    enum: ["equals", "notEquals", "includes", "isEmpty", "isNotEmpty"],
                  },
                  value: {
                    oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
                  },
                },
              },
            },
          },
        },
        KnowledgeBase: {
          type: ["object", "null"],
          description:
            "Informations à destination de l'agent et de son assistant LLM. Textes en Markdown, " +
            "liens, FAQ, garde-fous et références de documents (bucket privé).",
          properties: {
            agentHelpText: { type: "string", description: "Aide agent (Markdown)." },
            proceduresText: { type: "string", description: "Procédures (Markdown)." },
            agentDocuments: {
              type: "array",
              items: { $ref: "#/components/schemas/KbDocument" },
              description: "Documents d'aide agent (PDF/image).",
            },
            trainingDocuments: {
              type: "array",
              items: { $ref: "#/components/schemas/KbDocument" },
              description: "Documents d'entraînement IA.",
            },
            agentLinks: { type: "array", items: { $ref: "#/components/schemas/KbLink" } },
            aiSources: { type: "array", items: { $ref: "#/components/schemas/KbLink" } },
            faq: {
              type: "array",
              items: {
                type: "object",
                properties: { question: { type: "string" }, answer: { type: "string" } },
              },
            },
            guardrails: { type: "array", items: { type: "string" } },
          },
        },
        KbDocument: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Chemin dans le bucket privé — à passer à /v1/documents/signed-url.",
            },
            name: { type: "string", description: "Nom de fichier d'origine." },
          },
        },
        KbLink: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri" },
            description: { type: "string" },
          },
        },
        CommunicationConfig: {
          type: ["object", "null"],
          description:
            "Paramètres de communication de la démarche, organisés en blocs. " +
            "`null` (démarche jamais paramétrée) doit se lire comme les valeurs par " +
            "défaut : visible sur le portail, publication non bornée.",
          properties: {
            visibility: { $ref: "#/components/schemas/VisibilityConfig" },
          },
          example: {
            visibility: {
              portalVisible: true,
              publicationPeriodEnabled: true,
              publicationStart: "2026-09-01",
              publicationEnd: "2026-12-31",
            },
          },
        },
        VisibilityConfig: {
          type: "object",
          description:
            "Si la démarche est proposée au public, et quand. Les deux bornes de " +
            "période sont **incluses** et facultatives : `publicationStart` seul " +
            "publie à partir de ce jour, `publicationEnd` seul jusqu'à ce jour. " +
            "Les dates sont **conservées** quand `publicationPeriodEnabled` est " +
            "faux (le commutateur gouverne l'usage, pas la donnée) : ne pas les " +
            "appliquer dans ce cas.",
          properties: {
            portalVisible: {
              type: "boolean",
              description: "La démarche est proposée aux usagers sur le portail en ligne.",
            },
            publicationPeriodEnabled: {
              type: "boolean",
              description: "La publication est bornée à une période.",
            },
            publicationStart: {
              type: ["string", "null"],
              format: "date",
              description: "Premier jour de publication (AAAA-MM-JJ, inclus). `null` : pas de borne.",
            },
            publicationEnd: {
              type: ["string", "null"],
              format: "date",
              description: "Dernier jour de publication (AAAA-MM-JJ, inclus). `null` : pas de borne.",
            },
          },
        },
        DocumentType: {
          type: "object",
          description: "Type de pièce justificative.",
          properties: {
            id: { type: "string", format: "uuid" },
            organization_id: { type: "string", format: "uuid" },
            name: { type: "string" },
            created_at: { type: ["string", "null"], format: "date-time" },
          },
          example: {
            id: "c9d8e7f6-0000-0000-0000-000000000002",
            organization_id: "d5227d25-f327-493a-a9a2-278397531e33",
            name: "Justificatif de domicile",
            created_at: "2026-02-01T08:30:00Z",
          },
        },
        Quartier: {
          type: "object",
          description:
            "Quartier : polygone du découpage du territoire de l'organisation principale.",
          properties: {
            id: { type: "string", format: "uuid" },
            organization_id: {
              type: "string",
              format: "uuid",
              description: "Organisation principale propriétaire du découpage.",
            },
            name: { type: "string", description: "Nom, unique par organisation." },
            color: {
              type: ["string", "null"],
              description: "Couleur d'affichage (chaîne CSS, ex. \"hsl(152 83% 42%)\").",
            },
            geometry: {
              type: "object",
              description:
                "Géométrie **GeoJSON** (MultiPolygon, WGS 84). Présente seulement si " +
                "`geometry=true` ; `null` si la géométrie n'a pas pu être produite.",
              properties: {
                type: { type: "string", enum: ["MultiPolygon"] },
                coordinates: { type: "array", items: {} },
              },
            },
            created_at: { type: ["string", "null"], format: "date-time" },
            updated_at: { type: ["string", "null"], format: "date-time" },
          },
          example: {
            id: "e4f5a6b7-0000-0000-0000-000000000003",
            organization_id: "d5227d25-f327-493a-a9a2-278397531e33",
            name: "Centre-ville",
            color: "hsl(152 83% 42%)",
            created_at: "2026-07-17T09:00:00Z",
            updated_at: "2026-07-17T09:00:00Z",
          },
        },
        SignedUrl: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri", description: "URL de téléchargement signée." },
            expires_at: { type: "string", format: "date-time", description: "Expiration de l'URL." },
          },
        },
      },
    },
  };
}

function errorResponseObject(code: string, message: string) {
  return {
    description: message,
    content: {
      "application/json": {
        schema: { $ref: ERROR_SCHEMA_REF },
        example: { error: { code, message } },
      },
    },
  };
}
