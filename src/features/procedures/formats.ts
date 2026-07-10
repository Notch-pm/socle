/**
 * Logique pure des formats de fichier acceptés par une pièce justificative.
 * Sans dépendance UI (testée). Un format est une extension normalisée, sans
 * point ni casse (ex. "pdf", "jpg").
 */

/** Formats courants proposés en accès rapide dans le sélecteur. */
export const COMMON_FORMATS = [
  "pdf",
  "jpg",
  "png",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "odt",
  "csv",
  "zip",
] as const;

/** Normalise une extension : minuscules, sans point de tête ni espaces. "" si vide. */
export function normalizeFormat(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\.+/, "").replace(/\s+/g, "");
}

/**
 * Ajoute un ou plusieurs formats (séparés par des virgules) à une liste, en
 * normalisant et en dédupliquant, tout en conservant l'ordre existant.
 */
export function addFormats(current: string[], raw: string): string[] {
  const result = [...current];
  for (const piece of raw.split(",")) {
    const format = normalizeFormat(piece);
    if (format && !result.includes(format)) result.push(format);
  }
  return result;
}
