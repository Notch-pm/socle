import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database.types";

const PORTAL_ASSISTANT_KEY = ["portal-assistant-settings"] as const;

export type PortalAssistantSettings = Tables<"portal_assistant_settings">;

/** Ce que l'écran règle — le reste de la ligne (dates, auteur) est de la tenue. */
export interface PortalAssistantFlags {
  enabled: boolean;
  deposit_enabled: boolean;
}

/** Aucune ligne = assistant fermé : c'est l'état de toute collectivité avant le premier geste. */
export const PORTAL_ASSISTANT_CLOSED: PortalAssistantFlags = {
  enabled: false,
  deposit_enabled: false,
};

/** Le réglage de l'assistant du portail d'une organisation principale, ou `null`. */
export function usePortalAssistantSettings(organizationId: string | undefined) {
  return useQuery({
    queryKey: [...PORTAL_ASSISTANT_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_assistant_settings")
        .select("*")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Ouvrir ou fermer l'assistant du portail. Réservé au super administrateur —
 * par le RLS (INSERT/UPDATE `is_super_admin()`), pas par cet écran.
 *
 * ⚠️ Les DEUX drapeaux partent à chaque écriture : couper l'assistant conserve
 * `deposit_enabled` (le réglage gouverne l'usage, pas la donnée), et c'est
 * l'API publique qui cesse de le servir.
 */
export function useSetPortalAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: PortalAssistantFlags & { organizationId: string; updatedBy: string | null | undefined },
    ) => {
      const { error } = await supabase.from("portal_assistant_settings").upsert(
        {
          organization_id: input.organizationId,
          enabled: input.enabled,
          deposit_enabled: input.deposit_enabled,
          updated_by: input.updatedBy ?? null,
        },
        { onConflict: "organization_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({
        queryKey: [...PORTAL_ASSISTANT_KEY, variables.organizationId],
      }),
  });
}
