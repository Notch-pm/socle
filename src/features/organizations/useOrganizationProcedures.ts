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
 * Les activations (`is_enabled`) d'un ensemble d'organisations — l'arbre
 * d'une racine, pour l'éditeur du portail, qui a besoin de savoir qui
 * propose quoi sur tout le sous-arbre. Le RLS de lecture couvre l'admin de
 * la racine (`is_admin_of_self_or_ancestor`) comme le super admin.
 */
export function useEnabledProcedureBindings(organizationIds: string[]) {
  const scope = [...organizationIds].sort().join(",");
  return useQuery({
    queryKey: [KEY, "enabled", scope],
    enabled: organizationIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_procedures")
        .select("organization_id, procedure_id, is_enabled")
        .in("organization_id", organizationIds)
        .eq("is_enabled", true);
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
    // Toute la clé : la liste d'une organisation, et celle d'un sous-arbre
    // (éditeur du portail) qui la contiendrait.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
  });
}
