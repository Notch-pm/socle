/**
 * Document OpenAPI 3.1 de l'API IA Socle — servi tel quel à `GET /openapi.json`
 * et rendu par Redoc à la route in-app `/api-doc-ia`.
 *
 * **La documentation est un livrable de premier ordre** : c'est ici que les
 * équipes consommatrices lisent ce qui part chez le fournisseur, ce qui n'en
 * revient pas, et ce que le Socle ne conserve pas.
 */

const REF = {
  "400": "#/components/responses/BadRequest",
  "401": "#/components/responses/Unauthorized",
  "403": "#/components/responses/Forbidden",
  "404": "#/components/responses/NotFound",
  "429": "#/components/responses/QuotaExceeded",
  "500": "#/components/responses/InternalError",
  "502": "#/components/responses/ProviderUnavailable",
  "503": "#/components/responses/NotConfigured",
} as const;

type Code = keyof typeof REF;

function errorResponses(...codes: Code[]) {
  const map: Record<string, { $ref: string }> = {};
  for (const c of codes) map[c] = { $ref: REF[c] };
  return map;
}

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

export function buildOpenApiDocument(serverUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "API IA Socle — guichet du fournisseur LLM",
      version: "1.2.0",
      description: [
        "Le Socle détient la clé du fournisseur LLM et **compte ce qu'elle dépense** pour",
        "toute la gamme. Les applications (Iris, Clara…) n'appellent plus le fournisseur :",
        "elles appellent cette API, qui réserve, appelle, puis solde.",
        "",
        "## Ce que le Socle ne conserve pas",
        "**Le Socle ne conserve NI le prompt NI la réponse.** Le journal",
        "(`ai_usage_events`) enregistre des compteurs, des identifiants et des horodatages —",
        "aucun texte, et aucune de ses colonnes ne pourrait en accueillir. Le contenu transite",
        "en mémoire pendant l'appel, et rien d'autre. La limite, dite honnêtement : *le Socle",
        "voit le prompt ; il ne le garde pas.*",
        "",
        "## Un budget par collectivité",
        "Le plafond est **mensuel et par organisation principale**, tous produits confondus :",
        "Iris et Clara puisent au même seau. L'application consommatrice discrimine le",
        "**journal**, jamais le compteur ni le plafond — c'est ce qui permet de répondre à",
        "« combien me coûte cette collectivité ? » ET à « qui a dépensé ? ».",
        "Aucun plafond configuré ⇒ consommation illimitée (déploiement progressif).",
        "",
        "## Un garde-fou de cadence, distinct du plafond",
        "Un plafond mensuel dit *combien*, jamais *à quelle vitesse* : une boucle accidentelle",
        "consommerait le budget d'un mois en quelques minutes. Indépendamment du crédit, un",
        "appelant est donc freiné au-delà d'un certain rythme, **par agent (`actor_id`) et par",
        "NATURE d'appel** — un échange conversationnel suit une cadence humaine, un lot d'OCR",
        "une cadence machine :",
        "",
        "| Nature | Par agent | Sans agent identifié |",
        "|---|---|---|",
        "| Conversationnel (`/v1/completions`) | 20 / minute | 120 / minute |",
        "| Lot (`/v1/ocr`) | 60 / minute | 360 / minute |",
        "",
        "Les deux natures ont des compteurs **SÉPARÉS** : un lot de documents ne consomme pas",
        "le budget de questions du même agent. Le refus est",
        "un `429` de code `ai_rate_limited`, avec un en-tête `Retry-After` : **le crédit est",
        "intact**, seul le rythme est en cause. Le compteur retient les **tentatives**, refus",
        "de plafond compris — sans quoi une boucle déjà refusée continuerait de marteler.",
        "Le seuil n'est pas réglable : c'est un garde-fou, pas un paramètre commercial.",
        "",
        "## Authentification",
        "Clé API en `Authorization: Bearer <clé>`, **usage serveur-à-serveur uniquement**",
        "(jamais dans un navigateur). Elle doit porter le scope **`ai`** — le scope `read` du",
        "référentiel ne suffit pas — **et** être rattachée à une application",
        "(`api_keys.consumer`), sans quoi la dépense ne serait imputable à personne.",
        "Une clé **plateforme** (sans organisation) doit joindre l'en-tête",
        "`X-Organization-Id` ; la racine de l'organisation visée est celle qui est débitée.",
        "",
        "## Ce que l'appelant ne décide pas",
        "Le modèle et l'agent sont choisis par le Socle : le consommateur passe un **alias**",
        "(`agent`). Les outils, le streaming et les paramètres d'échantillonnage sont refusés.",
        "L'imputation vient de la clé, jamais du corps de la requête.",
      ].join("\n"),
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerApiKey: [] }],
    paths: {
      "/v1/completions": {
        post: {
          summary: "Appeler le modèle",
          description: [
            "Réserve les jetons estimés, appelle le fournisseur, puis solde avec la",
            "consommation réelle. **Un refus de plafond n'appelle jamais le fournisseur** ;",
            "**un appel en échec ne consomme rien** (la réservation est libérée).",
            "",
            "Le prompt système est composé par l'appelant : le Socle ne sait rien du métier",
            "de ses consommateurs et n'a pas à le savoir.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CompletionRequest" },
                example: {
                  feature: "assistant-instruction",
                  agent: "assistant-instruction",
                  system: "Tu es l'assistant d'instruction… (composé par l'appelant)",
                  messages: [{ role: "user", content: "Quelles pièces dois-je exiger ?" }],
                  max_output_tokens: 900,
                  estimated_tokens: 12345,
                  reference: { kind: "request", id: "3f6a…" },
                  actor_id: "9c21…",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Réponse du modèle, avec la consommation et l'état du plafond.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/CompletionResponse" } },
              },
            },
            ...errorResponses("400", "401", "403", "404", "429", "500", "502", "503"),
          },
        },
      },
      "/v1/ocr": {
        post: {
          summary: "Lire un document scanné",
          description: [
            "Extrait le texte d'un PDF scanné ou d'une image, **au même plafond et dans le même",
            "journal** que les complétions : une collectivité a un crédit, pas deux.",
            "",
            "⚠️ **Le document ne transite pas par le Socle.** L'appelant fournit une **URL signée",
            "et de courte durée** que le fournisseur va chercher lui-même. Émettez-la juste avant",
            "l'appel, avec la durée de vie la plus courte que votre stockage permette.",
            "",
            "⚠️ **Le plafond est en jetons, l'OCR se facture à la page.** La réservation part du",
            "`page_count_hint` ; le règlement retient le **texte réellement extrait**. Une page",
            "blanche ne coûte donc presque rien, et sous-déclarer les pages ne fait rien gagner.",
            "",
            "N'appelez cette route que pour ce qui l'exige : un PDF avec couche texte, un DOCX,",
            "un ODT ou un TXT s'extraient chez vous, sans IA et sans crédit.",
          ].join("\n"),
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OcrRequest" },
                example: {
                  feature: "analyse-courrier",
                  document: {
                    type: "document_url",
                    url: "https://…/storage/v1/object/sign/…?token=…",
                  },
                  page_count_hint: 3,
                  reference: { kind: "courier", id: "3f6a…" },
                  actor_id: "9c21…",
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Texte extrait, avec la consommation et l'état du plafond.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/OcrResponse" } } },
            },
            ...errorResponses("400", "401", "403", "404", "429", "500", "502", "503"),
          },
        },
      },
      "/v1/usage": {
        get: {
          summary: "Consommation de la collectivité",
          description:
            "Plafond, consommé, réservé et **ventilation par application** sur une période. Sert aux écrans d'administration des applications consommatrices.",
          parameters: [{
            name: "period",
            in: "query",
            required: false,
            schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" },
            description: "Période `YYYY-MM` (UTC). Par défaut, le mois en cours.",
          }],
          responses: {
            "200": {
              description: "État du plafond et ventilation.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Usage" } } },
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
            "Clé API Socle portant le scope `ai` et rattachée à une application du registre. " +
            "Une clé PLATEFORME ne débite que le crédit des collectivités ABONNÉES à son " +
            "application : `X-Organization-Id` hors abonnement répond 404.",
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
                code: { type: "string", examples: ["ai_quota_exceeded"] },
                message: { type: "string" },
              },
            },
          },
        },
        Message: {
          type: "object",
          required: ["role", "content"],
          properties: {
            role: {
              type: "string",
              enum: ["user", "assistant"],
              description: "`system` est **refusé** ici : utilisez le champ `system`.",
            },
            content: { type: "string", maxLength: 40000 },
          },
        },
        CompletionRequest: {
          type: "object",
          required: ["system", "messages"],
          additionalProperties: false,
          properties: {
            feature: {
              type: ["string", "null"],
              description: "Libellé déclaratif, pour le détail du journal. N'influe pas sur l'imputation.",
            },
            agent: {
              type: ["string", "null"],
              description: "**Alias** d'agent résolu par le Socle. Alias inconnu ⇒ modèle par défaut, jamais un refus.",
            },
            system: { type: "string", description: "Prompt système, composé par l'appelant." },
            messages: { type: "array", minItems: 1, maxItems: 24, items: { $ref: "#/components/schemas/Message" } },
            max_output_tokens: {
              type: "integer",
              description: "Borné par le Socle (2000 max, 900 par défaut). Jamais un motif de refus.",
            },
            estimated_tokens: {
              type: "integer",
              description: "**Indication** seulement : le Socle recalcule et retient le maximum des deux.",
            },
            response_format: {
              type: ["string", "null"],
              enum: ["json", null],
              description: [
                "`\"json\"` contraint la sortie à du JSON **syntaxiquement valide** — pour un appelant",
                "qui parse au lieu d'afficher. Alias du Socle : la forme du fournisseur n'est jamais nommée ici.",
                "",
                "⚠️ Le mot « json » doit figurer dans `system` ou dans un message (exigence du mode JSON",
                "du fournisseur) — décrivez-y la structure attendue. À défaut : **400**, avant toute dépense.",
                "",
                "⚠️ Le JSON rendu est **valide, pas conforme** : aucun schéma n'est imposé au modèle.",
                "Revalidez `answer` contre vos propres règles — c'est votre affaire, pas celle du Socle.",
              ].join("\n"),
            },
            reference: {
              type: ["object", "null"],
              description: "Référence OPAQUE vers l'objet de l'appelant (demande, courrier). Sans signification pour le Socle.",
              properties: { kind: { type: "string" }, id: { type: "string", format: "uuid" } },
            },
            actor_id: { type: ["string", "null"], format: "uuid", description: "Identifiant opaque de l'agent appelant." },
          },
        },
        CompletionResponse: {
          type: "object",
          properties: {
            answer: { type: "string" },
            provider: { type: "string", examples: ["mistral"] },
            event_id: { type: "string", format: "uuid" },
            usage: {
              type: "object",
              properties: {
                prompt_tokens: { type: ["integer", "null"] },
                completion_tokens: { type: ["integer", "null"] },
                total_tokens: { type: ["integer", "null"] },
                estimated: { type: "boolean", description: "Vrai si le fournisseur n'a pas rendu de décompte." },
              },
            },
            quota: { $ref: "#/components/schemas/QuotaState" },
          },
        },
        OcrRequest: {
          type: "object",
          required: ["document"],
          properties: {
            feature: {
              type: ["string", "null"],
              description: "Libellé déclaratif, pour le détail du journal. N'influe pas sur l'imputation.",
            },
            document: {
              type: "object",
              required: ["type", "url"],
              properties: {
                type: {
                  type: "string",
                  enum: ["document_url", "image_url"],
                  description: "`document_url` pour un PDF, `image_url` pour une image.",
                },
                url: {
                  type: "string",
                  format: "uri",
                  description: [
                    "URL **https** signée et courte. Refusés : tout autre schéma, les identifiants",
                    "dans le lien (`https://user:pass@…`), et au-delà de 4096 caractères.",
                  ].join(" "),
                },
              },
            },
            page_count_hint: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              description: [
                "**Indication** servant à réserver, jamais à facturer. 1 par défaut.",
                "Au-delà de 100 : **400 `payload_too_large`** — scindez le document.",
              ].join(" "),
            },
            reference: {
              type: ["object", "null"],
              description: "Référence OPAQUE vers l'objet de l'appelant. Sans signification pour le Socle.",
              properties: { kind: { type: "string" }, id: { type: "string", format: "uuid" } },
            },
            actor_id: { type: ["string", "null"], format: "uuid", description: "Identifiant opaque de l'agent appelant." },
          },
        },
        OcrResponse: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Markdown de toutes les pages, jointes par `\n\n---\n\n`. Vide si le document ne porte aucun texte — ce n'est pas une erreur.",
            },
            pages: {
              type: "array",
              items: {
                type: "object",
                properties: { index: { type: "integer" }, markdown: { type: "string" } },
              },
            },
            page_count: { type: "integer" },
            provider: { type: "string", examples: ["mistral"] },
            event_id: { type: "string", format: "uuid" },
            usage: {
              type: "object",
              properties: {
                pages_processed: { type: ["integer", "null"], description: "Pages facturées par le fournisseur, quand il le dit." },
                total_tokens: { type: "integer", description: "Jetons décomptés du plafond, dérivés du texte extrait." },
                estimated: { type: "boolean", description: "Toujours vrai : le fournisseur facture des pages, la conversion en jetons est celle du Socle." },
              },
            },
            quota: { $ref: "#/components/schemas/QuotaState" },
          },
        },
        QuotaState: {
          type: "object",
          properties: {
            unlimited: { type: "boolean" },
            limit: { type: ["integer", "null"] },
            used_tokens: { type: ["integer", "null"] },
            period: { type: "string", examples: ["2026-08"] },
            renews_at: { type: "string", format: "date", examples: ["2026-09-01"] },
          },
        },
        Usage: {
          type: "object",
          properties: {
            organization_id: { type: "string", format: "uuid" },
            period: { type: "string" },
            renews_at: { type: "string", format: "date" },
            unlimited: { type: "boolean" },
            limit: { type: ["integer", "null"] },
            used_tokens: { type: "integer" },
            reserved_tokens: { type: "integer" },
            remaining_tokens: { type: ["integer", "null"] },
            by_consumer: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  consumer: { type: "string", examples: ["iris"] },
                  feature: { type: ["string", "null"] },
                  calls: { type: "integer" },
                  tokens: { type: "integer" },
                },
              },
            },
          },
        },
      },
      responses: {
        BadRequest: errorResponse("Requête invalide : clé non autorisée, rôle refusé, paramètre du fournisseur, ou requête trop volumineuse."),
        Unauthorized: errorResponse("Clé API manquante, invalide, révoquée ou expirée."),
        Forbidden: errorResponse("Clé sans scope `ai`, ou non rattachée à une application consommatrice."),
        NotFound: errorResponse("Organisation ou endpoint introuvable."),
        QuotaExceeded: errorResponse(
          "**Deux refus partagent ce statut, et le `code` les distingue.** " +
            "`ai_quota_exceeded` : le plafond mensuel de la collectivité est atteint — le message nomme la date " +
            "de renouvellement, et il n'y a rien à réessayer avant. " +
            "`ai_rate_limited` : trop d'appels en peu de temps — le crédit est **intact**, l'en-tête `Retry-After` " +
            "donne les secondes à attendre. Dans les deux cas, **le fournisseur n'a pas été appelé** et rien n'a été consommé.",
        ),
        InternalError: errorResponse("Erreur interne du serveur."),
        ProviderUnavailable: errorResponse("Le fournisseur n'a pas répondu. Son erreur n'est jamais relayée. **Rien n'a été consommé.**"),
        NotConfigured: errorResponse("Aucune clé fournisseur n'est configurée sur cette plateforme."),
      },
    },
  };
}
