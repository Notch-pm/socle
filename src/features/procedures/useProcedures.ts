import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database.types";

export type Procedure = Tables<"procedures">;
export type ProcedureType = "interne" | "externe";

export const PROCEDURE_TYPES: { value: ProcedureType; label: string }[] = [
  { value: "externe", label: "Externe" },
  { value: "interne", label: "Interne" },
];

const PROCEDURES_KEY = "procedures";

/** Démarches of one organisation principale (root), ordered by rang then name. */
export function useProceduresForOrg(organizationId: string | undefined) {
  return useQuery({
    queryKey: [PROCEDURES_KEY, "list", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procedures")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("order_index", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useProcedure(id: string | undefined) {
  return useQuery({
    queryKey: [PROCEDURES_KEY, "one", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("procedures").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });
}

/** Next default rang = highest existing order_index in the org + 1. */
export function useNextProcedureRank(organizationId: string | undefined) {
  return useQuery({
    queryKey: [PROCEDURES_KEY, "next-rank", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procedures")
        .select("order_index")
        .eq("organization_id", organizationId!)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.order_index ?? 0) + 1;
    },
  });
}

export function useCreateProcedure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<"procedures">) => {
      const { data, error } = await supabase
        .from("procedures")
        .insert(input)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [PROCEDURES_KEY, "list", variables.organization_id] });
      queryClient.invalidateQueries({ queryKey: [PROCEDURES_KEY, "next-rank", variables.organization_id] });
    },
  });
}

export function useUpdateProcedure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: TablesUpdate<"procedures"> & { id: string }) => {
      const { error } = await supabase.from("procedures").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [PROCEDURES_KEY, "list"] });
      queryClient.invalidateQueries({ queryKey: [PROCEDURES_KEY, "one", variables.id] });
    },
  });
}

export function useDeleteProcedure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("procedures").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PROCEDURES_KEY, "list"] }),
  });
}
