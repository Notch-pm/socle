/**
 * Logique pure du stockage des documents de la base de connaissances des
 * démarches (bucket privé `procedure-documents`). Sans dépendance UI ni
 * Supabase (testée) : construction de chemin, validation format/taille.
 *
 * Convention de chemin (le RLS s'appuie dessus — le 1er segment est l'org
 * principale) : {organization_id}/{procedure_id}/{kind}/{uid}-{fichier}
 */

/** Nom du bucket privé (partagé avec le client Supabase). */
export const PROCEDURE_DOCUMENTS_BUCKET = "procedure-documents";

/** Deux jeux de documents distincts, chacun dans son sous-dossier. */
export type DocumentKind = "agent" | "training";

/** Taille maximale d'un document, alignée sur `file_size_limit` du bucket (25 MiB). */
export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

/** Extension normalisée d'un nom de fichier (minuscule, sans point). "" si absente. */
export function fileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
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
  const base = (fileName.split(/[\\/]/).pop() ?? fileName).trim();
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 100);
  return cleaned || "fichier";
}

/**
 * Chemin d'un document dans le bucket. `uid` est un identifiant unique fourni
 * par l'appelant (évite les collisions et rend la fonction pure/déterministe).
 */
export function buildDocumentPath(args: {
  organizationId: string;
  procedureId: string;
  kind: DocumentKind;
  uid: string;
  fileName: string;
}): string {
  const { organizationId, procedureId, kind, uid, fileName } = args;
  return `${organizationId}/${procedureId}/${kind}/${uid}-${sanitizeFileName(fileName)}`;
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

/** Message d'erreur de validation d'un fichier, ou `null` s'il est accepté. */
export function validateDocumentFile(
  file: { name: string; size: number },
  formats: readonly string[],
): string | null {
  if (!isFormatAllowed(file.name, formats)) {
    const ext = fileExtension(file.name);
    return `Format non accepté${ext ? ` (.${ext})` : ""} : ${formats.map((f) => f.toUpperCase()).join(", ")}.`;
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return `Fichier trop volumineux (max ${Math.round(MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024))} Mo).`;
  }
  return null;
}
