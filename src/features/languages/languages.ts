/**
 * Catalogue des langues activables par une **organisation principale**
 * (`organizations.enabled_languages`), et logique pure qui l'entoure.
 *
 * Le catalogue est **figé dans le code**, comme `documentVariables.ts` : c'est
 * un **contrat de nommage** consommé en aval (le portail usagers en fait son
 * sélecteur de langue, et les clés de `translations` sont ces codes), pas une
 * donnée de client. Ajouter une langue = une ligne ici ; la base, elle, ne
 * valide que la **forme** des codes — elle n'a pas à connaître la liste.
 *
 * Les codes sont des **BCP 47** : ISO 639-1 quand il existe (`br`, `oc`…),
 * ISO 639-3 sinon (`gsw`, `frp`, `gcr`…). ⚠️ Quelques langues de France n'ont
 * **aucun code ISO** — gallo, poitevin-saintongeais, francique lorrain,
 * champenois, bourguignon-morvandiau, franc-comtois, lorrain roman : elles ne
 * sont donc pas au catalogue. Les ajouter demandera de **choisir une
 * convention** (`fr-x-gallo`, usage privé BCP 47) — décision de nommage public,
 * pas détail d'implémentation. La langue des signes française n'y est pas non
 * plus : elle n'a pas de forme écrite à saisir dans un champ texte.
 *
 * Le **français est la langue pivot** : c'est lui que porte la colonne `name`
 * d'une démarche ou d'une catégorie. Il est donc toujours actif, ne se retire
 * pas, et n'a **jamais** d'entrée dans `translations` (voir `translations.ts`).
 */

export type LanguageGroup = "monde" | "france";

export interface LanguageDef {
  /** Code BCP 47 — ISO 639-1 s'il existe, ISO 639-3 sinon. */
  code: string;
  /** Libellé français, tel qu'affiché dans l'écran de paramétrage. */
  label: string;
  group: LanguageGroup;
}

/** Langue de saisie du référentiel : ce que portent les colonnes `name`. */
export const PIVOT_LANGUAGE = "fr";

/**
 * Forme acceptée pour un code — miroir du CHECK
 * `organizations_enabled_languages_check` en base (fonction
 * `is_valid_language_set`). Volontairement plus large que le catalogue : un code
 * inconnu de cette version du code n'est pas une erreur, il s'affiche tel quel
 * (voir `languageLabel`).
 */
export const LANGUAGE_CODE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

/**
 * Langues mondiales — les grandes langues de communication, plus celles que les
 * collectivités rencontrent le plus souvent à leur guichet.
 */
export const WORLD_LANGUAGES: readonly LanguageDef[] = [
  { code: "fr", label: "Français", group: "monde" },
  { code: "en", label: "Anglais", group: "monde" },
  { code: "es", label: "Espagnol", group: "monde" },
  { code: "de", label: "Allemand", group: "monde" },
  { code: "it", label: "Italien", group: "monde" },
  { code: "pt", label: "Portugais", group: "monde" },
  { code: "nl", label: "Néerlandais", group: "monde" },
  { code: "pl", label: "Polonais", group: "monde" },
  { code: "ro", label: "Roumain", group: "monde" },
  { code: "hu", label: "Hongrois", group: "monde" },
  { code: "bg", label: "Bulgare", group: "monde" },
  { code: "hr", label: "Croate", group: "monde" },
  { code: "sr", label: "Serbe", group: "monde" },
  { code: "sq", label: "Albanais", group: "monde" },
  { code: "el", label: "Grec", group: "monde" },
  { code: "ru", label: "Russe", group: "monde" },
  { code: "uk", label: "Ukrainien", group: "monde" },
  { code: "hy", label: "Arménien", group: "monde" },
  { code: "ka", label: "Géorgien", group: "monde" },
  { code: "tr", label: "Turc", group: "monde" },
  { code: "ar", label: "Arabe", group: "monde" },
  { code: "he", label: "Hébreu", group: "monde" },
  { code: "fa", label: "Persan", group: "monde" },
  { code: "ku", label: "Kurde", group: "monde" },
  { code: "ps", label: "Pachto", group: "monde" },
  { code: "ur", label: "Ourdou", group: "monde" },
  { code: "hi", label: "Hindi", group: "monde" },
  { code: "bn", label: "Bengali", group: "monde" },
  { code: "ta", label: "Tamoul", group: "monde" },
  { code: "zh", label: "Chinois (mandarin)", group: "monde" },
  { code: "ja", label: "Japonais", group: "monde" },
  { code: "ko", label: "Coréen", group: "monde" },
  { code: "vi", label: "Vietnamien", group: "monde" },
  { code: "th", label: "Thaï", group: "monde" },
  { code: "id", label: "Indonésien", group: "monde" },
  { code: "sw", label: "Swahili", group: "monde" },
  { code: "so", label: "Somali", group: "monde" },
  { code: "am", label: "Amharique", group: "monde" },
  { code: "wo", label: "Wolof", group: "monde" },
  { code: "bm", label: "Bambara", group: "monde" },
  { code: "ht", label: "Créole haïtien", group: "monde" },
] as const;

/**
 * Langues régionales de France — métropole et outre-mer, dans l'esprit de la
 * liste des « langues de France » (DGLFLF), limitée à celles qui portent un code
 * ISO (voir l'avertissement en tête de fichier).
 */
export const FRANCE_LANGUAGES: readonly LanguageDef[] = [
  { code: "gsw", label: "Alsacien", group: "france" },
  { code: "eu", label: "Basque", group: "france" },
  { code: "br", label: "Breton", group: "france" },
  { code: "ca", label: "Catalan", group: "france" },
  { code: "co", label: "Corse", group: "france" },
  { code: "oc", label: "Occitan", group: "france" },
  { code: "frp", label: "Francoprovençal (arpitan)", group: "france" },
  { code: "vls", label: "Flamand occidental", group: "france" },
  { code: "pcd", label: "Picard (ch'ti)", group: "france" },
  { code: "nrf", label: "Normand", group: "france" },
  { code: "wa", label: "Wallon", group: "france" },
  { code: "gcf", label: "Créole guadeloupéen et martiniquais", group: "france" },
  { code: "gcr", label: "Créole guyanais", group: "france" },
  { code: "rcf", label: "Créole réunionnais", group: "france" },
  { code: "swb", label: "Shimaoré (Mayotte)", group: "france" },
  { code: "buc", label: "Kibushi (Mayotte)", group: "france" },
  { code: "ty", label: "Tahitien", group: "france" },
  { code: "mrq", label: "Marquisien", group: "france" },
  { code: "wls", label: "Wallisien", group: "france" },
  { code: "fud", label: "Futunien", group: "france" },
  { code: "dhv", label: "Drehu (Lifou)", group: "france" },
  { code: "nen", label: "Nengone (Maré)", group: "france" },
  { code: "pri", label: "Paicî", group: "france" },
  { code: "aji", label: "Ajië", group: "france" },
] as const;

export const LANGUAGES: readonly LanguageDef[] = [...WORLD_LANGUAGES, ...FRANCE_LANGUAGES];

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

export function languageByCode(code: string): LanguageDef | undefined {
  return BY_CODE.get(code);
}

/**
 * Libellé français d'un code, ou **le code lui-même** s'il est inconnu. Un code
 * posé en base (par SQL, ou par une version plus récente du catalogue) doit
 * rester lisible à l'écran plutôt que disparaître silencieusement.
 */
export function languageLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code;
}

/** Classement par libellé français (é = e, casse ignorée). */
const collator = new Intl.Collator("fr", { sensitivity: "base" });

/** Les langues d'un groupe, dans l'ordre alphabétique de leur libellé. */
export function sortedLanguages(group: LanguageGroup): LanguageDef[] {
  return LANGUAGES.filter((language) => language.group === group).sort((a, b) =>
    collator.compare(a.label, b.label),
  );
}

/** Rang d'un code au catalogue, pour un ordre d'écriture stable. */
const RANK = new Map(LANGUAGES.map((language, index) => [language.code, index]));

/** Français d'abord, puis l'ordre du catalogue, puis les codes inconnus. */
export function sortLanguageCodes(codes: readonly string[]): string[] {
  return [...codes].sort((a, b) => {
    if (a === b) return 0;
    if (a === PIVOT_LANGUAGE) return -1;
    if (b === PIVOT_LANGUAGE) return 1;
    const rankA = RANK.get(a);
    const rankB = RANK.get(b);
    if (rankA === undefined && rankB === undefined) return 0;
    if (rankA === undefined) return 1;
    if (rankB === undefined) return -1;
    return rankA - rankB;
  });
}

/**
 * Colonne `enabled_languages` (contenu inconnu : la base ne valide que la
 * forme) → liste exploitable. Parseur **tolérant**, comme les autres schémas
 * possédés : ce qui n'est pas une chaîne bien formée est écarté, le reste est
 * conservé — y compris un code hors catalogue. Le français est toujours là et
 * toujours en tête, quoi qu'en dise la donnée : c'est la langue des colonnes
 * `name`, une organisation ne peut pas ne pas l'avoir.
 */
export function parseEnabledLanguages(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>([PIVOT_LANGUAGE]);
  const out: string[] = [PIVOT_LANGUAGE];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const code = item.trim().toLowerCase();
    if (!LANGUAGE_CODE_RE.test(code) || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return sortLanguageCodes(out);
}

/**
 * Sélection de l'écran → valeur à écrire. Même règle qu'à la lecture (français
 * en tête, dédoublonnage, ordre du catalogue) : deux enregistrements de la même
 * sélection produisent le **même tableau**, sans quoi un diff en aval
 * signalerait une modification qui n'a pas eu lieu.
 */
export function enabledLanguagesForWrite(codes: Iterable<string>): string[] {
  return parseEnabledLanguages([...codes]);
}

/**
 * Les langues **à traduire** : les langues actives moins le français, qui est
 * déjà saisi dans le champ `name`. C'est exactement la liste des champs de
 * traduction affichés par les écrans de paramétrage.
 */
export function translatableLanguages(enabled: readonly string[]): string[] {
  return enabled.filter((code) => code !== PIVOT_LANGUAGE);
}
