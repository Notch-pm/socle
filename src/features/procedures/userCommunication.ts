/**
 * Étape « Communication usager » : ce qu'une collectivité écrit POUR SES USAGERS
 * à propos d'une démarche. Logique pure (aucune dépendance React/Supabase),
 * consommée par `UserCommunicationStep` et persistée dans
 * `procedures.user_communication`. Schéma « possédé » — contrat consommé en aval
 * (portail usagers Nora, Iris, Clara).
 *
 * ⚠️ INVARIANT : tout ce que porte cette colonne est PUBLIC. C'est ce qui autorise
 * `public-api` à la servir TELLE QUELLE sur le détail portail, sans whitelist clé
 * par clé — comme `form_schema` et `requester_config`. Un réglage qui aide à
 * INSTRUIRE n'entre pas ici : il va dans `knowledge_base` (agent et IA) ou dans
 * `communication_config` (diffusion, documents de l'agent) — ni l'un ni l'autre
 * ne traverse vers le portail.
 *
 * ⚠️ LE DESCRIPTIF N'EST PAS DANS CE FICHIER : c'est la colonne
 * `procedures.user_description` (texte Markdown), qui existait déjà et qui est
 * déjà publiée (liste ET détail). L'écran l'édite au même endroit et l'enregistre
 * dans la même mutation, mais il ne faut surtout pas la recopier ici : ce serait
 * deux sources de vérité pour un même texte, et rien ne dirait laquelle fait foi
 * le jour où elles divergent.
 *
 * Le JSON est organisé en **blocs** (`delays`, `audience`, `attachments`, `faq`) :
 * les réglages à venir de l'étape s'ajoutent comme clés voisines, sans déplacer
 * l'existant — même parti que `communication.ts`.
 *
 * **Traductions** (2026-09-18) : chaque texte se traduit dans les langues de la
 * collectivité, et la traduction vit SUR L'ENTRÉE (`translations` de la note,
 * de chaque pièce, de chaque question) — motif des sections de page du portail.
 * Ces textes vivent dans un JSONB, pas dans des colonnes : ils ne pouvaient pas
 * rejoindre `procedures.translations`, et une couche par langue au niveau du
 * bloc aurait dû se resynchroniser à chaque question déplacée ou supprimée.
 * Même forme (`{ "<code>": { "<champ français>": "…" } }`) et mêmes trois règles
 * que partout — elles sont écrites une seule fois, dans
 * `src/features/languages/translations.ts`. ⚠️ Le descriptif, lui, est une
 * colonne : sa traduction est dans `procedures.translations.<code>.user_description`.
 */

import {
  parseTranslations,
  type TranslationMap,
  type UserCommunicationField,
} from "@/features/languages/translations";

// ---- Délais ----------------------------------------------------------------

/** Unité de la durée d'instruction. */
export type ProcessingTimeUnit = "jour_ouvre" | "jour" | "semaine" | "mois";

/**
 * Unités proposées à la saisie, dans l'ordre du sélecteur.
 *
 * ⚠️ Durée **structurée** plutôt que texte libre, et c'est délibéré : un portail
 * multilingue rend « 3 semaines » dans sa propre langue à partir de
 * `{ 3, "semaine" }`. Une phrase aurait demandé une entrée de `translations` par
 * langue activée — et l'unité aurait cessé d'être exploitable par une machine.
 */
export const PROCESSING_TIME_UNITS: { value: ProcessingTimeUnit; label: string }[] = [
  { value: "jour_ouvre", label: "jours ouvrés" },
  { value: "jour", label: "jours calendaires" },
  { value: "semaine", label: "semaines" },
  { value: "mois", label: "mois" },
];

/** Au-delà, ce n'est plus un délai : c'est une faute de frappe. */
export const MAX_PROCESSING_TIME = 999;

/** Unité retenue au doute — la plus neutre des quatre. */
const DEFAULT_UNIT: ProcessingTimeUnit = "jour";

/**
 * Bloc « Délais » : combien de temps la collectivité met à RÉPONDRE.
 *
 * ⚠️ TROISIÈME DURÉE DU MODÈLE, à ne confondre ni avec
 * `procedures.input_duration_minutes` (durée de SAISIE du formulaire, en minutes,
 * étape « Descriptif ») ni avec la période de publication de
 * `communication_config`. Aucune des trois ne se déduit d'une autre.
 */
export interface DelaysConfig {
  /**
   * Durée habituelle d'instruction : entier de 1 à `MAX_PROCESSING_TIME`,
   * `null` = non renseignée.
   * ⚠️ `0` n'est pas un délai : il est relu comme `null`. Un consommateur qui
   * afficherait « 0 jour » annoncerait une réponse immédiate.
   */
  processingTimeValue: number | null;
  /**
   * Unité de `processingTimeValue`, **toujours dans la donnée, jamais déduite du
   * nombre** : « 30 » ne dit pas si ce sont trente jours ou trente jours ouvrés.
   */
  processingTimeUnit: ProcessingTimeUnit;
}

// ---- Public concerné -------------------------------------------------------

/**
 * Bloc « Public concerné » : une PRÉCISION, pas une règle.
 *
 * ⚠️ LES PUBLICS ADMIS NE SONT PAS ICI. Ils se règlent à l'étape « Informations
 * demandeur » (`requester_config`) et sont publiés en `PortalProcedure.audiences`
 * — c'est sur eux que le portail filtre (« Je suis… »). Cette note est une phrase
 * que l'usager lit ; elle ne retire la démarche d'aucun public. En cas de
 * contradiction, `audiences` fait foi.
 */
export interface AudienceNoticeConfig {
  /** Ex. « Réservée aux personnes résidant sur la commune. » Souvent vide. */
  note: string;
  /** La note dans les autres langues de la collectivité. */
  translations: TranslationMap<AudienceTranslatableField>;
}

/** Le texte traduisible de la note — et le seul que sa traduction porte. */
export const AUDIENCE_TRANSLATABLE_FIELDS = [
  "note",
] as const satisfies readonly UserCommunicationField[];
export type AudienceTranslatableField = (typeof AUDIENCE_TRANSLATABLE_FIELDS)[number];

// ---- Pièces demandées ------------------------------------------------------

/** Une pièce ANNONCÉE à l'usager : intitulé, plus une précision facultative. */
export interface RequiredPiece {
  /** Ex. « Justificatif de domicile ». */
  label: string;
  /** Ex. « De moins de trois mois ». Facultatif. */
  description: string;
  /** L'intitulé et la précision dans les autres langues — la traduction voyage avec la pièce. */
  translations: TranslationMap<PieceTranslatableField>;
}

export const PIECE_TRANSLATABLE_FIELDS = [
  "label",
  "description",
] as const satisfies readonly UserCommunicationField[];
export type PieceTranslatableField = (typeof PIECE_TRANSLATABLE_FIELDS)[number];

/**
 * Bloc « Pièces demandées » : ce que la collectivité ANNONCE à l'usager.
 *
 * ⚠️ CE N'EST PAS LE SCHÉMA DE DÉPÔT. Les pièces que l'usager **téléverse** sont
 * les champs `attachment` de `form_schema` — typés (`documentTypeId`, catalogue
 * `document_types`), obligatoires ou non, parfois conditionnels —, et
 * `form_schema` est servi sur le même détail portail. Cette liste-ci est un texte
 * d'annonce : elle peut recouper le formulaire (l'annonce et la collecte ne se
 * rédigent pas de la même façon) et porter des pièces qui ne se déposent pas en
 * ligne, comme un original à présenter au guichet. ⚠️ En aval, ne pas
 * **concaténer** les deux : la même pièce s'afficherait deux fois. Cette liste
 * habille la page de présentation, `form_schema` construit le formulaire.
 */
export interface AttachmentsNoticeConfig {
  /** Pièces annoncées, dans l'ordre choisi. Entrées entièrement vides écartées. */
  items: RequiredPiece[];
}

// ---- FAQ -------------------------------------------------------------------

/**
 * Une question d'usager et sa réponse.
 *
 * ⚠️ SECONDE FAQ DU MODÈLE, et c'est assumé : `knowledge_base.faq` a la même
 * forme mais un autre destinataire (l'agent et son assistant LLM), et il lui est
 * **interdit** de traverser vers le portail (test anti-fuite de
 * `public-api/_shared/serializers.test.ts`). Elle ne pouvait donc pas servir.
 * Les deux ne se fusionnent jamais, ni à l'écran ni en aval.
 */
export interface UserFaqItem {
  question: string;
  answer: string;
  /** La question et sa réponse dans les autres langues — la traduction voyage avec la question. */
  translations: TranslationMap<FaqTranslatableField>;
}

export const FAQ_TRANSLATABLE_FIELDS = [
  "question",
  "answer",
] as const satisfies readonly UserCommunicationField[];
export type FaqTranslatableField = (typeof FAQ_TRANSLATABLE_FIELDS)[number];

export interface FaqConfig {
  items: UserFaqItem[];
}

// ---- Racine ----------------------------------------------------------------

export interface UserCommunication {
  delays: DelaysConfig;
  audience: AudienceNoticeConfig;
  attachments: AttachmentsNoticeConfig;
  faq: FaqConfig;
}

/**
 * Paramètres par défaut : TOUT EST VIDE.
 *
 * ⚠️ À l'inverse du bloc `visibility` de `communication_config`, dont les défauts
 * sont ACTIFS : là, une colonne NULL devait se lire « publiée », sous peine de
 * dépublier tout un catalogue d'un coup. Ici, une colonne NULL veut dire « la
 * collectivité n'a rien écrit », et il n'y a rien à afficher. Lui inventer un
 * délai ou une FAQ publierait en son nom ce qu'elle n'a pas dit.
 */
export function defaultUserCommunication(): UserCommunication {
  return {
    delays: { processingTimeValue: null, processingTimeUnit: DEFAULT_UNIT },
    audience: { note: "", translations: {} },
    attachments: { items: [] },
    faq: { items: [] },
  };
}

/** Une pièce vierge — ce qu'ajoute le bouton « Ajouter une pièce ». */
export function emptyRequiredPiece(): RequiredPiece {
  return { label: "", description: "", translations: {} };
}

/** Une question vierge — ce qu'ajoute le bouton « Ajouter une question ». */
export function emptyUserFaqItem(): UserFaqItem {
  return { question: "", answer: "", translations: {} };
}

/** Chaîne telle quelle : ce qui n'en est pas une devient la chaîne vide. */
function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Entier de 1 à `MAX_PROCESSING_TIME`, `null` sinon. ⚠️ Une chaîne n'est pas
 * acceptée, même numérique : le contrat annonce un entier, et `"3"` relu comme
 * `3` ici mais refusé ailleurs ferait diverger le Socle de ses consommateurs.
 */
function coerceCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 1 || value > MAX_PROCESSING_TIME) return null;
  return value;
}

/** Unité connue, sinon `jour` — au doute, la plus neutre. */
function coerceUnit(value: unknown): ProcessingTimeUnit {
  return PROCESSING_TIME_UNITS.some((u) => u.value === value)
    ? (value as ProcessingTimeUnit)
    : DEFAULT_UNIT;
}

/**
 * Liste de pièces annoncées. ⚠️ Une entrée **à moitié** remplie est conservée :
 * c'est une saisie en cours, et la faire disparaître entre deux rendus serait
 * incompréhensible. C'est `requiredPiecesError` qui refuse l'enregistrement.
 *
 * ⚠️ Une entrée dont le FRANÇAIS est vide est écartée même si elle porte des
 * traductions : une traduction sans texte pivot n'aurait rien sur quoi se
 * replier, et l'écran n'aurait plus de ligne où la montrer.
 */
function parsePieces(raw: unknown): RequiredPiece[] {
  if (!Array.isArray(raw)) return [];
  const pieces: RequiredPiece[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { label, description, translations } = item as Record<string, unknown>;
    const piece: RequiredPiece = {
      label: coerceString(label),
      description: coerceString(description),
      translations: parseTranslations(translations, PIECE_TRANSLATABLE_FIELDS),
    };
    // On ignore les entrées entièrement vides (lignes ébauchées puis abandonnées).
    if (piece.label.trim() || piece.description.trim()) pieces.push(piece);
  }
  return pieces;
}

/** Même règle que `parsePieces` : la ligne à moitié écrite survit, la vide non. */
function parseFaqItems(raw: unknown): UserFaqItem[] {
  if (!Array.isArray(raw)) return [];
  const items: UserFaqItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { question, answer, translations } = item as Record<string, unknown>;
    const entry: UserFaqItem = {
      question: coerceString(question),
      answer: coerceString(answer),
      translations: parseTranslations(translations, FAQ_TRANSLATABLE_FIELDS),
    };
    if (entry.question.trim() || entry.answer.trim()) items.push(entry);
  }
  return items;
}

/**
 * Fusionne des paramètres stockés (JSON arbitraire de la base) avec les valeurs
 * par défaut : ignore l'inconnu, corrige les types, complète les manquants,
 * **bloc par bloc**. Toujours une structure complète en sortie — un bloc abîmé
 * revient au défaut sans emporter ses voisins.
 */
export function parseUserCommunication(raw: unknown): UserCommunication {
  const config = defaultUserCommunication();
  if (!raw || typeof raw !== "object") return config;

  const root = raw as Record<string, unknown>;

  const storedDelays = root.delays;
  if (storedDelays && typeof storedDelays === "object") {
    const delays = storedDelays as Record<string, unknown>;
    config.delays = {
      processingTimeValue: coerceCount(delays.processingTimeValue),
      processingTimeUnit: coerceUnit(delays.processingTimeUnit),
    };
  }

  const storedAudience = root.audience;
  if (storedAudience && typeof storedAudience === "object") {
    const audience = storedAudience as Record<string, unknown>;
    config.audience = {
      note: coerceString(audience.note),
      translations: parseTranslations(audience.translations, AUDIENCE_TRANSLATABLE_FIELDS),
    };
  }

  const storedAttachments = root.attachments;
  if (storedAttachments && typeof storedAttachments === "object") {
    const attachments = storedAttachments as Record<string, unknown>;
    config.attachments = { items: parsePieces(attachments.items) };
  }

  const storedFaq = root.faq;
  if (storedFaq && typeof storedFaq === "object") {
    const faq = storedFaq as Record<string, unknown>;
    config.faq = { items: parseFaqItems(faq.items) };
  }

  return config;
}

/** Normalise des paramètres en mémoire avant persistance (mêmes règles qu'à la lecture). */
export function cleanUserCommunication(config: UserCommunication): UserCommunication {
  return parseUserCommunication(config);
}

/**
 * Message d'erreur du délai d'instruction, `null` s'il est publiable. Une valeur
 * hors bornes ne serait pas un délai : on la refuse à la saisie plutôt que de la
 * laisser filer en aval, où elle s'afficherait telle quelle.
 */
export function processingTimeError(delays: DelaysConfig): string | null {
  const { processingTimeValue } = delays;
  if (processingTimeValue === null) return null;
  if (!Number.isInteger(processingTimeValue) || processingTimeValue < 1) {
    return "La durée d'instruction doit être un nombre entier d'au moins 1.";
  }
  return processingTimeValue > MAX_PROCESSING_TIME
    ? `La durée d'instruction ne peut pas dépasser ${MAX_PROCESSING_TIME}.`
    : null;
}

/**
 * Message d'erreur des pièces annoncées, `null` si elles sont publiables. Une
 * précision sans intitulé s'afficherait comme une puce orpheline sur le site de
 * démarches. ⚠️ Le PARSEUR, lui, reste tolérant : une saisie en cours ne doit pas
 * disparaître entre deux rendus.
 */
export function requiredPiecesError(
  items: readonly Pick<RequiredPiece, "label" | "description">[],
): string | null {
  return items.some((p) => !p.label.trim())
    ? "Chaque pièce demandée doit avoir un intitulé."
    : null;
}

/**
 * Message d'erreur de la FAQ usager, `null` si elle est publiable. Une question
 * sans réponse s'afficherait telle quelle sur le site de démarches : mieux vaut
 * refuser la ligne que publier une question restée en l'air.
 */
export function userFaqError(
  items: readonly Pick<UserFaqItem, "question" | "answer">[],
): string | null {
  if (items.some((i) => i.question.trim() && !i.answer.trim())) {
    return "Chaque question doit avoir une réponse.";
  }
  return items.some((i) => !i.question.trim())
    ? "Chaque réponse doit être rattachée à une question."
    : null;
}

/** Libellé français d'une unité, accordé sur la valeur. */
export function processingTimeUnitLabel(unit: ProcessingTimeUnit, value: number): string {
  const plural = value > 1;
  switch (unit) {
    case "jour_ouvre":
      return plural ? "jours ouvrés" : "jour ouvré";
    case "semaine":
      return plural ? "semaines" : "semaine";
    case "mois":
      return "mois";
    default:
      return plural ? "jours" : "jour";
  }
}

/** Libellé complet d'un délai (« 3 semaines »), `null` s'il n'est pas renseigné. */
export function processingTimeLabel(delays: DelaysConfig): string | null {
  const { processingTimeValue, processingTimeUnit } = delays;
  if (processingTimeValue === null) return null;
  return `${processingTimeValue} ${processingTimeUnitLabel(processingTimeUnit, processingTimeValue)}`;
}
