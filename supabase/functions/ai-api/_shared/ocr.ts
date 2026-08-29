/**
 * Le contrat de `POST /v1/ocr` — validation de l'entrée, et conversion du coût
 * d'un OCR dans la monnaie du plafond.
 *
 * ⚠️ LE PLAFOND EST EN JETONS, L'OCR SE FACTURE À LA PAGE. Ce module est
 * l'endroit — le seul — où les deux se rencontrent. Le rapprochement est
 * assumé et documenté ici plutôt que dispersé : sans lui, il faudrait un
 * second plafond, en pages, et une collectivité aurait deux crédits à
 * surveiller pour une seule facture. Un chiffre approché dans une monnaie
 * unique vaut mieux que deux chiffres exacts dans deux monnaies.
 *
 * ⚠️ LE SOCLE NE REÇOIT PAS LE DOCUMENT, il reçoit une URL SIGNÉE que le
 * fournisseur ira chercher. C'est ce qui rend la promesse de passe-plat plus
 * forte ici que sur les complétions : l'octet du document ne traverse jamais
 * le Socle. En échange, l'URL est un DROIT D'ACCÈS temporaire — d'où les
 * refus ci-dessous, qui ne sont pas de la coquetterie de validation.
 *
 * Module PUR (aucune dépendance Deno), testé.
 */

import { isUuid } from "./validation.ts";

export type OcrDocumentType = "document_url" | "image_url";

export interface OcrRequest {
  feature: string | null;
  documentType: OcrDocumentType;
  url: string;
  /** Nombre de pages annoncé par l'appelant. Sert à RÉSERVER, pas à facturer. */
  pageHint: number;
  referenceKind: string | null;
  referenceId: string | null;
  actorId: string | null;
}

export type OcrParseResult =
  | { ok: true; value: OcrRequest }
  | { ok: false; code: "bad_request" | "payload_too_large"; message: string };

/**
 * Coût de réservation d'UNE page, en jetons. Volontairement HAUT : une page A4
 * dense de français administratif pèse 3 000 à 4 000 caractères, soit près de
 * 1 100 jetons au tarif maison (3,5 car./jeton). Réserver moins ferait passer
 * l'appel puis découvrir la dépense au règlement — c'est-à-dire dépasser le
 * plafond avant de s'en apercevoir, exactement ce que la porte existe pour
 * empêcher. Le règlement rend ensuite la différence sur les pages maigres.
 */
const TOKENS_PER_PAGE = 1200;

/** Plancher : même une image d'une ligne mobilise l'appel et son traitement. */
const MIN_RESERVATION = 600;

/**
 * Pages acceptées pour UN appel. Même raison d'être que `MAX_INPUT_TOKENS` sur
 * les complétions : le plafond MENSUEL ne borne pas le coût d'un appel unique,
 * et un consommateur emballé achèterait un rapport de 800 pages d'un geste.
 * Au-delà, l'appelant scinde — un document de plus de cent pages n'a de toute
 * façon aucune chance de tenir dans le prompt qui suivra.
 */
export const MAX_OCR_PAGES = 100;

/** Longueur d'URL au-delà de laquelle on n'a plus affaire à un lien signé. */
const MAX_URL_LENGTH = 4096;

/** Ce qu'on réserve AVANT l'appel, à partir du nombre de pages annoncé. */
export function reservationForOcr(pageHint: number): number {
  const pages = Number.isFinite(pageHint) && pageHint > 0 ? Math.ceil(pageHint) : 1;
  return Math.max(MIN_RESERVATION, pages * TOKENS_PER_PAGE);
}

/**
 * Ce qu'on SOLDE après l'appel : le texte réellement extrait, au tarif maison.
 *
 * ⚠️ C'est le texte qui fait foi, PAS le nombre de pages rendu par le
 * fournisseur — et la préférence est délibérée. Une page blanche scannée est
 * une page facturée chez lui et zéro jeton de valeur pour la collectivité ;
 * facturer les pages ferait payer le vide. Le plancher évite le symétrique :
 * un appel qui n'extrait rien a tout de même eu lieu.
 */
export function tokensForOcrText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3.5));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(
  message: string,
  code: "bad_request" | "payload_too_large" = "bad_request",
): OcrParseResult {
  return { ok: false, code, message };
}

/**
 * L'URL remise au fournisseur.
 *
 * ⚠️ TROIS REFUS, TROIS RAISONS DISTINCTES :
 *  • `https` seul — une URL signée voyage avec son jeton dans la query string ;
 *    en clair, ce jeton est lisible par tout intermédiaire.
 *  • pas d'identifiants dans l'URL (`https://user:pass@…`) — ce serait remettre
 *    un mot de passe au fournisseur, là où un lien signé et court suffit.
 *  • une longueur bornée — au-delà, ce n'est plus un lien mais une charge utile
 *    déguisée (un document encodé dans une `data:` maquillée, par exemple).
 */
function validateUrl(raw: unknown): { ok: true; url: string } | { ok: false; message: string } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, message: "« document.url » : lien du document attendu." };
  }
  const url = raw.trim();
  if (url.length > MAX_URL_LENGTH) {
    return { ok: false, message: "« document.url » : lien trop long pour être un lien signé." };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (_) {
    return { ok: false, message: "« document.url » : URL absolue attendue." };
  }
  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      message: "« document.url » : seul « https » est accepté — un lien signé voyage avec son jeton.",
    };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return {
      ok: false,
      message: "« document.url » : pas d'identifiants dans le lien — utilisez une URL signée.",
    };
  }
  return { ok: true, url };
}

/**
 * ⚠️ CE QUE L'APPELANT NE PEUT PAS DÉCIDER, ici comme sur les complétions :
 * `model` (le Socle reste l'autorité sur le coût), `consumer` et
 * `organization_id` (dérivés de la clé), et `include_image_base64` — celui-là
 * parce qu'il ferait transiter les illustrations du document par le Socle,
 * quand on a promis de ne faire passer que du texte.
 */
const ALLOWED_KEYS = new Set([
  "feature", "document", "page_count_hint", "reference", "actor_id",
]);

const PROVIDER_KEYS: Record<string, string> = {
  model: "Le modèle d'OCR est choisi par le Socle.",
  consumer: "L'imputation vient de la clé API, jamais du corps de la requête.",
  organization_id: "L'organisation vient de la clé API ou de l'en-tête X-Organization-Id.",
  include_image_base64:
    "Non accepté : les illustrations du document ne transitent pas par le Socle, seul le texte.",
};

export function parseOcrPayload(raw: unknown): OcrParseResult {
  if (!isRecord(raw)) return fail("Corps JSON attendu.");

  for (const [key, why] of Object.entries(PROVIDER_KEYS)) {
    if (key in raw) return fail(why);
  }
  const unknown = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknown.length > 0) {
    return fail(`Clés non autorisées : ${unknown.join(", ")}.`);
  }

  if (!isRecord(raw.document)) {
    return fail("« document » : objet { type, url } attendu.");
  }
  const type = raw.document.type;
  if (type !== "document_url" && type !== "image_url") {
    return fail('« document.type » : « document_url » ou « image_url » attendu.');
  }
  const url = validateUrl(raw.document.url);
  if (!url.ok) return fail(url.message);

  // Le nombre de pages est une INDICATION de l'appelant, exactement comme
  // `estimated_tokens` sur les complétions : il sert à réserver, jamais à
  // facturer. Sous-déclarer ne fait donc rien gagner — le règlement corrige
  // sur le texte réellement extrait.
  let pageHint = 1;
  if (raw.page_count_hint !== undefined && raw.page_count_hint !== null) {
    if (typeof raw.page_count_hint !== "number" || !Number.isFinite(raw.page_count_hint) ||
        raw.page_count_hint < 1) {
      return fail("« page_count_hint » : entier positif attendu.");
    }
    pageHint = Math.ceil(raw.page_count_hint);
    if (pageHint > MAX_OCR_PAGES) {
      return fail(
        `Document trop volumineux pour un seul appel (${pageHint} pages annoncées, ` +
          `maximum ${MAX_OCR_PAGES}) — scindez-le.`,
        "payload_too_large",
      );
    }
  }

  let referenceKind: string | null = null;
  let referenceId: string | null = null;
  if (raw.reference !== undefined && raw.reference !== null) {
    if (!isRecord(raw.reference)) return fail("« reference » : objet { kind, id } attendu.");
    referenceKind = (typeof raw.reference.kind === "string" ? raw.reference.kind : "").trim() || null;
    const id = raw.reference.id;
    if (id !== undefined && id !== null) {
      if (!isUuid(id)) return fail("« reference.id » : UUID attendu.");
      referenceId = id;
    }
  }

  const actorId = raw.actor_id;
  if (actorId !== undefined && actorId !== null && !isUuid(actorId)) {
    return fail("« actor_id » : UUID attendu.");
  }

  return {
    ok: true,
    value: {
      feature: (typeof raw.feature === "string" ? raw.feature : "").trim() || null,
      documentType: type,
      url: url.url,
      pageHint,
      referenceKind,
      referenceId,
      actorId: isUuid(actorId) ? actorId : null,
    },
  };
}
