/**
 * Transforme une saisie CSV de mots-clés en tableau normalisé :
 * découpe sur les virgules, retire les espaces superflus, ignore les entrées
 * vides et dédoublonne (en conservant l'ordre de première apparition).
 */
export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const kw = part.trim();
    if (kw) seen.add(kw);
  }
  return [...seen];
}
