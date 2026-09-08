import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database.types";

const CATEGORIES_KEY = ["categories"] as const;

/**
 * Les catégories visibles (RLS), ou celles d'une seule organisation quand
 * `organizationId` est fourni — la section superadmin d'une racine. Les
 * mutations invalident le préfixe : les deux formes se rafraîchissent.
 */
export function useCategoriesQuery(organizationId?: string) {
  return useQuery({
    queryKey: [...CATEGORIES_KEY, organizationId ?? "all"],
    queryFn: async () => {
      let query = supabase.from("categories").select("*").order("name", { ascending: true });
      if (organizationId) query = query.eq("organization_id", organizationId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<"categories">) => {
      const { error } = await supabase.from("categories").insert(input);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: TablesUpdate<"categories"> & { id: string }) => {
      const { error } = await supabase.from("categories").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  });
}

export type Category = Tables<"categories">;
