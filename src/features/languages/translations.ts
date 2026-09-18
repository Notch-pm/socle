/**
 * Textes traduits d'une démarche ou d'une catégorie — colonne `translations`
 * (JSONB) de `procedures` et de `categories`. Schéma **possédé** (contrat public
 * consommé en aval), même parti que `formSchema.ts` ou `communication.ts` :
 * logique pure ici, parseur tolérant, et la forme exacte de ce qu'on écrit.
 *
 * Forme : `{ "<code de langue>": { "name": "…", "short_description": "…" } }`.
 * Un objet par langue plutôt qu'une chaîne, et c'est précisément ce qui a permis
 * au descriptif court de rejoindre le libellé le 2026-09-07, puis au descriptif
 * usager (`user_description`) de les rejoindre le 2026-09-18, sans déplacer une
 * seule entrée existante.
 *
 * ⚠️ CHAQUE CHAMP EST INDÉPENDANT. Une langue peut porter le libellé sans le
 * descriptif : c'est le cas normal, pas une anomalie. Le repli se fait
 * **champ par champ** sur la colonne française correspondante (`name`,
 * `short_description`), jamais sur une autre langue.
 *
 * Trois règles portent tout le reste :
 *
 *  • **le français ne s'y trouve jamais** — il est la langue pivot, celle des
 *    colonnes. L'écrire ici en ferait une seconde source de vérité, et rien ne
 *    dirait laquelle des deux fait foi le jour où elles divergent ;
 *  • **désactiver une langue n'efface pas ses traductions** (le réglage gouverne
 *    l'usage, pas la donnée — motif `email_sender_name`, `publicationPeriodEnabled`) :
 *    la réactiver rend le travail déjà fait, au lieu de le redemander ;
 *  • **une traduction vide n'est pas stockée** : c'est l'absence de traduction,
 *    et un consommateur qui lit `""` afficherait un texte vide là où il devait
 *    retomber sur le français.
 */
import { PIVOT_LANGUAGE, sortLanguageCodes } from "@/features/languages/languages";

/**
 * Les champs qu'on traduit — chacun est la version étrangère d'une colonne
 * française du même nom. En ajouter un ici ne suffit pas : il faut aussi que
 * l'écran le propose (`TranslationFields`) et que la fonction de traduction
 * automatique sache dans quel registre l'écrire (`translate-labels`).
 *
 * ⚠️ DEUX ÉCRANS ÉCRIVENT CETTE COLONNE : l'étape « Descriptif » (libellé,
 * descriptif court) et l'étape « Communication usager » (`user_description`,
 * en Markdown). Chacun ne gouverne que ses champs — c'est le dernier argument
 * de `translationsForWrite`, et c'est lui qui empêche l'un d'effacer le travail
 * fait dans l'autre.
 */
export const TRANSLATABLE_FIELDS = ["name", "short_description", "user_description"] as const;

export type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number];

/**
 * Les textes libres d'une section de page composée — l'autre jeu de champs
 * traduisibles, possédé par `src/features/portal/portalPage.ts`.
 *
 * ⚠️ `alt` est le texte alternatif d'une image, et il est ici pour la même
 * raison que les autres : c'est ce que lit une synthèse vocale. Le laisser en
 * français reviendrait à ne traduire la page que pour ceux qui la voient.
 *
 * ⚠️ IL VIT ICI, avec l'autre, parce que les trois règles de la maison (jamais
 * de clé `fr`, vide = absence, repli champ par champ) sont écrites **une seule
 * fois** dans ce module. Un second jeu de champs devait pouvoir s'en servir
 * sans les recopier — c'est ce qui les fait tenir ensemble.
 */
export const PORTAL_SECTION_FIELDS = ["title", "subtitle", "placeholder", "body", "alt"] as const;

export type PortalSectionField = (typeof PORTAL_SECTION_FIELDS)[number];

/**
 * Les textes d'une entrée de `procedures.user_communication` — le troisième jeu,
 * possédé par `src/features/procedures/userCommunication.ts` : la note sur le
 * public (`note`), une pièce annoncée (`label`, `description`), une question
 * de la FAQ usager (`question`, `answer`).
 *
 * ⚠️ Ces textes vivent dans un JSONB, pas dans des colonnes : ils ne peuvent
 * pas rejoindre `procedures.translations`. Leur traduction vit donc SUR
 * L'ENTRÉE, comme celle d'une section de page — elle voyage avec sa question
 * quand on la déplace ou la supprime, et une liste n'a rien à resynchroniser.
 * Les clés restent celles des champs français, comme partout.
 */
export const USER_COMMUNICATION_FIELDS = [
  "note",
  "label",
  "description",
  "question",
  "answer",
] as const;

export type UserCommunicationField = (typeof USER_COMMUNICATION_FIELDS)[number];

/**
 * N'importe quel champ traduisible, tous jeux confondus. C'est ce que
 * manipulent les pièces PARTAGÉES — le composant de saisie, l'appel au guichet
 * de traduction — qui n'ont pas à savoir de quelle table vient la ligne.
 */
export type AnyTranslatableField = TranslatableField | PortalSectionField | UserCommunicationField;

/**
 * Ce qui est traduit pour une langue. Tout y est facultatif — voir l'en-tête.
 * Le paramètre dit QUELS champs cette colonne peut porter : `name` et
 * `short_description` pour une démarche, les textes d'une section pour une page.
 */
export type TranslatedEntry<F extends string = TranslatableField> = Partial<Record<F, string>>;

/** Traductions d'une ligne, indexées par code de langue. */
export type TranslationMap<F extends string = TranslatableField> = Record<
  string,
  TranslatedEntry<F>
>;

/** Saisie de l'écran : par langue, une chaîne par champ (vide = pas de traduction). */
export type TranslationInput<F extends string = TranslatableField> = Record<
  string,
  TranslatedEntry<F>
>;

/**
 * Colonne `translations` (contenu inconnu) → traductions exploitables.
 *
 * Tolérant : ce qui n'est pas lisible est écarté **champ par champ**, le reste
 * est conservé — un descriptif traduit abîmé ne doit pas emporter le libellé de
 * la même langue, ni les autres langues. Deux formes sont acceptées,
 * `{"br": "Breizh"}` et `{"br": {"name": "Breizh"}}` : la première est ce
 * qu'écrirait naturellement un import extérieur, et la refuser n'apporterait
 * rien. Le français est écarté d'office (voir l'en-tête).
 *
 * ⚠️ Une langue dont **aucun** champ n'est lisible ne laisse pas d'entrée vide :
 * `{"en": {}}` se lirait comme « traduit en anglais » partout où l'on compte les
 * langues traduites (`TranslatedIn`), alors que rien ne l'est.
 *
 * `known` dit CE QUE LA COLONNE PEUT PORTER — les champs d'une démarche par
 * défaut, ceux d'une section de page quand on le précise. Tout le reste est
 * écarté : un `body` égaré dans les traductions d'une catégorie n'y a pas plus
 * sa place qu'une colonne inconnue.
 */
export function parseTranslations(value: unknown): TranslationMap;
export function parseTranslations<F extends string>(
  value: unknown,
  known: readonly F[],
): TranslationMap<F>;
export function parseTranslations(
  value: unknown,
  known: readonly string[] = TRANSLATABLE_FIELDS,
): TranslationMap<string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: TranslationMap<string> = {};
  for (const [rawCode, rawEntry] of Object.entries(value as Record<string, unknown>)) {
    const code = rawCode.trim().toLowerCase();
    if (!code || code === PIVOT_LANGUAGE) continue;
    const entry = readEntry(rawEntry, known);
    if (entry) out[code] = entry;
  }
  return out;
}

function readEntry(entry: unknown, known: readonly string[]): TranslatedEntry<string> | null {
  // Forme courte : la chaîne est le libellé, le champ historique. ⚠️ Elle n'a
  // de sens QUE là où `name` existe : une section de page n'en porte pas, et
  // lire sa chaîne comme un libellé y fabriquerait un champ que rien n'affiche.
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    return trimmed === "" || !known.includes("name") ? null : { name: trimmed };
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const source = entry as Record<string, unknown>;
  const out: TranslatedEntry<string> = {};
  for (const field of known) {
    const value = source[field];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed !== "") out[field] = trimmed;
  }
  return Object.keys(out).length === 0 ? null : out;
}

/**
 * Colonne `translations` → état du formulaire, **toutes langues confondues**.
 *
 * Volontairement indépendant des langues actives : celles-ci arrivent d'une
 * requête, et amorcer la saisie à leur arrivée écraserait ce que l'agent est en
 * train de taper. L'écran n'affiche que les langues actives (`TranslationFields`),
 * l'écriture ne touche qu'à elles (`translationsForWrite`) — le reste voyage
 * sans être vu.
 */
export function translationInput(translations: unknown): TranslationInput;
export function translationInput<F extends string>(
  translations: unknown,
  known: readonly F[],
): TranslationInput<F>;
export function translationInput(
  translations: unknown,
  known: readonly string[] = TRANSLATABLE_FIELDS,
): TranslationInput<string> {
  const input: TranslationInput<string> = {};
  for (const [code, entry] of Object.entries(parseTranslations(translations, known))) {
    input[code] = { ...entry };
  }
  return input;
}

/**
 * Saisie de l'écran → valeur à écrire, **fusionnée** avec ce qui est déjà en
 * base.
 *
 * ⚠️ On part de l'existant, et on ne touche qu'aux langues **actives** et aux
 * champs que l'écran **gouverne** (`fields`) : une traduction faite du temps où
 * une langue était activée survit à sa désactivation, et un champ qu'un écran
 * n'affiche pas n'est jamais effacé par cet écran. Écrire la seule saisie
 * visible effacerait ce travail sans que personne ne l'ait demandé — et le
 * geste de désactivation ne serait plus réversible.
 *
 * ⚠️ `known` N'EST PAS `fields`, et les confondre casse la garde ci-dessus :
 * `known` est ce que la colonne peut porter (elle est **relue en entier**),
 * `fields` ce que cet écran a le droit d'effacer. Une lecture amputée effacerait
 * précisément les champs que le quatrième paramètre existe pour protéger.
 */
export function translationsForWrite(
  existing: unknown,
  input: TranslationInput,
  enabled: readonly string[],
  fields: readonly TranslatableField[],
): TranslationMap;
export function translationsForWrite<F extends string>(
  existing: unknown,
  input: TranslationInput<F>,
  enabled: readonly string[],
  fields: readonly F[],
  known: readonly F[],
): TranslationMap<F>;
export function translationsForWrite(
  existing: unknown,
  input: TranslationInput<string>,
  enabled: readonly string[],
  fields: readonly string[],
  known: readonly string[] = TRANSLATABLE_FIELDS,
): TranslationMap<string> {
  const out = parseTranslations(existing, known);
  for (const code of enabled) {
    if (code === PIVOT_LANGUAGE) continue;
    const entry: TranslatedEntry<string> = { ...out[code] };
    for (const field of fields) {
      const value = (input[code]?.[field] ?? "").trim();
      if (value === "") delete entry[field];
      else entry[field] = value;
    }
    if (Object.keys(entry).length === 0) delete out[code];
    else out[code] = entry;
  }
  return out;
}

/**
 * Pose (ou efface) la traduction d'un texte **frappe par frappe**, quand l'état
 * de l'écran EST le JSON (section de page, entrée de `user_communication`).
 *
 * ⚠️ NE PASSE PAS PAR `translationsForWrite`, et c'est tout l'objet de cette
 * fonction : celui-là ÉLAGUE la valeur (`.trim()`), ce qui est juste au moment
 * d'enregistrer un formulaire — et faux à chaque frappe. Élaguer en cours de
 * saisie supprime l'espace au moment même où on le tape, et rend les espaces
 * impossibles (vu en vrai le 2026-09-07). La valeur est donc stockée telle
 * qu'elle est saisie ; `parseTranslations` élaguera à la lecture, comme partout.
 *
 * Les trois règles restent celles de la maison : jamais de clé `fr`, un texte
 * VIDE est une absence, et une langue sans aucun texte disparaît.
 */
export function setTranslation<F extends string>(
  translations: TranslationMap<F>,
  code: string,
  field: F,
  value: string,
): TranslationMap<F> {
  if (code === PIVOT_LANGUAGE) return translations;
  const out: TranslationMap<F> = { ...translations };
  const entry: TranslatedEntry<F> = { ...out[code] };
  if (value.trim() === "") delete entry[field];
  else entry[field] = value;
  if (Object.keys(entry).length === 0) delete out[code];
  else out[code] = entry;
  return out;
}

/**
 * Applique une réponse de traduction ENTIÈRE, en une fois — voir `onApply` de
 * `TranslationFields`.
 *
 * ⚠️ EN UNE FOIS, ET PAS CHAMP PAR CHAMP. Un parent qui possède un objet plus
 * gros repart de l'état de son rendu à chaque appel : trois écritures dans le
 * même tick n'en laisseraient qu'une — c'est ainsi que le titre et le
 * sous-titre d'une section se perdaient (vu en vrai le 2026-09-07).
 *
 * `known` écarte ce que l'entrée ne porte pas : une réponse ne pose jamais un
 * champ que l'écran n'affiche pas.
 */
export function applyTranslations<F extends string>(
  translations: TranslationMap<F>,
  patch: Record<string, Partial<Record<string, string>>>,
  known: readonly F[],
): TranslationMap<F> {
  let out = translations;
  for (const [code, entry] of Object.entries(patch)) {
    for (const [field, value] of Object.entries(entry)) {
      if (typeof value !== "string") continue;
      if (!(known as readonly string[]).includes(field)) continue;
      out = setTranslation(out, code, field as F, value);
    }
  }
  return out;
}

/** Codes portant au moins une traduction, dans l'ordre du catalogue. */
export function translatedLanguageCodes(
  translations: unknown,
  known: readonly string[] = TRANSLATABLE_FIELDS,
): string[] {
  return sortLanguageCodes(Object.keys(parseTranslations(translations, known)));
}

/**
 * Texte à afficher dans une langue donnée, **repli sur le français**. C'est la
 * règle que les consommateurs (portail en tête) doivent appliquer, champ par
 * champ : une traduction manquante n'est pas un trou, c'est le texte pivot.
 */
export function localizedField(
  source: string | null,
  translations: unknown,
  code: string,
  field: AnyTranslatableField,
): string {
  const fallback = source ?? "";
  if (code === PIVOT_LANGUAGE) return fallback;
  // On ne lit QUE le champ demandé : inutile de connaître le jeu auquel il
  // appartient pour rendre un texte.
  const translated = parseTranslations(translations, [field])[code]?.[field];
  return translated && translated.trim() !== "" ? translated : fallback;
}

/** Le libellé, cas le plus courant de `localizedField`. */
export function localizedName(name: string, translations: unknown, code: string): string {
  return localizedField(name, translations, code, "name");
}
