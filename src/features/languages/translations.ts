/**
 * Textes traduits d'une démarche ou d'une catégorie — colonne `translations`
 * (JSONB) de `procedures` et de `categories`. Schéma **possédé** (contrat public
 * consommé en aval), même parti que `formSchema.ts` ou `communication.ts` :
 * logique pure ici, parseur tolérant, et la forme exacte de ce qu'on écrit.
 *
 * Forme : `{ "<code de langue>": { "name": "…", "short_description": "…" } }`.
 * Un objet par langue plutôt qu'une chaîne, et c'est précisément ce qui a permis
 * au descriptif court de rejoindre le libellé le 2026-09-07 sans déplacer une
 * seule entrée existante. Les champs à venir (descriptif usager…) s'ajouteront
 * de la même façon.
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
 */
export const TRANSLATABLE_FIELDS = ["name", "short_description"] as const;

export type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number];

/** Ce qui est traduit pour une langue. Tout y est facultatif — voir l'en-tête. */
export type TranslatedEntry = Partial<Record<TranslatableField, string>>;

/** Traductions d'une ligne, indexées par code de langue. */
export type TranslationMap = Record<string, TranslatedEntry>;

/** Saisie de l'écran : par langue, une chaîne par champ (vide = pas de traduction). */
export type TranslationInput = Record<string, TranslatedEntry>;

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
 */
export function parseTranslations(value: unknown): TranslationMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: TranslationMap = {};
  for (const [rawCode, rawEntry] of Object.entries(value as Record<string, unknown>)) {
    const code = rawCode.trim().toLowerCase();
    if (!code || code === PIVOT_LANGUAGE) continue;
    const entry = readEntry(rawEntry);
    if (entry) out[code] = entry;
  }
  return out;
}

function readEntry(entry: unknown): TranslatedEntry | null {
  // Forme courte : la chaîne est le libellé, le champ historique.
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    return trimmed === "" ? null : { name: trimmed };
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const source = entry as Record<string, unknown>;
  const out: TranslatedEntry = {};
  for (const field of TRANSLATABLE_FIELDS) {
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
export function translationInput(translations: unknown): TranslationInput {
  const input: TranslationInput = {};
  for (const [code, entry] of Object.entries(parseTranslations(translations))) {
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
 */
export function translationsForWrite(
  existing: unknown,
  input: TranslationInput,
  enabled: readonly string[],
  fields: readonly TranslatableField[],
): TranslationMap {
  const out = parseTranslations(existing);
  for (const code of enabled) {
    if (code === PIVOT_LANGUAGE) continue;
    const entry: TranslatedEntry = { ...out[code] };
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

/** Codes portant au moins une traduction, dans l'ordre du catalogue. */
export function translatedLanguageCodes(translations: unknown): string[] {
  return sortLanguageCodes(Object.keys(parseTranslations(translations)));
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
  field: TranslatableField,
): string {
  const fallback = source ?? "";
  if (code === PIVOT_LANGUAGE) return fallback;
  const translated = parseTranslations(translations)[code]?.[field];
  return translated && translated.trim() !== "" ? translated : fallback;
}

/** Le libellé, cas le plus courant de `localizedField`. */
export function localizedName(name: string, translations: unknown, code: string): string {
  return localizedField(name, translations, code, "name");
}
