import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { KbDocument } from "@/features/procedures/knowledgeBase";
import {
  PROCEDURE_DOCUMENTS_BUCKET,
  buildDocumentPath,
  type DocumentKind,
} from "@/features/procedures/procedureStorage";

/**
 * Téléverse un document dans le bucket privé `procedure-documents` puis renvoie
 * la référence `{ path, name }` à stocker dans `procedures.knowledge_base`.
 * L'isolation multi-tenant est portée par le RLS (chemin préfixé par l'org).
 */
export function useUploadProcedureDocument() {
  return useMutation({
    mutationFn: async (args: {
      organizationId: string;
      procedureId: string;
      kind: DocumentKind;
      file: File;
    }): Promise<KbDocument> => {
      const path = buildDocumentPath({
        organizationId: args.organizationId,
        procedureId: args.procedureId,
        kind: args.kind,
        uid: crypto.randomUUID(),
        fileName: args.file.name,
      });
      const { error } = await supabase.storage
        .from(PROCEDURE_DOCUMENTS_BUCKET)
        .upload(path, args.file, { upsert: false, contentType: args.file.type || undefined });
      if (error) throw error;
      return { path, name: args.file.name };
    },
  });
}

/** Supprime un document du bucket (best-effort : appelé au retrait d'une entrée). */
export function useRemoveProcedureDocument() {
  return useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase.storage.from(PROCEDURE_DOCUMENTS_BUCKET).remove([path]);
      if (error) throw error;
    },
  });
}

/**
 * URL signée temporaire pour consulter/télécharger un document privé.
 * Le RLS `read procedure documents` conditionne la génération à l'accès org.
 */
export async function createSignedDocumentUrl(path: string, expiresInSeconds = 300): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PROCEDURE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
