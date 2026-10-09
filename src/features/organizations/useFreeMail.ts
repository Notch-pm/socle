import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cleanFreeMailTitle } from "@/features/organizations/freeMail";

const FREE_MAIL_KEY = "portal-free-mail-settings";
const ROOT_APPLICATIONS_KEY = "organization-root-applications";

export interface FreeMailSettings {
  enabled: boolean;
  title: string | null;
  /** Dernier enregistrement ; `null` tant que rien n'a été réglé. */
  updatedAt: string | null;
}

/** Aucune ligne = courrier libre fermé, sans titre. */
export const FREE_MAIL_CLOSED: FreeMailSettings = { enabled: false, title: null, updatedAt: null };

/** Le réglage du courrier libre d'une organisation (toute organisation). */
export function useFreeMailSettings(organizationId: string | undefined) {
  return useQuery({
    queryKey: [FREE_MAIL_KEY, organizationId] as const,
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<FreeMailSettings> => {
      const { data, error } = await supabase
        .from("portal_free_mail_settings")
        .select("enabled, title, updated_at")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return FREE_MAIL_CLOSED;
      return { enabled: data.enabled, title: data.title, updatedAt: data.updated_at };
    },
  });
}

/**
 * Applications auxquelles la RACINE de l'organisation est abonnée. Lue par la
 * RPC `organization_root_applications` : l'administrateur d'une
 * sous-organisation n'a pas accès à la ligne d'abonnement de sa racine.
 */
export function useRootApplications(organizationId: string | undefined) {
  return useQuery({
    queryKey: [ROOT_APPLICATIONS_KEY, organizationId] as const,
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("organization_root_applications", {
        p_org_id: organizationId!,
      });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },
  });
}

/**
 * Enregistre le réglage (upsert sur `organization_id`). RLS :
 * `is_admin_of_self_or_ancestor`. ⚠️ Les deux valeurs partent à chaque
 * écriture : couper l'interrupteur CONSERVE le titre (le réglage gouverne
 * l'usage, pas la donnée).
 */
export function useSaveFreeMail(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { enabled: boolean; title: string | null; updatedBy: string | null | undefined }) => {
      const { error } = await supabase.from("portal_free_mail_settings").upsert(
        {
          organization_id: organizationId,
          enabled: input.enabled,
          title: cleanFreeMailTitle(input.title),
          updated_by: input.updatedBy ?? null,
        },
        { onConflict: "organization_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [FREE_MAIL_KEY, organizationId] }),
  });
}
