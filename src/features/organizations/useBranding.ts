import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { BrandingUpdate } from "@/features/organizations/branding";

/**
 * Charte dont une organisation **hérite**, c'est-à-dire celle applicable à son
 * parent (RPC `parent_branding`, SECURITY DEFINER). L'admin d'une
 * sous-organisation n'a aucun droit de lecture sur la ligne de son parent
 * (`has_org_access` exige l'appartenance directe) : sans cette RPC, il
 * choisirait d'hériter sans jamais voir de quoi.
 */
export interface ParentBranding {
  source_organization_id: string;
  source_organization_name: string;
  /** Au moins un des cinq éléments est renseigné au-dessus. */
  configured: boolean;
  logo_url: string | null;
  logo_white_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

const PARENT_BRANDING_KEY = "parent-branding";

/** Aucun parent (organisation principale) ⇒ requête inutile. */
export function useParentBranding(orgId: string, hasParent: boolean) {
  return useQuery({
    queryKey: [PARENT_BRANDING_KEY, orgId] as const,
    enabled: hasParent,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("parent_branding", { p_org_id: orgId })
        .maybeSingle();
      if (error) throw error;
      return data as ParentBranding | null;
    },
  });
}

/**
 * Écrit la charte sur la ligne `organizations` (RLS UPDATE
 * `is_admin_of_self_or_ancestor`). Pas de table dédiée : ce sont des colonnes de
 * l'organisation.
 */
export function useSaveBranding(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (update: BrandingUpdate) => {
      const { error } = await supabase.from("organizations").update(update).eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", orgId] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organization-children"] });
      // Invalidation de TOUS les aperçus : la charte d'un parent est celle de sa
      // descendance non spécifique — l'aperçu des enfants change avec elle.
      queryClient.invalidateQueries({ queryKey: [PARENT_BRANDING_KEY] });
    },
  });
}
