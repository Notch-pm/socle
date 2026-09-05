import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database.types";
import {
  DOCUMENT_TEMPLATES_BUCKET,
  buildTemplatePath,
} from "@/features/documents/documentTemplates";

const DOCUMENT_TEMPLATES_KEY = ["document-templates"] as const;

/** Code d'erreur Postgres pour une violation de contrainte d'unicité. */
export const UNIQUE_VIOLATION = "23505";

export function useDocumentTemplatesQuery(enabled = true) {
  return useQuery({
    queryKey: DOCUMENT_TEMPLATES_KEY,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Documents d'une organisation principale (racine) donnée. La clé partage le
 * préfixe `DOCUMENT_TEMPLATES_KEY` : les mutations CRUD l'invalident par préfixe.
 */
export function useDocumentTemplatesForOrg(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: [...DOCUMENT_TEMPLATES_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<"document_templates">) => {
      const { error } = await supabase.from("document_templates").insert(input);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCUMENT_TEMPLATES_KEY }),
  });
}

export function useUpdateDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: TablesUpdate<"document_templates"> & { id: string }) => {
      const { error } = await supabase.from("document_templates").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCUMENT_TEMPLATES_KEY }),
  });
}

export function useDeleteDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("document_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCUMENT_TEMPLATES_KEY }),
  });
}

/**
 * Téléverse le fichier d'un document dans le bucket privé `document-templates`
 * et renvoie la référence à enregistrer sur la ligne. L'isolation multi-tenant
 * est portée par le RLS (chemin préfixé par l'organisation).
 *
 * ⚠️ Le fichier part **avant** que la ligne existe : une modale abandonnée
 * après sélection laisse un objet orphelin dans le bucket. Même parti que la
 * base de connaissances des démarches.
 */
export function useUploadDocumentTemplateFile() {
  return useMutation({
    mutationFn: async (args: {
      organizationId: string;
      file: File;
    }): Promise<{ file_path: string; file_name: string }> => {
      const path = buildTemplatePath({
        organizationId: args.organizationId,
        uid: crypto.randomUUID(),
        fileName: args.file.name,
      });
      const { error } = await supabase.storage
        .from(DOCUMENT_TEMPLATES_BUCKET)
        .upload(path, args.file, { upsert: false, contentType: args.file.type || undefined });
      if (error) throw error;
      return { file_path: path, file_name: args.file.name };
    },
  });
}

/**
 * Retire un objet du bucket (best-effort : appelé après le remplacement d'un
 * fichier ou la suppression d'une ligne, jamais avant).
 */
export function useRemoveDocumentTemplateFile() {
  return useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase.storage.from(DOCUMENT_TEMPLATES_BUCKET).remove([path]);
      if (error) throw error;
    },
  });
}

/** URL signée temporaire pour télécharger un document (le bucket est privé). */
export async function createSignedTemplateUrl(
  path: string,
  expiresInSeconds = 300,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOCUMENT_TEMPLATES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export type DocumentTemplate = Tables<"document_templates">;
