import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database.types";
import { cleanUserInfo, parseUserInfo, type OrganizationUserInfo } from "@/features/organizations/userInfo";

const USER_INFO_KEY = "organization-user-info";

export interface StoredUserInfo {
  info: OrganizationUserInfo;
  /** Dernier enregistrement ; `null` tant que rien n'a été écrit. */
  updatedAt: string | null;
}

/**
 * Informations à destination des usagers d'une organisation (principale ou
 * sous-organisation). Aucune ligne = rien d'écrit : des informations vierges,
 * pas une erreur.
 */
export function useUserInfo(organizationId: string | undefined) {
  return useQuery({
    queryKey: [USER_INFO_KEY, organizationId] as const,
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<StoredUserInfo> => {
      const { data, error } = await supabase
        .from("organization_user_info")
        .select("info, updated_at")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return { info: parseUserInfo(data?.info), updatedAt: data?.updated_at ?? null };
    },
  });
}

/**
 * Enregistre les informations (upsert sur `organization_id`) — et les publie :
 * il n'y a pas de brouillon. RLS : `is_admin_of_self_or_ancestor`.
 */
export function useSaveUserInfo(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (info: OrganizationUserInfo) => {
      const { error } = await supabase
        .from("organization_user_info")
        .upsert(
          { organization_id: organizationId, info: cleanUserInfo(info) as unknown as Json },
          { onConflict: "organization_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [USER_INFO_KEY, organizationId] });
    },
  });
}
