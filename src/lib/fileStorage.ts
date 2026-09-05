/**
 * Helpers purs de stockage de fichiers, partagés par les buckets privés du
 * Socle (`procedure-documents`, `document-templates`). Sans dépendance UI ni
 * Supabase, donc testés : extension, assainissement de nom, formats, taille.
 *
 * Chaque bucket garde sa propre convention de chemin et sa propre borne de
 * taille — c'est ce qui les distingue ; le reste est commun.
 */

/** Extension normalisée d'un nom de fichier (minuscule, sans point). "" si absente. */
export function fileExtension(fileName: string): string {
  const base = fileName.split(/[\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Assainit un nom de fichier pour l'utiliser dans un chemin de stockage :
 * conserve lettres/chiffres/`.`/`-`/`_`, remplace le reste par `-`, borne la
 * longueur. Garde une valeur non vide (repli `fichier`).
 */
export function sanitizeFileName(fileName: string): string {
  const base = (fileName.split(/[\/]/).pop() ?? fileName).trim();
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 100);
  return cleaned || "fichier";
}

/** Le format du fichier fait-il partie des formats acceptés ? (liste vide = tout accepté) */
export function isFormatAllowed(fileName: string, formats: readonly string[]): boolean {
  if (formats.length === 0) return true;
  const ext = fileExtension(fileName);
  return ext !== "" && formats.some((f) => f.toLowerCase() === ext);
}

/** Attribut HTML `accept` (".pdf,.png,…") à partir d'une liste de formats. */
export function acceptAttribute(formats: readonly string[]): string | undefined {
  if (formats.length === 0) return undefined;
  return formats.map((f) => "." + f.replace(/^\.+/, "")).join(",");
}

/**
 * Message d'erreur de validation d'un fichier, ou `null` s'il est accepté.
 * `maxBytes` est propre au bucket visé : chacun a son `file_size_limit`.
 */
export function validateFile(
  file: { name: string; size: number },
  formats: readonly string[],
  maxBytes: number,
): string | null {
  if (!isFormatAllowed(file.name, formats)) {
    const ext = fileExtension(file.name);
    return `Format non accepté${ext ? ` (.${ext})` : ""} : ${formats.map((f) => f.toUpperCase()).join(", ")}.`;
  }
  if (file.size > maxBytes) {
    return `Fichier trop volumineux (max ${Math.round(maxBytes / (1024 * 1024))} Mo).`;
  }
  return null;
}
