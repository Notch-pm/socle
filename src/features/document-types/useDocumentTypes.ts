import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database.types";

const DOCUMENT_TYPES_KEY = ["document-types"] as const;

/** Code d'erreur Postgres pour une violation de contrainte d'unicité. */
export const UNIQUE_VIOLATION = "23505";

export function useDocumentTypesQuery(enabled = true) {
  return useQuery({
    queryKey: DOCUMENT_TYPES_KEY,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_types")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Types de pièce d'une organisation principale (racine) donnée. Alimente le
 * sélecteur de la pièce justificative dans le form builder. La clé partage le
 * préfixe `DOCUMENT_TYPES_KEY` : les mutations CRUD l'invalident par préfixe.
 */
export function useDocumentTypesForOrg(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: [...DOCUMENT_TYPES_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_types")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDocumentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<"document_types">) => {
      const { error } = await supabase.from("document_types").insert(input);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCUMENT_TYPES_KEY }),
  });
}

export function useUpdateDocumentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: TablesUpdate<"document_types"> & { id: string }) => {
      const { error } = await supabase.from("document_types").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCUMENT_TYPES_KEY }),
  });
}

export function useDeleteDocumentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("document_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCUMENT_TYPES_KEY }),
  });
}

export type DocumentType = Tables<"document_types">;
