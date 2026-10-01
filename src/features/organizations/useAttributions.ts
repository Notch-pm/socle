import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cleanAttributions, parseAttributions } from "@/features/organizations/attributions";

const ATTRIBUTIONS_KEY = "organization-attributions";

export interface StoredAttributions {
  attributions: string;
  /** Dernier enregistrement ; `null` tant que rien n'a été écrit. */
  updatedAt: string | null;
}

/**
 * Attributions d'une organisation (toute organisation, service interne
 * compris). Aucune ligne = rien d'écrit : un texte vide, pas une erreur.
 */
export function useAttributions(organizationId: string | undefined) {
  return useQuery({
    queryKey: [ATTRIBUTIONS_KEY, organizationId] as const,
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<StoredAttributions> => {
      const { data, error } = await supabase
        .from("organization_attributions")
        .select("attributions, updated_at")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return { attributions: parseAttributions(data?.attributions), updatedAt: data?.updated_at ?? null };
    },
  });
}

/** Enregistre les attributions (upsert sur `organization_id`). RLS : `is_admin_of_self_or_ancestor`. */
export function useSaveAttributions(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (attributions: string) => {
      const { error } = await supabase
        .from("organization_attributions")
        .upsert(
          { organization_id: organizationId, attributions: cleanAttributions(attributions) },
          { onConflict: "organization_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ATTRIBUTIONS_KEY, organizationId] });
    },
  });
}
