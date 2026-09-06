/**
 * Libellés traduits d'une démarche ou d'une catégorie — colonne `translations`
 * (JSONB) de `procedures` et de `categories`. Schéma **possédé** (contrat public
 * consommé en aval), même parti que `formSchema.ts` ou `communication.ts` :
 * logique pure ici, parseur tolérant, et la forme exacte de ce qu'on écrit.
 *
 * Forme : `{ "<code de langue>": { "name": "…" } }`. Un objet par langue plutôt
 * qu'une chaîne : les réglages qui viendront (descriptif court traduit, par
 * exemple) s'ajouteront en clés voisines, sans déplacer ce qui existe.
 *
 * Trois règles portent tout le reste :
 *
 *  • **le français ne s'y trouve jamais** — il est la langue pivot, celle de la
 *    colonne `name`. L'écrire ici en ferait une seconde source de vérité, et
 *    rien ne dirait laquelle des deux fait foi le jour où elles divergent ;
 *  • **désactiver une langue n'efface pas ses traductions** (le réglage gouverne
 *    l'usage, pas la donnée — motif `email_sender_name`, `publicationPeriodEnabled`) :
 *    la réactiver rend le travail déjà fait, au lieu de le redemander ;
 *  • **une traduction vide n'est pas stockée** : c'est l'absence de traduction,
 *    et un consommateur qui lit `""` afficherait un libellé vide là où il devait
 *    retomber sur le français.
 */
import { PIVOT_LANGUAGE, sortLanguageCodes } from "@/features/languages/languages";

/** Ce qui est traduit pour une langue. Une seule entrée pour l'instant. */
export interface TranslatedLabel {
  name: string;
}

/** Traductions d'une ligne, indexées par code de langue. */
export type TranslationMap = Record<string, TranslatedLabel>;

/** Saisie de l'écran : une chaîne par langue (vide = pas de traduction). */
export type TranslationInput = Record<string, string>;

/**
 * Colonne `translations` (contenu inconnu) → traductions exploitables.
 *
 * Tolérant : ce qui n'est pas lisible est écarté **entrée par entrée**, le reste
 * est conservé — un libellé traduit abîmé ne doit pas emporter les autres. Deux
 * formes sont acceptées, `{"br": "Breizh"}` et `{"br": {"name": "Breizh"}}` : la
 * première est ce qu'écrirait naturellement un import extérieur, et la refuser
 * n'apporterait rien. Le français est écarté d'office (voir l'en-tête).
 */
export function parseTranslations(value: unknown): TranslationMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: TranslationMap = {};
  for (const [rawCode, rawEntry] of Object.entries(value as Record<string, unknown>)) {
    const code = rawCode.trim().toLowerCase();
    if (!code || code === PIVOT_LANGUAGE) continue;
    const name = readName(rawEntry);
    if (name === null) continue;
    out[code] = { name };
  }
  return out;
}

function readName(entry: unknown): string | null {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const name = (entry as Record<string, unknown>).name;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed === "" ? null : trimmed;
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
    input[code] = entry.name;
  }
  return input;
}

/**
 * Saisie de l'écran → valeur à écrire, **fusionnée** avec ce qui est déjà en
 * base.
 *
 * ⚠️ On part de l'existant, et on ne touche qu'aux langues **actives** : une
 * traduction faite du temps où une langue était activée survit à sa
 * désactivation. Écrire la seule saisie de l'écran effacerait ce travail sans
 * que personne ne l'ait demandé — et le geste de désactivation ne serait plus
 * réversible.
 */
export function translationsForWrite(
  existing: unknown,
  input: TranslationInput,
  enabled: readonly string[],
): TranslationMap {
  const out = parseTranslations(existing);
  for (const code of enabled) {
    if (code === PIVOT_LANGUAGE) continue;
    const name = (input[code] ?? "").trim();
    if (name === "") {
      delete out[code];
    } else {
      out[code] = { name };
    }
  }
  return out;
}

/** Codes réellement traduits, dans l'ordre du catalogue. */
export function translatedLanguageCodes(translations: unknown): string[] {
  return sortLanguageCodes(Object.keys(parseTranslations(translations)));
}

/**
 * Libellé à afficher dans une langue donnée, **repli sur le français**. C'est la
 * règle que les consommateurs (portail en tête) doivent appliquer : une
 * traduction manquante n'est pas un trou, c'est le libellé pivot.
 */
export function localizedName(name: string, translations: unknown, code: string): string {
  if (code === PIVOT_LANGUAGE) return name;
  const translated = parseTranslations(translations)[code]?.name;
  return translated && translated.trim() !== "" ? translated : name;
}
