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
      version: "1.23.0",
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
        "## Langues",
        "Le référentiel est saisi **en français** : `name` porte toujours le libellé français.",
        "Une collectivité peut activer d'autres langues ; les libellés traduits des **démarches**",
        "et des **catégories** arrivent alors dans `translations`, indexés par code de langue",
        "(BCP 47 : `en`, `br`, `oc`, `gcr`…). Il n'y a **jamais** de clé `fr` — le français est",
        "`name` — et une langue absente n'est pas un trou : **repliez sur `name`**.",
        "Les langues activées par une collectivité sont servies par",
        "`GET /v1/portal/tenant` (champ `languages`, héritage résolu).",
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
        name: "Documents",
        description:
          "Catalogue de modèles de documents et de courriers (.doc/.docx/.odt) porteurs de " +
          "variables, et fichiers associés. Les documents rattachés à une démarche sont " +
          "servis résolus dans `Procedure.documents`.",
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
      {
        name: "Portail",
        description:
          "Résolution `domaine → collectivité` pour le portail usagers. Une instance unique " +
          "de portail sert toutes les collectivités : elle ne connaît que le nom d'hôte visité, " +
          "le Socle lui dit à qui il appartient.",
      },
    ],
    paths: {
      "/v1/portal/tenant": {
        get: {
          tags: ["Portail"],
          summary: "Résoudre un domaine en collectivité",
          description:
            "Renvoie la collectivité rattachée au **nom d'hôte** visité par un usager " +
            "(`nantes.edilumen.fr`, `demarches.ville-de-rennes.fr`…), telle qu'enregistrée dans " +
            "les domaines de l'organisation.\n\n" +
            "C'est l'entrée du portail usagers : une instance unique sert toutes les " +
            "collectivités et n'en connaît aucune à l'avance. **Ajouter une collectivité au " +
            "portail ne demande aucun déploiement** — il suffit de lui enregistrer un domaine.\n\n" +
            "Le nom d'hôte est traité comme une donnée non fiable : il ne fait que désigner un " +
            "domaine enregistré, et la réponse reste bornée au périmètre de la clé. Un domaine " +
            "**inconnu**, **hors périmètre**, ou dont l'organisation est **obsolète** reçoivent " +
            "le même `404` — la route ne renseigne pas sur l'existence d'une collectivité.\n\n" +
            "La réponse est volontairement minimale (identifiant, nom, slug). Pour habiller la " +
            "page aux couleurs de la collectivité, voir `GET /v1/organizations/{id}/branding` ; " +
            "pour ses démarches, `GET /v1/procedures?enabled_for={id}`.",
          parameters: [
            {
              name: "hostname",
              in: "query",
              required: true,
              description:
                "Nom d'hôte visité. Normalisé avant recherche : minuscules, port et point " +
                "final retirés. Doit être un FQDN d'au moins deux labels.",
              schema: { type: "string", maxLength: 253, examples: ["nantes.edilumen.fr"] },
            },
          ],
          responses: {
            "200": {
              description: "Collectivité rattachée à ce domaine.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Tenant" } },
              },
            },
            ...errorResponses("400", "401", "404", "500"),
          },
        },
      },
      "/v1/portal/procedures": {
        get: {
          tags: ["Portail"],
          summary: "Lister les démarches publiées d'une collectivité",
          description:
            "Renvoie les démarches qu'un **usager** doit voir sur le portail de la " +
            "collectivité, déjà filtrées par le Socle. Une démarche est publiée quand les " +
            "**quatre** conditions sont réunies :\n\n" +
            "- son paramétrage est en `production` (une démarche `brouillon` n'est proposée " +
            "nulle part) ;\n" +
            "- elle est de type `externe` (une démarche `interne` n'a pas de guichet en ligne) ;\n" +
            "- son bloc `communication_config.visibility` la dit visible sur le portail et, si " +
            "une période de publication est active, le jour courant est dans ses bornes " +
            "(incluses, **heure de Paris**) ;\n" +
            "- elle est **activée** pour au moins un organisme actif de l'arbre de la " +
            "collectivité — la collectivité elle-même ou l'une de ses sous-organisations. Une " +
            "démarche proposée par une seule commune de l'agglomération apparaît donc sur le " +
            "portail de l'agglomération ; `organizations` dit qui la propose, dans l'ordre de " +
            "l'arbre, et n'est jamais vide.\n\n" +
            "**N'appliquez pas ces règles vous-même** à partir de `GET /v1/procedures` : elles " +
            "évoluent avec le paramétrage, et un consommateur qui les recopie finit par publier " +
            "ce qui ne devait pas l'être.\n\n" +
            "⚠️ **`access_mode` n'est pas une cinquième condition.** Une démarche réservée " +
            "aux usagers authentifiés (`access_mode` = \"authentifie\") est servie par " +
            "cette liste comme les autres, et doit s'y afficher comme les autres : c'est en " +
            "la lisant que l'usager apprend qu'il doit se connecter. Demandez la connexion " +
            "au moment de **déposer**, pas au moment de montrer.\n\n" +
            "**Cette liste est un catalogue** : elle ne porte ni `form_schema`, ni " +
            "`requester_config`, ni `knowledge_base`, ni `agent_description`, ni documents. " +
            "Pour afficher une démarche et la faire remplir, appelez " +
            "`GET /v1/portal/procedures/{id}` : elle ajoute la catégorie et les deux schémas " +
            "de SAISIE, et seulement eux. Le paramétrage d'INSTRUCTION, lui, ne quitte jamais " +
            "le Socle — filtrer `Procedure` côté portail l'aurait déjà fait transiter par un " +
            "serveur public.\n\n" +
            "Les démarches sont rendues dans l'ordre d'affichage défini par la collectivité. " +
            "Une liste **vide** est une réponse normale : la collectivité n'a encore rien publié.",
          parameters: [
            {
              name: "tenant_id",
              in: "query",
              required: true,
              description:
                "Identifiant de la collectivité, tel que rendu par `GET /v1/portal/tenant`.",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Démarches publiées, dans l'ordre d'affichage. Peut être vide.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/PortalProcedure" },
                  },
                },
              },
            },
            ...errorResponses("400", "401", "404", "500"),
          },
        },
      },
      "/v1/portal/procedures/{id}": {
        get: {
          tags: ["Portail"],
          summary: "Récupérer une démarche publiée, avec son formulaire",
          description:
            "Renvoie la démarche que l'usager va **remplir** : tout ce que porte la liste, plus " +
            "la catégorie et les **deux schémas de saisie** — `form_schema` (les questions de la " +
            "démarche) et `requester_config` (les publics admis et les informations demandées au " +
            "requérant).\n\n" +
            "Ces deux schémas ne sont pas du paramétrage d'instruction : ils **sont** le " +
            "formulaire de l'usager, et sans eux un portail ne peut afficher qu'un titre. Ce qui " +
            "reste au Socle : `knowledge_base`, `agent_description` et les documents — ce qu'un " +
            "agent lit pour instruire.\n\n" +
            "**Mêmes règles de publication que la liste**, appliquées par le même code : la " +
            "démarche doit appartenir au catalogue publié de la collectivité. Sinon **404**, le " +
            "même que pour un identifiant inexistant. Une démarche en brouillon, hors période, " +
            "interne ou qu'aucun organisme n'active est donc introuvable — et son `form_schema` " +
            "n'est jamais lu.\n\n" +
            "`form_schema` est un schéma **possédé et versionné** " +
            "(`{ version: 1, content: [...] }`) : parsez-le avec tolérance, un `type` de champ " +
            "inconnu s'ignore. ⚠️ La clé machine d'un champ est **`key`** — c'est elle qui " +
            "nomme la donnée en aval ; son **`id`** ne sert qu'aux conditions (`visibleIf`, " +
            "`requiredIf`), qui s'évaluent sur les identifiants. Les deux schémas valent `null` " +
            "quand la démarche n'a rien de paramétré : c'est une démarche sans saisie, pas une " +
            "erreur.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Identifiant de la démarche, tel que rendu par la liste.",
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "tenant_id",
              in: "query",
              required: true,
              description:
                "Identifiant de la collectivité, tel que rendu par `GET /v1/portal/tenant`.",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "La démarche publiée, avec ses schémas de saisie.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PortalProcedureDetail" },
                },
              },
            },
            ...errorResponses("400", "401", "404", "500"),
          },
        },
      },
      "/v1/portal/page": {
        get: {
          tags: ["Portail"],
          summary: "Récupérer la composition publiée d'une page du portail",
          description:
            "Renvoie la page telle que la collectivité l'a **publiée** depuis l'éditeur du Socle : " +
            "une liste ordonnée de sections typées (`recherche`, `demarches`, `actus`, `compte`, " +
            "`texte`, `footer`). Le brouillon en cours d'édition n'est jamais servi — sauvegarder n'est pas " +
            "publier.\n\n" +
            "**`404` n'est pas une panne** : la collectivité n'a encore rien publié (ou la page " +
            "demandée n'existe pas). Le portail rend alors sa mise en page par défaut. Une " +
            "collectivité hors périmètre de la clé reçoit le même `404`.\n\n" +
            "**Les références sont déjà résolues.** `pinned` et `shortcuts` ne contiennent que des " +
            "identifiants de démarches **publiées** (mêmes règles que `GET /v1/portal/procedures`) ; " +
            "une démarche passée en brouillon, hors période ou supprimée en est écartée. Le " +
            "consommateur n'a aucun identifiant mort à gérer, et joint sur `GET /v1/portal/procedures`.\n\n" +
            "**Ignorez les `kind` que vous ne connaissez pas.** Le serveur peut apprendre de nouvelles " +
            "sections avant vous ; une section inconnue s'ignore, elle ne casse pas la page. Le bloc " +
            "`actus` est servi mais les actualités n'existent pas encore côté Socle.",
          parameters: [
            {
              name: "tenant_id",
              in: "query",
              required: true,
              description:
                "Identifiant de la collectivité, tel que rendu par `GET /v1/portal/tenant`.",
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "slug",
              in: "query",
              required: false,
              description: "Adresse de la page dans le portail. Seule `accueil` existe à ce jour.",
              schema: { type: "string", default: "accueil", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
            },
          ],
          responses: {
            "200": {
              description: "Composition publiée de la page.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/PortalPage" } },
              },
            },
            ...errorResponses("400", "401", "404", "500"),
          },
        },
      },
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
            "Logos, favicon et couleurs **applicables à l'organisation demandée** : de quoi",
            "présenter une interface aux couleurs de la collectivité. Scope `read` — rien ici",
            "n'est un secret, contrairement au serveur d'envoi.",
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
            "cinq champs nuls : le consommateur retombe sur son habillage par défaut. Ce n'est",
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
      "/v1/document-templates": {
        get: {
          tags: ["Documents"],
          summary: "Lister les modèles de documents et de courriers",
          description:
            "Catalogue du périmètre de la clé. Pour savoir lesquels s'appliquent à une " +
            "démarche donnée, lisez plutôt `Procedure.documents` : la sélection y est déjà " +
            "résolue, dans l'ordre du paramétrage.",
          parameters: [
            {
              name: "type",
              in: "query",
              schema: { type: "string", enum: ["interne", "externe", "courrier"] },
              description: "Filtre sur la qualification du document.",
            },
          ],
          responses: {
            "200": {
              description: "Liste des documents du catalogue.",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: { $ref: "#/components/schemas/DocumentTemplate" },
                  },
                },
              },
            },
            ...errorResponses("400", "401", "500"),
          },
        },
      },
      "/v1/document-templates/{id}": {
        get: {
          tags: ["Documents"],
          summary: "Lire un document du catalogue",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Le document.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DocumentTemplate" },
                },
              },
            },
            ...errorResponses("400", "401", "404", "500"),
          },
        },
      },
      "/v1/document-templates/{id}/signed-url": {
        get: {
          tags: ["Documents"],
          summary: "Obtenir une URL de téléchargement temporaire",
          description:
            "Le bucket est privé : le fichier s'obtient par une URL signée valable " +
            "**5 minutes**. Ne stockez pas cette URL, redemandez-la au besoin. " +
            "Un document hors du périmètre de la clé répond 404, comme s'il n'existait pas.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "URL signée temporaire.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      url: { type: "string", format: "uri" },
                      file_name: { type: "string" },
                      expires_at: { type: "string", format: "date-time" },
                    },
                  },
                },
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
            "Clé API délivrée par un super administrateur Socle, à envoyer en " +
            "`Authorization: Bearer <clé>`. Deux périmètres : une clé LIÉE à une organisation " +
            "principale voit celle-ci et sa descendance ; une clé PLATEFORME est rattachée à une " +
            "application de la gamme (nora, iris, clara…) et voit les collectivités ABONNÉES à " +
            "cette application — jamais « tout ». Une clé plateforme sans application est refusée (403).",
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
        Tenant: {
          type: "object",
          description:
            "Collectivité derrière un domaine du portail usagers. Whitelist la plus étroite " +
            "de cette API : c'est le seul DTO dont la destination est une page **publique**.",
          required: ["id", "name", "hostname"],
          properties: {
            id: { type: "string", format: "uuid", description: "Identifiant de l'organisation." },
            name: { type: "string", description: "Nom de la collectivité, tel qu'affiché." },
            slug: { type: ["string", "null"], description: "Identifiant lisible, s'il est défini." },
            hostname: {
              type: "string",
              description: "Domaine tel que résolu (forme normalisée stockée).",
              examples: ["nantes.edilumen.fr"],
            },
            languages: {
              type: "array",
              items: { type: "string" },
              description:
                "Langues activées par la collectivité (BCP 47), **français toujours compris " +
                "et en tête** : de quoi bâtir un sélecteur de langue. Le réglage vit sur " +
                "l'organisation principale, l'héritage est **déjà résolu** — la liste est " +
                "celle de la collectivité même quand le domaine désigne une " +
                "sous-organisation.",
              examples: [["fr", "en", "br"]],
            },
            theme: { $ref: "#/components/schemas/PortalTheme" },
          },
        },
        PortalTheme: {
          type: "object",
          description:
            "Thème **publié** du site de démarches : typographie, formes, densité, en-tête, " +
            "accessibilité. Il vaut pour **toutes les pages** du portail — c'est pourquoi il " +
            "voyage avec le tenant plutôt qu'avec une page.\n\n" +
            "⚠️ **Toujours présent, jamais `null`.** Une collectivité qui n'a rien publié " +
            "reçoit les **défauts du Socle** : les laisser inventer au consommateur ferait " +
            "deux jeux de valeurs, qui finiraient par diverger. Un réglage ajouté plus tard " +
            "arrivera de la même façon — avec sa valeur par défaut, jamais un trou.\n\n" +
            "⚠️ **Il ne porte AUCUNE couleur.** Celles-ci viennent de " +
            "`GET /v1/organizations/{id}/branding`, héritage déjà résolu. Le thème dit " +
            "COMMENT peindre, la charte dit AVEC QUOI.\n\n" +
            "Toutes les valeurs sont des **énumérés fermés** : traduisez-les par une table " +
            "de correspondance, sans interpréter de chaîne libre.",
          required: ["typography", "shapes", "header", "accessibility"],
          properties: {
            typography: {
              type: "object",
              required: ["font", "text_scale"],
              properties: {
                font: {
                  type: "string",
                  enum: ["systeme", "nunito-sans", "rubik", "public-sans"],
                  description:
                    "⚠️ Un **identifiant**, pas un nom de famille CSS : traduisez-le en pile " +
                    "de polices. Ne chargez QUE celle-ci — c'est le seul réglage du thème qui " +
                    "coûte des octets et une requête ; tout le reste est du CSS. `systeme` " +
                    "n'en demande aucune.\n\n" +
                    "⚠️ **AUTO-HÉBERGEZ-LES.** Les trois familles web sont sous SIL Open Font " +
                    "License 1.1 — c'est le critère d'entrée au catalogue, précisément pour " +
                    "que vous puissiez les servir depuis votre propre domaine. Les charger " +
                    "depuis Google Fonts enverrait l'adresse IP de chaque visiteur à un tiers, " +
                    "sans base légale, sur le site d'une collectivité.",
                },
                text_scale: {
                  type: "string",
                  enum: ["compact", "standard", "comfortable"],
                  description:
                    "Facteur appliqué à TOUTES les tailles de texte du site : 0,92 / 1 / 1,12.",
                },
              },
            },
            shapes: {
              type: "object",
              required: ["radius", "shadow", "density"],
              properties: {
                radius: {
                  type: "string",
                  enum: ["square", "soft", "round"],
                  description: "Rayon des angles : 2 / 10 / 18 px.",
                },
                shadow: { type: "string", enum: ["none", "soft", "strong"] },
                density: {
                  type: "string",
                  enum: ["compact", "standard", "airy"],
                  description:
                    "Facteur des espacements — entre les blocs et dans les cartes : " +
                    "0,78 / 1 / 1,28. N'agit pas sur les textes.",
                },
              },
            },
            header: {
              type: "object",
              required: ["fill", "color", "logo_white", "logo", "menu", "sticky", "account"],
              properties: {
                fill: {
                  type: "string",
                  enum: ["white", "color"],
                  description:
                    "`color` : le bandeau prend une couleur de la charte, celle que désigne " +
                    "`color`. Posez alors une encre lisible dessus (le Socle en calcule une " +
                    "par luminance).",
                },
                color: { type: "string", enum: ["primary", "secondary"] },
                logo_white: {
                  type: "boolean",
                  description:
                    "Utiliser `logo_white_url` de la charte sur un bandeau coloré. Sans logo " +
                    "blanc déposé, gardez le logo couleur plutôt qu'un bandeau anonyme.",
                },
                logo: { type: "string", enum: ["left", "center"] },
                menu: { type: "string", enum: ["text", "pills"] },
                sticky: {
                  type: "boolean",
                  description: "Le bandeau reste visible au défilement de la page.",
                },
                account: { type: "string", enum: ["prominent", "discreet"] },
              },
            },
            accessibility: {
              type: "object",
              required: ["high_contrast", "dark_primary", "declaration"],
              properties: {
                high_contrast: {
                  type: "boolean",
                  description:
                    "Encres, bordures et couleur principale assombries. Implique l'effet de " +
                    "`dark_primary` sur la couleur principale.",
                },
                dark_primary: {
                  type: "boolean",
                  description:
                    "Assombrir la couleur principale de la charte : **sa clarté multipliée " +
                    "par 0,75**, teinte et saturation inchangées (conversion sRGB → TSL → " +
                    "sRGB). Réglé par la collectivité quand le contraste de sa couleur ne " +
                    "suffit pas ; sa charte, elle, n'est pas modifiée.",
                },
                declaration: {
                  type: "string",
                  description:
                    "Mention d'accessibilité **obligatoire (RGAA)** d'un site public, à " +
                    "afficher au pied des pages. Chaîne vide = la collectivité ne l'a pas " +
                    "encore écrite ; n'inventez rien à sa place.",
                  examples: ["Conformité RGAA partielle — audit du 12 juin 2026"],
                },
              },
            },
          },
        },
        PortalProcedure: {
          type: "object",
          description:
            "Démarche telle qu'un usager la voit. Whitelist beaucoup plus étroite que " +
            "`Procedure` : le paramétrage d'instruction n'y figure pas.",
          required: ["id", "name", "organizations", "audiences", "access_mode"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", description: "Intitulé de la démarche." },
            short_description: {
              type: ["string", "null"],
              description: "Résumé court, pour une liste.",
            },
            user_description: {
              type: ["string", "null"],
              description:
                "Descriptif destiné à l'usager. Ni celui-ci ni `short_description` n'est " +
                "obligatoire au paramétrage : les deux sont servis pour qu'il reste toujours " +
                "quelque chose à afficher.",
            },
            input_duration_minutes: {
              type: ["integer", "null"],
              description: "Durée de saisie estimée, en minutes.",
            },
            access_mode: {
              type: "string",
              enum: ["libre", "authentifie"],
              description:
                "Conditions d'accès : `libre` = n'importe quel visiteur dépose la démarche ; " +
                "`authentifie` = l'usager doit être connecté à son espace pour la déposer. " +
                "⚠️ **Une démarche `authentifie` est servie comme les autres, et doit " +
                "s'afficher comme les autres** : c'est en la lisant que l'usager apprend " +
                "qu'il doit se connecter, et la masquer la cacherait à ceux-là mêmes qui ont " +
                "un compte. Demandez la connexion au moment de **déposer**, pas au moment " +
                "de montrer. Ce n'est donc pas une règle de publication : les démarches " +
                "servies ici sont déjà celles qui sont publiées. ⚠️ `libre` quand la " +
                "collectivité n'a rien réglé — c'est ce qui était vrai avant que le réglage " +
                "existe.",
            },
            organizations: {
              type: "array",
              description:
                "Organismes de l'arbre de la collectivité qui proposent la démarche " +
                "(activation par organisation), dans l'ordre de l'arbre : la collectivité, " +
                "puis ses sous-organisations. Jamais vide.",
              items: { $ref: "#/components/schemas/PortalOrganizationRef" },
            },
            audiences: {
              type: "array",
              description:
                "Publics auxquels la démarche est ouverte, dans cet ordre — de quoi filtrer " +
                "une liste (« Je suis… ») sans charger le détail de chaque démarche. " +
                "⚠️ **Peut être vide**, et ce n'est pas une anomalie : une démarche dont " +
                "l'étape « Informations demandeur » n'a jamais été remplie ne déclare aucun " +
                "public. Elle ne répond alors à **aucun** choix de filtre — la lire comme " +
                "« tous publics » la ferait apparaître là où elle n'est pas ouverte. La " +
                "configuration complète (quels champs, obligatoires ou non) est servie par " +
                "`GET /v1/portal/procedures/{id}` dans `requester_config`.",
              items: { type: "string", enum: ["citoyen", "entreprise", "association"] },
              examples: [["citoyen", "association"]],
            },
            translations: { $ref: "#/components/schemas/Translations" },
          },
        },
        PortalOrganizationRef: {
          type: "object",
          description:
            "Un organisme qui propose une démarche : de quoi le nommer, et de quoi router la " +
            "demande. ⚠️ `id`/`name` désignent l'organisme **AFFICHÉ**, qui n'est pas forcément " +
            "celui qui a activé la démarche : un **service interne** de la collectivité ne " +
            "s'affiche jamais au portail, c'est son porteur (premier ancêtre qui n'est pas un " +
            "service interne) qui est nommé à sa place. Recouper cette liste avec les " +
            "activations brutes donnerait donc un écart, et c'est normal.",
          required: ["id", "name", "slug", "logo_url", "handling_organization_id"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            slug: {
              type: ["string", "null"],
              description:
                "Identifiant lisible de l'organisme **AFFICHÉ** (celui de `name`), ou `null` " +
                "quand il n'en a pas. C'est ce qui lui donne une adresse sur un portail " +
                "usagers : `/<slug>` y sert la page de cet organisme — ses démarches, ses " +
                "couleurs, son logo. Quatre caractères au moins, `[a-z0-9-]` : en dessous, un " +
                "portail le lirait comme un code de langue. ⚠️ Un organisme sans slug reste " +
                "nommé sur les cartes, il n'a simplement pas de page.",
            },
            logo_url: {
              type: ["string", "null"],
              format: "uri",
              description:
                "Logo de l'organisme affiché, ou `null` s'il n'en a pas — de quoi le " +
                "reconnaître dans une liste (un menu « Ma ville », par exemple). ⚠️ C'est son " +
                "logo **PROPRE**, l'héritage n'est PAS résolu ici, contrairement à " +
                "`GET /v1/organizations/{id}/branding` : dans une liste de communes, un logo " +
                "hérité donnerait la même image à chaque ligne. `null` signifie donc « pas de " +
                "logo à elle » — affichez un repli neutre, pas celui de la collectivité.",
            },
            handling_organization_id: {
              type: ["string", "null"],
              format: "uuid",
              description:
                "L'organisation qui **instruit** réellement, quand ce n'est pas l'organisme " +
                "affiché — `null` sinon. ⚠️ C'est un identifiant et rien d'autre : le **nom** du " +
                "service interne n'est pas servi, la collectivité a choisi de ne pas le " +
                "montrer. Ne l'affichez pas à un usager ; transmettez-le avec la demande, pour " +
                "qu'elle arrive au bon service. Il y en a **au plus un** : le Socle refuse " +
                "qu'une même démarche soit activée par deux organisations d'un même porteur.",
            },
          },
          example: {
            id: "d5227d25-f327-493a-a9a2-278397531e33",
            name: "Mairie de Saint-Martin-de-Crau",
            slug: "mairie-de-saint-martin-de-crau",
            logo_url: "https://exemple.fr/logos/saint-martin-de-crau.png",
            handling_organization_id: "3f2a1b9c-0d4e-4a6b-9c8d-1e2f3a4b5c6d",
          },
        },
        PortalProcedureDetail: {
          allOf: [
            { $ref: "#/components/schemas/PortalProcedure" },
            {
              type: "object",
              description:
                "Ce que la liste ne porte pas : la catégorie, et les schémas de saisie.",
              required: ["category", "form_schema", "requester_config"],
              properties: {
                category: {
                  description: "Catégorie de la démarche. `null` si elle n'en a pas.",
                  oneOf: [
                    { $ref: "#/components/schemas/PortalCategoryRef" },
                    { type: "null" },
                  ],
                },
                form_schema: {
                  type: ["object", "null"],
                  description:
                    "Schéma de formulaire possédé, `{ version: 1, content: [...] }`. Un nœud " +
                    "racine est un champ ou une `section`. La clé machine d'un champ est " +
                    "`key` ; son `id` ne sert qu'aux conditions. `null` = pas de formulaire.",
                },
                requester_config: {
                  type: ["object", "null"],
                  description:
                    "Publics admis et informations demandées au requérant : " +
                    "`{ citoyen: { enabled, fields: { courriel: \"obligatoire\", ... } }, ... }`. " +
                    "Un champ vaut `masque`, `visible` ou `obligatoire` ; un public non " +
                    "`enabled` n'est pas proposé. `null` = jamais paramétré.",
                },
              },
            },
          ],
        },
        PortalCategoryRef: {
          type: "object",
          description: "Catégorie d'une démarche : de quoi la nommer, rien de plus.",
          required: ["id", "name"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", description: "Libellé en français, la langue pivot." },
            translations: { $ref: "#/components/schemas/Translations" },
          },
        },
        PortalPage: {
          type: "object",
          description:
            "Composition publiée d'une page du portail. `sections` est ordonnée ; chaque section " +
            "est discriminée par `kind`.",
          required: ["slug", "published_at", "version", "sections"],
          properties: {
            slug: { type: "string", examples: ["accueil"] },
            published_at: {
              type: "string",
              format: "date-time",
              description: "Date de la publication servie.",
            },
            version: { type: "integer", enum: [1] },
            sections: {
              type: "array",
              items: {
                oneOf: [
                  { $ref: "#/components/schemas/PortalRechercheSection" },
                  { $ref: "#/components/schemas/PortalDemarchesSection" },
                  { $ref: "#/components/schemas/PortalActusSection" },
                  { $ref: "#/components/schemas/PortalCompteSection" },
                  { $ref: "#/components/schemas/PortalTexteSection" },
                  { $ref: "#/components/schemas/PortalTexteImageSection" },
                  { $ref: "#/components/schemas/PortalFooterSection" },
                ],
                discriminator: {
                  propertyName: "kind",
                  mapping: {
                    recherche: "#/components/schemas/PortalRechercheSection",
                    demarches: "#/components/schemas/PortalDemarchesSection",
                    actus: "#/components/schemas/PortalActusSection",
                    compte: "#/components/schemas/PortalCompteSection",
                    texte: "#/components/schemas/PortalTexteSection",
                    "texte-image": "#/components/schemas/PortalTexteImageSection",
                    footer: "#/components/schemas/PortalFooterSection",
                  },
                },
              },
            },
          },
        },
        PortalRechercheSection: {
          type: "object",
          description:
            "Champ de recherche de démarche, avec raccourcis facultatifs — et, en option, une " +
            "**image de fond** qui recouvre le bloc.",
          required: [
            "id",
            "kind",
            "title",
            "subtitle",
            "placeholder",
            "show_shortcuts",
            "shortcuts",
            "image_url",
            "image_full_width",
            "image_fixed",
            "translations",
          ],
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["recherche"] },
            title: { type: "string" },
            subtitle: { type: "string" },
            placeholder: { type: "string", description: "Texte du champ vide." },
            show_shortcuts: { type: "boolean" },
            shortcuts: {
              type: "array",
              items: { type: "string", format: "uuid" },
              description: "Démarches en raccourci — identifiants de démarches publiées, 4 au plus.",
            },
            image_url: {
              type: "string",
              description:
                "Image de **fond** du bloc : elle le recouvre entièrement, cadrée au centre et " +
                "rognée pour le remplir (`background-size: cover`). Chaîne vide = pas d'image. " +
                "⚠️ C'est un FOND, pas une illustration — d'où l'absence de texte alternatif, " +
                "contrairement à `PortalTexteImageSection` : ce qu'une synthèse vocale doit " +
                "lire, ce sont le titre et le sous-titre, posés dessus. Rendez-la en CSS, pas " +
                "en `<img>`. ⚠️ **Posez un voile clair par-dessus** si vos textes restent en " +
                "encre sombre : la collectivité choisit sa photo, personne ne sait ce qu'elle " +
                "contient. Le Socle rend un blanc à 60 %, ce qui garantit 5,7 : 1 sous l'encre " +
                "du portail même sur une image noire — au-dessus du seuil AA. ⚠️ URL **libre** " +
                "saisie par la collectivité : le Socle n'héberge pas le fichier et ne garantit " +
                "pas qu'il existe encore. Filtrée sur sa forme — `https://…` absolue, rien " +
                "d'autre.",
              examples: ["https://medias.ville.fr/accueil/hotel-de-ville.jpg"],
            },
            image_full_width: {
              type: "boolean",
              description:
                "L'image va d'un **bord à l'autre** de la page au lieu de s'arrêter aux marges " +
                "du contenu. ⚠️ Sans objet quand `image_url` est vide : la valeur est conservée " +
                "telle quelle par le Socle, c'est un réglage de l'image, pas du bloc.",
            },
            image_fixed: {
              type: "boolean",
              description:
                "L'image reste **fixe** pendant que la page défile, le bloc glissant par-dessus " +
                "(`background-attachment: fixed`). ⚠️ Sans objet sans image, comme ci-dessus. " +
                "⚠️ C'est un **ornement** : les navigateurs mobiles qui ignorent `fixed` " +
                "affichent le bloc entier, image comprise, simplement sans l'effet.",
            },
            translations: { $ref: "#/components/schemas/PortalSectionTranslations" },
          },
        },
        PortalDemarchesSection: {
          type: "object",
          description: "Grille de démarches ; le catalogue vient de `GET /v1/portal/procedures`.",
          required: [
            "id",
            "kind",
            "title",
            "columns",
            "pinned_first",
            "pinned",
            "audience_filter",
            "translations",
          ],
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["demarches"] },
            title: { type: "string" },
            columns: { type: "integer", enum: [2, 3, 4] },
            pinned_first: {
              type: "boolean",
              description: "Les démarches à la une remontent en tête de grille.",
            },
            pinned: {
              type: "array",
              items: { type: "string", format: "uuid" },
              description: "Démarches à la une — identifiants de démarches publiées.",
            },
            audience_filter: {
              type: "boolean",
              description:
                "Proposer le filtre « Je suis… » (citoyen / entreprise / association), qui " +
                "restreint la grille aux démarches dont `audiences` contient le public choisi. " +
                "Il se **cumule** avec un filtre par organisme, il ne le remplace pas. " +
                "⚠️ `true` ne veut pas dire « affiche-le » : un filtre à un seul choix n'en est " +
                "pas un — ne le montrez que si les démarches affichées visent au moins deux " +
                "publics. `false` sur les pages composées avant l'existence de ce filtre.",
            },
            translations: { $ref: "#/components/schemas/PortalSectionTranslations" },
          },
        },
        PortalActusSection: {
          type: "object",
          description: "Bloc actualités. Servi pour la complétude du contrat ; sans contenu à ce jour.",
          required: ["id", "kind", "title", "layout", "count", "show_dates", "translations"],
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["actus"] },
            title: { type: "string" },
            layout: { type: "string", enum: ["grid", "list"] },
            count: { type: "integer", enum: [2, 3, 4] },
            show_dates: { type: "boolean" },
            translations: { $ref: "#/components/schemas/PortalSectionTranslations" },
          },
        },
        PortalCompteSection: {
          type: "object",
          description: "Bandeau « espace usager ».",
          required: ["id", "kind", "title", "subtitle", "translations"],
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["compte"] },
            title: { type: "string" },
            subtitle: { type: "string" },
            translations: { $ref: "#/components/schemas/PortalSectionTranslations" },
          },
        },
        PortalTexteSection: {
          type: "object",
          description: "Bandeau texte libre.",
          required: ["id", "kind", "title", "body", "align", "translations"],
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["texte"] },
            title: { type: "string" },
            body: { type: "string" },
            align: { type: "string", enum: ["left", "center"] },
            translations: { $ref: "#/components/schemas/PortalSectionTranslations" },
          },
        },
        PortalTexteImageSection: {
          type: "object",
          description:
            "Un texte et une illustration. `layout` dit lequel des deux se lit en **premier** — " +
            "un ordre, pas une position : sur un téléphone les deux moitiés s'empilent, et il " +
            "n'y a plus de gauche ni de droite.",
          required: ["id", "kind", "title", "body", "image_url", "alt", "layout", "translations"],
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["texte-image"] },
            title: {
              type: "string",
              description:
                "Titre **facultatif** sur ce bloc : vide, il n'y a pas de titre à afficher.",
            },
            body: { type: "string" },
            image_url: {
              type: "string",
              description:
                "URL de l'image : **`https` absolue**, ou chaîne vide. ⚠️ C'est une adresse " +
                "**libre** saisie par la collectivité : le Socle n'héberge pas le fichier et ne " +
                "garantit pas qu'il existe encore — prévoyez le cas où elle ne charge pas. Sa " +
                "**forme** est en revanche filtrée : `javascript:`, `data:`, `http://` et les " +
                "chemins relatifs sont **écartés, pas nettoyés** (un portail servi en https ne " +
                "peut de toute façon afficher ni contenu mixte ni chemin résolu chez lui). " +
                "Chaîne **vide** = pas d'image : le bloc n'est alors qu'un bandeau texte, ce " +
                "n'est pas une erreur.",
              examples: ["https://exemple.fr/media/piscine.jpg"],
            },
            alt: {
              type: "string",
              description:
                "Texte alternatif de l'image. **Vide = image décorative** : rendez un `alt` vide, " +
                "jamais le titre du bloc à la place — une synthèse vocale lirait deux fois la " +
                "même chose. Il se traduit comme les autres textes (`translations.alt`).",
            },
            layout: {
              type: "string",
              enum: ["text-first", "image-first"],
              description: "Ce qui se lit en premier. À conserver quand les moitiés s'empilent.",
            },
            translations: { $ref: "#/components/schemas/PortalSectionTranslations" },
          },
        },
        PortalFooterSection: {
          type: "object",
          description:
            "Pied de page : bandeau **pleine largeur** à la couleur de fond choisie, dont les " +
            "sous-blocs (des bandeaux texte — coordonnées, horaires, mentions) se répartissent sur " +
            "une à trois colonnes, dans l'ordre. Le texte se lit en clair sur un fond sombre.",
          required: ["id", "kind", "title", "background", "columns", "children", "translations"],
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["footer"] },
            title: { type: "string", description: "En-tête facultatif, souvent vide." },
            background: {
              type: "string",
              pattern: "^#[0-9a-f]{6}$",
              description: "Couleur de fond, `#rrggbb` minuscule.",
              examples: ["#0f1f18"],
            },
            columns: { type: "integer", enum: [1, 2, 3] },
            children: {
              type: "array",
              items: { $ref: "#/components/schemas/PortalTexteSection" },
            },
            translations: { $ref: "#/components/schemas/PortalSectionTranslations" },
          },
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
            is_internal_service: {
              type: "boolean",
              description:
                "`true` = l'organisation n'est **pas un guichet usager**. Elle instruit des " +
                "demandes, mais le portail la présente sous le nom de son premier ancêtre qui " +
                "n'est pas un service interne (son « porteur »). Ne la proposez pas à un usager " +
                "final. Toujours `false` sur une organisation principale, qui n'a personne " +
                "au-dessus d'elle pour la porter.",
            },
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
            is_internal_service: false,
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
              description: "Au moins un des cinq éléments est défini.",
            },
            logo_url: { type: ["string", "null"], format: "uri", description: "Logo couleur." },
            logo_white_url: {
              type: ["string", "null"],
              format: "uri",
              description: "Logo blanc, pour les fonds sombres.",
            },
            favicon_url: {
              type: ["string", "null"],
              format: "uri",
              description:
                "Favicon : l'icône que le navigateur affiche dans l'onglet et les favoris du " +
                "site de démarches. Image carrée, déposée par la collectivité — le Socle ne " +
                "la redimensionne pas et ne l'héberge pas. Posez-la en " +
                "`<link rel=\"icon\">` ; sans elle, gardez la vôtre.",
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
            favicon_url: "https://exemple.fr/favicon.png",
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
            name: { type: "string", description: "Libellé de la catégorie, en français." },
            icon: {
              type: ["string", "null"],
              description: "Icône (identifiant d'icône lucide-react, ex. \"FileText\").",
            },
            translations: { $ref: "#/components/schemas/Translations" },
            created_at: { type: ["string", "null"], format: "date-time" },
          },
          example: {
            id: "b1e2c3d4-0000-0000-0000-000000000001",
            organization_id: "d5227d25-f327-493a-a9a2-278397531e33",
            name: "État civil",
            icon: "FileText",
            translations: { en: { name: "Civil status" } },
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
            access_mode: {
              type: "string",
              enum: ["libre", "authentifie"],
              description:
                "Conditions d'accès pour l'usager : `libre` (aucun compte requis) ou " +
                "`authentifie` (l'usager doit être connecté à son espace pour déposer). " +
                "⚠️ **Ce n'est pas une quatrième règle de publication** : une démarche " +
                "réservée est publiée comme les autres et doit se voir au catalogue. Ce " +
                "champ dit à quelles CONDITIONS on la dépose, pas si on la montre. " +
                "Défaut `libre`, y compris pour les démarches d'avant le réglage.",
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
            documents: { $ref: "#/components/schemas/ProcedureDocuments" },
            translations: { $ref: "#/components/schemas/Translations" },
            created_at: { type: ["string", "null"], format: "date-time" },
            updated_at: { type: ["string", "null"], format: "date-time" },
          },
        },
        Translations: {
          type: ["object", "null"],
          description:
            "Textes traduits, indexés par **code de langue** (BCP 47 : ISO 639-1 quand il " +
            "existe, ISO 639-3 sinon). Chaque langue porte un objet dont les clés sont celles " +
            "des colonnes françaises correspondantes : `name`, et — sur une démarche — " +
            "`short_description`. Trois règles à connaître avant d'afficher quoi que ce " +
            "soit : il n'y a **jamais** de clé `fr` (le texte français est le champ de même " +
            "nom) ; un texte **absent** n'est pas un texte vide, c'est un **repli sur le " +
            "champ français** ; et le repli se fait **champ par champ** — une langue peut " +
            "porter le libellé traduit et pas le descriptif, c'est le cas normal. Les langues " +
            "qu'une collectivité a activées sont servies par `GET /v1/portal/tenant` " +
            "(`languages`).",
          additionalProperties: {
            type: "object",
            properties: {
              name: { type: "string", description: "Libellé dans cette langue." },
              short_description: {
                type: "string",
                description:
                  "Descriptif court dans cette langue (démarches uniquement — une catégorie " +
                  "n'en a pas).",
              },
            },
          },
          example: {
            en: { name: "Birth certificate", short_description: "To get a copy of your record." },
            br: { name: "Testeni ganedigezh" },
          },
        },
        PortalSectionTranslations: {
          type: "object",
          description:
            "Textes de la section traduits, indexés par **code de langue** (BCP 47). Les clés " +
            "d'une langue sont celles des textes de la section : `title`, et selon le `kind` " +
            "`subtitle`, `placeholder`, `body`, `alt` — attendre `body` sur une section " +
            "`recherche` " +
            "n'a pas de sens. Mêmes trois règles que `Translations` : il n'y a **jamais** de " +
            "clé `fr` (le français est le champ de même nom) ; un texte **absent** n'est pas " +
            "un texte vide, c'est un **repli sur le champ français** ; et ce repli se fait " +
            "**champ par champ** — une langue peut porter le titre traduit sans le paragraphe, " +
            "c'est le cas normal. Toujours présent, `{}` quand rien n'est traduit. Les langues " +
            "qu'une collectivité a activées sont servies par `GET /v1/portal/tenant` " +
            "(`languages`).",
          additionalProperties: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              placeholder: { type: "string" },
              body: { type: "string" },
              alt: {
                type: "string",
                description: "Texte alternatif de l'image d'un bloc `texte-image`.",
              },
            },
          },
          example: {
            en: { title: "Our services", body: "Open Monday to Friday." },
            br: { title: "Hor c'hefridi" },
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
            documents: { $ref: "#/components/schemas/DocumentsConfig" },
          },
          example: {
            visibility: {
              portalVisible: true,
              publicationPeriodEnabled: true,
              publicationStart: "2026-09-01",
              publicationEnd: "2026-12-31",
            },
            documents: {
              restrictVisibility: true,
              documents: [{ id: "6f1c…", visibility: "toujours" }],
              letters: [{ id: "a92b…", visibility: "negative" }],
            },
          },
        },
        DocumentsConfig: {
          type: "object",
          description:
            "Bloc « Documents et courriers » **brut**. ⚠️ Ne le résolvez pas vous-même : " +
            "`Procedure.documents` porte la même sélection déjà rapprochée du catalogue " +
            "(libellé, type, nom de fichier), références mortes écartées. Ce bloc n'est " +
            "documenté que pour lever toute ambiguïté sur ce qui est stocké. " +
            "Les identifiants renvoient à `document_templates` : `documents` puise dans " +
            "les types `interne`/`externe`, `letters` dans `courrier`.",
          properties: {
            restrictVisibility: {
              type: "boolean",
              description:
                "Faux (défaut) : toutes les conditions `visibility` sont **sans effet**, " +
                "tous les documents s'appliquent. Les conditions sont conservées quand le " +
                "paramétreur désactive la restriction.",
            },
            documents: {
              type: "array",
              items: { $ref: "#/components/schemas/DocumentSelection" },
            },
            letters: {
              type: "array",
              items: { $ref: "#/components/schemas/DocumentSelection" },
            },
          },
        },
        DocumentSelection: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid", description: "Identifiant du document." },
            visibility: {
              type: "string",
              enum: ["toujours", "positive", "negative"],
              description: "Issue de la demande pour laquelle le document s'applique.",
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
        ProcedureDocuments: {
          type: "object",
          description:
            "Documents et courriers que l'agent peut produire depuis cette démarche, " +
            "**déjà résolus** contre le catalogue : de quoi les afficher sans second appel. " +
            "Le fichier s'obtient ensuite par `/v1/document-templates/{id}/signed-url`.",
          properties: {
            restrict_visibility: {
              type: "boolean",
              description:
                "⚠️ Faux (le défaut) : servez **tous** les `items`, quelles que soient leurs " +
                "`visibility`. Les conditions restent enregistrées quand le paramétreur " +
                "désactive la restriction — les appliquer sans lire ce drapeau masquerait " +
                "à tort des documents rendus visibles.",
            },
            items: {
              type: "array",
              items: { $ref: "#/components/schemas/ProcedureDocument" },
              description:
                "Dans l'ordre choisi au paramétrage : documents puis courriers. Un document " +
                "supprimé du catalogue **disparaît** de cette liste (le paramétrage ne porte " +
                "pas de clé étrangère).",
            },
          },
          example: {
            restrict_visibility: true,
            items: [
              {
                id: "6f1c…",
                name: "Notice explicative",
                description: null,
                type: "interne",
                group: "document",
                file_name: "notice.docx",
                visibility: "toujours",
              },
              {
                id: "a92b…",
                name: "Lettre de refus",
                description: null,
                type: "courrier",
                group: "courrier",
                file_name: "refus.docx",
                visibility: "negative",
              },
            ],
          },
        },
        ProcedureDocument: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", description: "Libellé du document." },
            description: { type: ["string", "null"] },
            type: { type: "string", enum: ["interne", "externe", "courrier"] },
            group: {
              type: "string",
              enum: ["document", "courrier"],
              description:
                "Sous-groupe de l'étape Communication : `courrier` pour les modèles de " +
                "courrier, `document` pour les types `interne`/`externe`.",
            },
            file_name: { type: "string", description: "Nom d'origine du fichier." },
            visibility: {
              type: "string",
              enum: ["toujours", "positive", "negative"],
              description:
                "Issue de la demande pour laquelle le document s'applique. Sans effet si " +
                "`restrict_visibility` est faux.",
            },
          },
        },
        DocumentTemplate: {
          type: "object",
          description:
            "Modèle de document ou de courrier du catalogue d'une organisation principale. " +
            "Le fichier (.doc/.docx/.odt) porte des variables `{{usager.nom}}`, " +
            "`{{demande.code_suivi}}`, `{{organisme.nom}}` — c'est l'application aval qui " +
            "les valorise, le Socle ne fusionne rien.",
          properties: {
            id: { type: "string", format: "uuid" },
            organization_id: { type: "string", format: "uuid" },
            name: { type: "string", description: "Libellé, unique dans l'organisation." },
            description: { type: ["string", "null"] },
            type: { type: "string", enum: ["interne", "externe", "courrier"] },
            file_name: {
              type: "string",
              description:
                "Nom d'origine du fichier. Le chemin de stockage n'est pas exposé : passez " +
                "par `/v1/document-templates/{id}/signed-url`.",
            },
            created_at: { type: ["string", "null"], format: "date-time" },
            updated_at: { type: ["string", "null"], format: "date-time" },
          },
          example: {
            id: "a92b…",
            organization_id: "3d1f…",
            name: "Lettre de refus",
            description: "Envoyée à l'usager en cas de décision défavorable.",
            type: "courrier",
            file_name: "refus.docx",
            created_at: "2026-09-01T09:00:00Z",
            updated_at: "2026-09-01T09:00:00Z",
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
