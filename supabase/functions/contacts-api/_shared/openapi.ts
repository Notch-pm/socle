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

/** Référence vers le paramètre d'en-tête réutilisable `XOrganizationId` (clé plateforme). */
const X_ORGANIZATION_ID_PARAM = { $ref: "#/components/parameters/XOrganizationId" };

export function buildOpenApiDocument(serverUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "API Socle — Référentiel des usagers",
      version: "1.2.0",
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
        "sont des données personnelles). Il existe deux types de clé : une clé **rattachée** à",
        "une **organisation principale**, qui ne donne accès qu'aux usagers de cette",
        "organisation (isolation multi-tenant) ; ou une clé **plateforme** (liaison unique",
        "Socle↔Clara), sans organisation propre, dont le périmètre dépend de l'en-tête",
        "**`X-Organization-Id`** fourni à chaque appel — voir ce paramètre, réutilisé par tous",
        "les endpoints `/v1/*`.",
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
        "## Adresse, géocodage et quartier",
        "Quand l'adresse change (`address_line1`, `postal_code`, `city`) sans que",
        "`address_lat`/`address_lon` soient fournies, l'adresse est **géocodée côté serveur**",
        "(Base Adresse Nationale, best-effort : en cas d'échec les coordonnées sont nulles).",
        "Un consommateur qui géocode lui-même (ex. autocomplétion d'adresse) peut fournir",
        "directement les coordonnées. L'usager est ensuite **rattaché automatiquement** au",
        "quartier contenant ses coordonnées (`quartier_id`, catalogue exposé par",
        "`GET /v1/quartiers` de l'API référentiel). Fournir `quartier_id` force un rattachement",
        "**manuel** (protégé des recalculs, `quartier_auto: false`) ; fournir `quartier_id: null`",
        "rétablit l'assignation **automatique**.",
        "",
        "En lecture, la fiche porte aussi l'objet **`quartier`** (`id`, `name`, `color`) : le",
        "quartier déjà résolu, pour l'afficher sans second appel — `GET /v1/quartiers` sert à",
        "lister le catalogue ou récupérer les géométries, pas à traduire un identifiant.",
        "",
        "## Rapprochement d'identités (détection de doublons)",
        "`POST /v1/contacts/match` prend une **identité partielle** et renvoie les fiches",
        "existantes qui lui ressemblent, classées par pertinence — pour proposer une reprise",
        "de fiche plutôt qu'une re-création au moment de la saisie. **Lecture seule** malgré",
        "le POST (aucune fiche créée ni modifiée). Voir la description de l'endpoint pour",
        "les motifs (`reasons`) et le score.",
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
            X_ORGANIZATION_ID_PARAM,
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
              name: "phone",
              in: "query",
              required: false,
              description:
                "Numéro de téléphone, format libre (`+33 6 12 34 56 78`, `06.12.34.56.78`…) : " +
                "comparé sur les **chiffres significatifs** (indicatif France et 0 initial " +
                "retirés) au mobile **et** au fixe.",
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
              name: "quartier_id",
              in: "query",
              required: false,
              description:
                "Filtre sur le quartier de rattachement (UUID — voir `GET /v1/quartiers` de " +
                "l'API référentiel). La valeur littérale `null` renvoie les usagers **sans** quartier.",
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
            ...errorResponses("400", "401", "403", "404", "500"),
          },
        },
        post: {
          tags: ["Usagers"],
          summary: "Créer un usager",
          description:
            "Crée une fiche usager. `contact_type` gouverne les champs obligatoires : la " +
            "**civilité** pour une personne physique, la **raison sociale** pour une structure.",
          parameters: [X_ORGANIZATION_ID_PARAM],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ContactCreate" } } },
          },
          responses: {
            "201": CONTACT_RESPONSE,
            ...errorResponses("400", "401", "403", "404", "409", "500"),
          },
        },
      },
      "/v1/contacts/match": {
        post: {
          tags: ["Usagers"],
          summary: "Rapprocher une identité partielle (détection de doublons)",
          description: [
            "Renvoie les fiches existantes qui **ressemblent** à l'identité fournie, classées",
            "par score décroissant — à afficher à l'agent au moment de la saisie pour proposer",
            "une **reprise de fiche** plutôt qu'une re-création. **Lecture seule** malgré le",
            "POST : aucune fiche n'est créée ni modifiée.",
            "",
            "Tous les champs sont optionnels, mais **au moins un critère** est requis (email,",
            "phones, siret, last_name, usage_name, legal_name ou birth_date — un prénom seul",
            "ne rapproche rien). Par défaut, seules les fiches **actives** sont proposées",
            "(`status: null` pour inclure les archivées).",
            "",
            "### Motifs (`reasons`)",
            "- `email` : égalité exacte, insensible à la casse ;",
            "- `phone` : égalité sur les **chiffres significatifs** (indicatif France et 0",
            "  initial retirés), chaque numéro fourni comparé au mobile **et** au fixe ;",
            "- `siret` : égalité sur les chiffres seuls ;",
            "- `name_exact` : nom complet identique après normalisation (sans accents, sans",
            "  ponctuation, casse repliée) — noms de naissance **et** d'usage comparés des",
            "  deux côtés ;",
            "- `name_similar` : similarité trigram ≥ 0,5 sur le nom complet normalisé, avec",
            "  garde-fou sur le prénom (un homonyme de nom de famille seul — « Marie Dupont »",
            "  pour « Jean Dupont » — n'est **pas** proposé) ;",
            "- `birth_date` : jamais suffisant seul, renforce un autre motif.",
            "",
            "### Score (classement uniquement)",
            "`email` +100 · `phone` +80 · `siret` +120 · `name_exact` +60 · `name_similar`",
            "+arrondi(40 × similarité) · `birth_date` +20. Le barème peut évoluer : ne comparer",
            "les scores qu'au **sein d'une même réponse**, jamais à un seuil absolu.",
          ].join("\n"),
          parameters: [X_ORGANIZATION_ID_PARAM],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ContactMatchRequest" } },
            },
          },
          responses: {
            "200": {
              description: "Candidats au rapprochement, du plus probable au moins probable.",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/ContactMatch" } },
                },
              },
            },
            ...errorResponses("400", "401", "403", "404", "500"),
          },
        },
      },
      "/v1/contacts/{id}": {
        get: {
          tags: ["Usagers"],
          summary: "Consulter un usager",
          parameters: [ID_PARAM, X_ORGANIZATION_ID_PARAM],
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
          parameters: [ID_PARAM, X_ORGANIZATION_ID_PARAM],
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
          parameters: [ID_PARAM, X_ORGANIZATION_ID_PARAM],
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
          parameters: [ID_PARAM, X_ORGANIZATION_ID_PARAM],
          responses: {
            "200": CONTACT_RESPONSE,
            ...errorResponses("400", "401", "403", "404", "500"),
          },
        },
      },
      "/v1/contacts/{id}/consents": {
        post: {
          tags: ["Usagers"],
          summary: "Consigner un recueil de consentement RGPD",
          description:
            "Enregistre un ou deux consentements recueillis auprès de l'usager, avec **la phrase " +
            "exacte qui lui a été soumise** — c'est elle qui fait la preuve (art. 7.1 RGPD), pas le " +
            "booléen. L'état courant de la fiche (`consent_traitement`, `consent_partage`) en est " +
            "**dérivé** : il ne s'écrit pas directement, et seul le recueil le plus récent le fixe.\n\n" +
            "**Idempotent** par (`source_app`, `source_reference`) : rejouer le même dépôt met la " +
            "ligne à jour au lieu d'en créer une seconde. Un recueil sans `source_reference` est " +
            "un fait nouveau à chaque appel.\n\n" +
            "Le référentiel **n'exige pas** qu'un consentement soit accordé : cette règle appartient " +
            "au dépôt (Iris la tient), et un **retrait** de consentement doit pouvoir se consigner ici.",
          parameters: [ID_PARAM, X_ORGANIZATION_ID_PARAM],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ContactConsentsCreate" } } },
          },
          responses: {
            "201": CONTACT_RESPONSE,
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
          parameters: [X_ORGANIZATION_ID_PARAM],
          responses: {
            "200": {
              description: "Liste des rôles.",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/ContactRole" } },
                },
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
            "Clé API délivrée par un super administrateur Socle, portant le scope `contacts`. " +
            "Une clé PLATEFORME est rattachée à une application de la gamme et ne sert que les " +
            "collectivités ABONNÉES à cette application : `X-Organization-Id` hors abonnement " +
            "répond 404, comme une organisation inexistante.",
        },
      },
      parameters: {
        XOrganizationId: {
          name: "X-Organization-Id",
          in: "header",
          required: false,
          description:
            "Organisation visée (UUID), **requise uniquement pour une clé plateforme** " +
            "(`organization_id` NULL, liaison unique Socle↔Clara) : chaque appel doit alors " +
            "porter cet en-tête, faute de quoi la requête est rejetée en `400`. L'organisation " +
            "peut être une sous-organisation ; elle est automatiquement résolue vers son " +
            "**organisation principale**, qui borne le référentiel servi. Une organisation " +
            "inconnue renvoie `404`. Une clé **rattachée** à une organisation ignore cet " +
            "en-tête (son périmètre est déjà fixé).",
          schema: { type: "string", format: "uuid" },
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
            address_lat: {
              type: ["number", "null"],
              description: "Latitude WGS 84 de l'adresse (géocodage BAN ou fournie à l'écriture).",
            },
            address_lon: {
              type: ["number", "null"],
              description: "Longitude WGS 84 de l'adresse.",
            },
            quartier_id: {
              type: ["string", "null"],
              format: "uuid",
              description:
                "Quartier de rattachement (voir `GET /v1/quartiers` de l'API référentiel).",
            },
            quartier: {
              type: ["object", "null"],
              description:
                "Quartier **résolu** (nom + couleur), de quoi l'afficher sans résoudre " +
                "`quartier_id` contre `GET /v1/quartiers` — dont les réponses portent les " +
                "géométries. `null` si le contact n'est rattaché à aucun quartier.",
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                color: { type: ["string", "null"], description: "Couleur d'affichage (hex)." },
              },
              required: ["id", "name", "color"],
            },
            quartier_auto: {
              type: "boolean",
              description:
                "true = rattachement automatique d'après l'adresse ; false = forcé manuellement.",
            },
            preferred_channel: { type: ["string", "null"], enum: ["email", "telephone", "courrier", null] },
            consent_email: {
              type: "boolean",
              deprecated: true,
              description: "**Obsolète (2026-09-13)** — remplacé par `consent_traitement` / `consent_partage`.",
            },
            consent_sms: {
              type: "boolean",
              deprecated: true,
              description: "**Obsolète (2026-09-13)** — remplacé par `consent_traitement` / `consent_partage`.",
            },
            consent_traitement: {
              type: "boolean",
              description:
                "Consentement RGPD à l'utilisation des informations pour le traitement des demandes " +
                "(obligatoire au dépôt). Dérivé de `consents` — ne s'écrit pas directement.",
            },
            consent_traitement_at: { type: ["string", "null"], format: "date-time" },
            consent_partage: {
              type: "boolean",
              description:
                "Consentement RGPD au partage aux services de la collectivité (facultatif). " +
                "Dérivé de `consents` — ne s'écrit pas directement.",
            },
            consent_partage_at: { type: ["string", "null"], format: "date-time" },
            consents: {
              type: "array",
              items: { $ref: "#/components/schemas/ContactConsent" },
              description:
                "Historique des recueils, du plus récent au plus ancien (50 au plus). **Vide dans les " +
                "réponses de liste et de rapprochement** : la preuve ne se lit que sur la fiche.",
            },
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
        ContactConsent: {
          type: "object",
          description:
            "Un recueil de consentement — la preuve, pas seulement l'état. La phrase soumise est " +
            "conservée telle quelle : la collectivité peut être renommée ou le libellé reformulé, " +
            "ce qui a été accepté ne change pas.",
          properties: {
            id: { type: "string", format: "uuid" },
            kind: {
              type: "string",
              enum: ["traitement", "partage"],
              description:
                "`traitement` = utilisation des informations pour instruire la demande (obligatoire " +
                "au dépôt) ; `partage` = partage aux services de la collectivité (facultatif).",
            },
            granted: { type: "boolean" },
            statement: {
              type: "string",
              description: "Phrase exacte soumise à l'usager, nom de l'organisme déjà interpolé.",
            },
            source_app: { type: "string", description: "Application qui a recueilli (iris, nora, clara…)." },
            source_reference: {
              type: ["string", "null"],
              description: "Dépôt d'origine tel que l'application le désigne (UUID nu, référence de dossier).",
            },
            collected_at: { type: ["string", "null"], format: "date-time" },
            created_at: { type: ["string", "null"], format: "date-time" },
          },
        },
        ContactConsentsCreate: {
          type: "object",
          required: ["source_app", "consents"],
          properties: {
            source_app: {
              type: "string",
              maxLength: 60,
              description: "Application appelante (iris, nora, clara…). Code libre.",
            },
            source_reference: {
              type: ["string", "null"],
              maxLength: 200,
              description:
                "Dépôt d'origine. Porte l'**idempotence** avec `source_app` : le rejeu met à jour " +
                "au lieu de dupliquer. Absent = fait nouveau à chaque appel.",
            },
            collected_at: {
              type: "string",
              format: "date-time",
              description:
                "Date du recueil (défaut : maintenant). C'est elle qui fait foi : consigner après " +
                "coup un dépôt papier ancien n'écrase pas un consentement retiré depuis.",
            },
            consents: {
              type: "array",
              minItems: 1,
              maxItems: 2,
              items: {
                type: "object",
                required: ["kind", "granted", "statement"],
                properties: {
                  kind: { type: "string", enum: ["traitement", "partage"] },
                  granted: { type: "boolean" },
                  statement: {
                    type: "string",
                    maxLength: 2000,
                    description:
                      "**Requis** : la phrase telle que l'usager l'a lue. Le référentiel ne la compose " +
                      "pas — seule l'application qui a affiché la case sait sa langue, sa formulation " +
                      "et le nom d'organisme qu'elle a interpolé.",
                  },
                },
              },
            },
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
            address_lat: {
              type: ["number", "null"],
              description:
                "Latitude WGS 84 — à fournir avec `address_lon` si le consommateur géocode " +
                "lui-même ; sinon, omettre : l'adresse est géocodée côté serveur (BAN).",
            },
            address_lon: { type: ["number", "null"], description: "Longitude WGS 84." },
            quartier_id: {
              type: ["string", "null"],
              format: "uuid",
              description:
                "Rattachement **manuel** à un quartier (protégé des recalculs). Omettre pour " +
                "l'assignation automatique d'après l'adresse ; `null` rétablit l'automatique.",
            },
            preferred_channel: { type: ["string", "null"], enum: ["email", "telephone", "courrier", null] },
            consent_email: { type: "boolean", default: false, deprecated: true },
            consent_sms: { type: "boolean", default: false, deprecated: true },
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
            address_lat: {
              type: ["number", "null"],
              description:
                "Latitude WGS 84 — à fournir avec `address_lon` si le consommateur géocode " +
                "lui-même. Si l'adresse change sans coordonnées fournies, elle est re-géocodée " +
                "côté serveur (BAN).",
            },
            address_lon: { type: ["number", "null"], description: "Longitude WGS 84." },
            quartier_id: {
              type: ["string", "null"],
              format: "uuid",
              description:
                "Rattachement **manuel** à un quartier (protégé des recalculs). `null` rétablit " +
                "l'assignation automatique d'après l'adresse (recalcul immédiat).",
            },
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
        ContactMatchRequest: {
          type: "object",
          description:
            "Identité partielle à rapprocher. Tous les champs sont optionnels, mais au moins " +
            "un critère est requis (un prénom seul ne suffit pas).",
          properties: {
            contact_type: {
              type: ["string", "null"],
              enum: ["personne", "entreprise", "association", "administration", null],
              description: "Restreint les candidats à ce type, s'il est connu.",
            },
            first_name: { type: ["string", "null"] },
            last_name: { type: ["string", "null"], description: "Nom de naissance." },
            usage_name: { type: ["string", "null"], description: "Nom d'usage." },
            legal_name: { type: ["string", "null"], description: "Raison sociale." },
            siret: { type: ["string", "null"], description: "Comparé sur les chiffres seuls." },
            birth_date: {
              type: ["string", "null"],
              format: "date",
              description: "Renfort de score uniquement : jamais suffisante seule.",
            },
            email: { type: ["string", "null"] },
            phones: {
              type: "array",
              items: { type: "string" },
              maxItems: 10,
              description:
                "Numéros au format libre, normalisés côté serveur (chiffres significatifs).",
            },
            status: {
              type: ["string", "null"],
              enum: ["active", "archived", null],
              default: "active",
              description: "Défaut : `active` (les fiches archivées ne sont pas proposées). `null` = tous.",
            },
            exclude_ids: {
              type: "array",
              items: { type: "string", format: "uuid" },
              description: "Fiches à ignorer (ex. la fiche en cours d'édition).",
            },
            limit: { type: "integer", minimum: 1, maximum: 20, default: 5 },
          },
        },
        ContactMatch: {
          type: "object",
          description:
            "Candidat au rapprochement : la fiche complète (même sérialiseur que " +
            "`GET /v1/contacts`), le score de classement et les motifs.",
          required: ["contact", "score", "reasons"],
          properties: {
            contact: { $ref: "#/components/schemas/Contact" },
            score: {
              type: "integer",
              description: "Score de classement — à ne comparer qu'au sein d'une même réponse.",
            },
            reasons: {
              type: "array",
              items: {
                type: "string",
                enum: ["email", "phone", "siret", "name_exact", "name_similar", "birth_date"],
              },
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
