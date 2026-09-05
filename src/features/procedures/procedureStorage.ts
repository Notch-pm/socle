/**
 * Logique pure du stockage des documents de la base de connaissances des
 * démarches (bucket privé `procedure-documents`). Sans dépendance UI ni
 * Supabase (testée) : construction de chemin, validation format/taille.
 *
 * Convention de chemin (le RLS s'appuie dessus — le 1er segment est l'org
 * principale) : {organization_id}/{procedure_id}/{kind}/{uid}-{fichier}
 *
 * Les helpers génériques (extension, assainissement, formats) vivent dans
 * `@/lib/fileStorage`, partagés avec le bucket `document-templates` ; ils sont
 * réexportés ici pour que les appelants de cette feature n'aient rien à changer.
 */

import { sanitizeFileName, validateFile } from "@/lib/fileStorage";

export {
  fileExtension,
  sanitizeFileName,
  isFormatAllowed,
  acceptAttribute,
} from "@/lib/fileStorage";

/** Nom du bucket privé (partagé avec le client Supabase). */
export const PROCEDURE_DOCUMENTS_BUCKET = "procedure-documents";

/** Deux jeux de documents distincts, chacun dans son sous-dossier. */
export type DocumentKind = "agent" | "training";

/** Taille maximale d'un document, alignée sur `file_size_limit` du bucket (25 MiB). */
export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

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

/** Message d'erreur de validation d'un fichier, ou `null` s'il est accepté. */
export function validateDocumentFile(
  file: { name: string; size: number },
  formats: readonly string[],
): string | null {
  return validateFile(file, formats, MAX_DOCUMENT_SIZE_BYTES);
}
