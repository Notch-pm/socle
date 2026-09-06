import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { parseEnabledLanguages } from "@/features/languages/languages";

const LANGUAGES_KEY = "organization-languages";

/**
 * Langues activées par une **organisation principale**.
 *
 * La lecture se fait sur la colonne `enabled_languages` de la racine, que les
 * écrans connaissent déjà (une démarche, une catégorie sont rattachées à une
 * racine) : pas besoin de la RPC de résolution, qui existe pour l'API publique,
 * où l'organisation servie peut être une sous-organisation.
 */
export function useOrganizationLanguages(organizationId: string | undefined) {
  return useQuery({
    queryKey: [LANGUAGES_KEY, organizationId] as const,
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("organizations")
        .select("enabled_languages")
        .eq("id", organizationId!)
        .single();
      if (error) throw error;
      return parseEnabledLanguages(data.enabled_languages);
    },
  });
}

/**
 * Écrit la sélection sur la ligne `organizations` (RLS UPDATE
 * `is_admin_of_self_or_ancestor`, trigger `enforce_languages_root_org` qui
 * refuse une sous-organisation). Pas de table dédiée : c'est une colonne de
 * l'organisation, comme la charte graphique.
 */
export function useSaveOrganizationLanguages(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (languages: string[]) => {
      const { error } = await supabase
        .from("organizations")
        .update({ enabled_languages: languages })
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LANGUAGES_KEY] });
      queryClient.invalidateQueries({ queryKey: ["organization", orgId] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-organizations"] });
    },
  });
}
