import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database.types";
import {
  cleanUserInfo,
  isUserInfoEmpty,
  parseUserInfo,
  type OrganizationUserInfo,
} from "@/features/organizations/userInfo";

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
 * Organismes dont les informations usagers ne sont pas vierges, parmi
 * `organizationIds` — l'état « renseigné / à rédiger » de la liste de la page
 * Connaissances (`isUserInfoEmpty`, la règle du portail).
 */
export function useFilledUserInfo(organizationIds: string[]) {
  return useQuery({
    queryKey: [USER_INFO_KEY, "renseignes", organizationIds] as const,
    enabled: organizationIds.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("organization_user_info")
        .select("organization_id, info")
        .in("organization_id", organizationIds);
      if (error) throw error;
      return new Set(
        data
          .filter((row) => !isUserInfoEmpty(parseUserInfo(row.info)))
          .map((row) => row.organization_id),
      );
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
      // Préfixe seul : les informations de l'organisme ET l'état de la liste.
      queryClient.invalidateQueries({ queryKey: [USER_INFO_KEY] });
    },
  });
}
