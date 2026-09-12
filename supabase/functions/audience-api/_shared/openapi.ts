/**
 * Document OpenAPI 3.1 d'`audience-api` — servi tel quel à `GET /openapi.json`.
 *
 * **La documentation est un livrable de premier ordre**, et ici plus qu'ailleurs :
 * c'est le seul endroit où une équipe qui branche la mesure lit ce qui est
 * compté, ce qui ne l'est pas, et pourquoi aucun consentement n'est demandé.
 * Le dire dans la migration ne suffit pas — personne d'autre que nous ne la lit.
 */

import { DEVICES, PAGES } from "./validation.ts";

const REF = {
  "400": "#/components/responses/BadRequest",
  "401": "#/components/responses/Unauthorized",
  "403": "#/components/responses/Forbidden",
  "404": "#/components/responses/NotFound",
  "500": "#/components/responses/InternalError",
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

const ACCEPTED = {
  description:
    "Pris en compte. `recorded: false` quand la démarche n'appartient pas à la collectivité " +
    "du `tenant_id` : ce n'est pas une erreur de l'appelant, et un compteur ne fait jamais " +
    "échouer une page.",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { recorded: { type: "boolean" } },
        required: ["recorded"],
      },
    },
  },
} as const;

export function buildOpenApiDocument(serverUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "API Audience Socle — fréquentation du site de démarches",
      version: "1.0.0",
      description: [
        "Le portail usagers (**Nora**) n'a pas de base de données : c'est le Socle, qui détient",
        "déjà le domaine, le catalogue et la page publiée, qui compte la fréquentation. Cette",
        "API **incrémente des compteurs**, et rien d'autre. Elle ne lit rien : les écrans de la",
        "collectivité lisent par RPC, avec le compte de l'agent.",
        "",
        "## Ce qui est stocké, et pourquoi il n'y a pas de consentement à demander",
        "Les tables de cette API ne portent **aucun identifiant** : pas de visiteur, pas de",
        "session, pas d'adresse IP même hachée, pas de User-Agent, pas de référent. Un jour, une",
        "page, un nombre. Ce que l'appelant transmet est déjà réduit : `entry` est un **oui/non**",
        "(le navigateur a décidé), `device` est **l'une de trois valeurs** (dérivée du User-Agent",
        "par l'appelant, qui le jette), `lang` est la langue **servie**.",
        "Aucune donnée personnelle n'est donc collectée, rien n'est écrit sur le poste du",
        "visiteur, et l'article 82 de la loi Informatique et Libertés ne s'applique pas.",
        "",
        "⚠️ **Cette API n'est pas un endroit où l'on ajoute une dimension par confort.** Toute",
        "clé inconnue dans le corps est un `400` : c'est ce qui rend la promesse ci-dessus",
        "vérifiable de l'extérieur.",
        "",
        "## Une visite = une arrivée sur le site",
        "Pas un visiteur unique — il n'y a pas d'identifiant pour en faire. Une **visite** est la",
        "première page affichée d'une navigation : le référent n'est pas le site lui-même, et ce",
        "n'est pas un rechargement. **C'est l'appelant qui tranche**, dans le navigateur, et qui",
        "pose `entry: true`. Une **page vue** est chaque écran affiché ; changer de langue sur",
        "la même page n'en est pas une.",
        "",
        "## Authentification",
        "Clé API en `Authorization: Bearer <clé>`, **usage serveur-à-serveur uniquement** — elle",
        "ne doit jamais atteindre un navigateur, sans quoi n'importe qui fabriquerait des",
        "chiffres. Elle doit porter le scope **`audience`** ; les scopes `read`, `contacts`,",
        "`smtp` et `ai` ne suffisent pas.",
        "Le `tenant_id` doit appartenir au périmètre de la clé : sous-arbre de sa racine pour une",
        "clé liée, collectivités **abonnées à son application** pour une clé plateforme. Hors",
        "périmètre ⇒ **404**, comme partout dans la gamme : on ne renseigne pas sur l'existence",
        "des collectivités.",
        "",
        "## Le jour est celui du serveur",
        "Les compteurs sont datés en **heure de Paris**, par le Socle. L'appelant ne transmet",
        "aucune date : une horloge de navigateur décalée ferait atterrir des vues dans un futur",
        "qu'aucune période n'affiche.",
      ].join("\n"),
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerApiKey: [] }],
    paths: {
      "/v1/page-views": {
        post: {
          summary: "Compter une page vue",
          description: [
            "Incrémente la page, et — quand ils sont fournis — la langue servie et la classe",
            "d'appareil. `entry: true` compte en plus une **visite**.",
            "",
            "`procedure_id` est requis si et seulement si `page` n'est pas `accueil`.",
          ].join("\n"),
          tags: ["Mesure"],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/PageView" } },
            },
          },
          responses: { "202": ACCEPTED, ...errorResponses("400", "401", "403", "404", "500") },
        },
      },
      "/v1/deposits": {
        post: {
          summary: "Compter une demande déposée",
          description: [
            "Incrémente les dépôts sur la ligne `formulaire` de la démarche — la page d'où le",
            "dépôt part. C'est ce qui permet de lire un taux (dépôts rapportés aux formulaires",
            "ouverts) sans rien rapprocher à la main.",
            "",
            "À appeler **après** que la demande a été acceptée en aval : un dépôt compté puis",
            "refusé gonflerait un taux de conversion sans qu'aucune demande n'existe.",
          ].join("\n"),
          tags: ["Mesure"],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Deposit" } },
            },
          },
          responses: { "202": ACCEPTED, ...errorResponses("400", "401", "403", "404", "500") },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerApiKey: {
          type: "http",
          scheme: "bearer",
          description: "Clé API du Socle portant le scope `audience`.",
        },
      },
      schemas: {
        PageView: {
          type: "object",
          required: ["tenant_id", "page"],
          additionalProperties: false,
          properties: {
            tenant_id: {
              type: "string",
              format: "uuid",
              description:
                "L'organisme DU DOMAINE visité — pas forcément une racine : une sous-organisation peut tenir son guichet.",
            },
            page: { type: "string", enum: [...PAGES] },
            procedure_id: {
              type: ["string", "null"],
              format: "uuid",
              description: "Requis si et seulement si `page` n'est pas `accueil`.",
            },
            entry: {
              type: "boolean",
              default: false,
              description:
                "Vrai si cette page est l'ARRIVÉE sur le site (première page d'une navigation).",
            },
            lang: {
              type: ["string", "null"],
              description:
                "Langue effectivement SERVIE (code BCP 47), pas celle demandée. Facultative : son absence ampute une ventilation, jamais la vue de page.",
            },
            device: {
              type: ["string", "null"],
              enum: [...DEVICES, null],
              description:
                "Classe d'appareil, dérivée du User-Agent par l'appelant, qui ne le transmet jamais.",
            },
          },
        },
        Deposit: {
          type: "object",
          required: ["tenant_id", "procedure_id"],
          additionalProperties: false,
          properties: {
            tenant_id: { type: "string", format: "uuid" },
            procedure_id: { type: "string", format: "uuid" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: { code: { type: "string" }, message: { type: "string" } },
              required: ["code", "message"],
            },
          },
          required: ["error"],
        },
      },
      responses: {
        BadRequest: errorResponse("Corps invalide, ou clé inconnue dans le corps."),
        Unauthorized: errorResponse("Clé API manquante, invalide, révoquée ou expirée."),
        Forbidden: errorResponse("La clé ne porte pas le scope « audience »."),
        NotFound: errorResponse(
          "Endpoint inconnu, ou collectivité hors du périmètre de la clé (on ne dit pas laquelle).",
        ),
        InternalError: errorResponse("Erreur interne du serveur."),
      },
    },
    tags: [
      {
        name: "Mesure",
        description:
          "Compteurs de fréquentation du site de démarches. Écriture seule — la lecture se fait dans le Socle, par le compte de l'agent.",
      },
    ],
  };
}
