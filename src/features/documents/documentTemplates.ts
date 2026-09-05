/**
 * Logique pure du catalogue de documents (`document_templates`) : les trois
 * qualifications, les formats acceptés, la convention de chemin du bucket privé
 * `document-templates` et la validation d'un fichier. Sans dépendance UI ni
 * Supabase (testée).
 *
 * Convention de chemin (le RLS s'appuie dessus — le 1er segment est l'org
 * principale) : {organization_id}/{uid}-{fichier}. Pas de segment de document :
 * le fichier est déposé avant que la ligne existe, le `uid` suffit à écarter
 * les collisions.
 */

import { sanitizeFileName, validateFile } from "@/lib/fileStorage";

/** Nom du bucket privé (partagé avec le client Supabase). */
export const DOCUMENT_TEMPLATES_BUCKET = "document-templates";

/** Qualification d'un document — même mot que `procedures.type`, plus `courrier`. */
export const DOCUMENT_TEMPLATE_TYPES = ["interne", "externe", "courrier"] as const;

export type DocumentTemplateType = (typeof DOCUMENT_TEMPLATE_TYPES)[number];

const TYPE_LABELS: Record<DocumentTemplateType, string> = {
  interne: "Interne",
  externe: "Externe",
  courrier: "Courrier",
};

/**
 * Libellé affichable d'une qualification. Une valeur inattendue (colonne lue
 * telle quelle depuis la base) est rendue brute plutôt que masquée.
 */
export function documentTemplateTypeLabel(type: string): string {
  return TYPE_LABELS[type as DocumentTemplateType] ?? type;
}

/** Formats bureautiques acceptés — les seuls porteurs de variables fusionnables. */
export const DOCUMENT_TEMPLATE_FORMATS = ["doc", "docx", "odt"] as const;

/** Taille maximale, alignée sur `file_size_limit` du bucket (25 MiB). */
export const MAX_TEMPLATE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Chemin d'un document dans le bucket. `uid` est fourni par l'appelant (garde
 * la fonction pure et déterministe, donc testable).
 */
export function buildTemplatePath(args: {
  organizationId: string;
  uid: string;
  fileName: string;
}): string {
  const { organizationId, uid, fileName } = args;
  return `${organizationId}/${uid}-${sanitizeFileName(fileName)}`;
}

/** Message d'erreur de validation d'un fichier, ou `null` s'il est accepté. */
export function validateTemplateFile(file: { name: string; size: number }): string | null {
  return validateFile(file, DOCUMENT_TEMPLATE_FORMATS, MAX_TEMPLATE_SIZE_BYTES);
}
