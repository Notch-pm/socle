import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const KEY = "organization-procedures";

/** Liaisons démarche↔organisation existantes pour une organisation donnée. */
export function useOrganizationProcedureBindings(organizationId: string | undefined) {
  return useQuery({
    queryKey: [KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_procedures")
        .select("*")
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Active ou désactive une démarche pour une organisation. Upsert sur la contrainte
 * unique `(organization_id, procedure_id)` : la liaison est créée si absente, sinon
 * mise à jour (le RLS autorise l'écriture aux admins de l'organisation).
 */
export function useSetProcedureEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      procedureId,
      enabled,
    }: {
      organizationId: string;
      procedureId: string;
      enabled: boolean;
    }) => {
      const { error } = await supabase
        .from("organization_procedures")
        .upsert(
          { organization_id: organizationId, procedure_id: procedureId, is_enabled: enabled },
          { onConflict: "organization_id,procedure_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [KEY, variables.organizationId] });
    },
  });
}
