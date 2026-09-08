import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database.types";
import { parseProvisionReport, type PlatformSettingsRow } from "./platformSettings";

const PLATFORM_SETTINGS_KEY = ["platform-settings"] as const;

export type PlatformSettings = Tables<"platform_settings">;

/**
 * La ligne unique de `platform_settings`. Lisible par tout utilisateur
 * authentifié (aucun secret n'y vit) : l'écran des domaines d'une collectivité
 * s'en sert pour afficher la cible CNAME et reconnaître le sous-domaine fourni.
 */
export function usePlatformSettings() {
  return useQuery({
    queryKey: PLATFORM_SETTINGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Écriture réservée au super administrateur — le RLS UPDATE tranche. */
export function useSavePlatformSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PlatformSettingsRow) => {
      const { error } = await supabase.from("platform_settings").update(input).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLATFORM_SETTINGS_KEY }),
  });
}

/**
 * Rejoue `provision_root` sur toutes les racines. Ce que la fonction a ajouté
 * touche des listes affichées ailleurs (domaines, plafonds, check-lists) : on
 * les invalide toutes, le geste est rare.
 */
export function useProvisionExistingRoots() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("provision_existing_roots");
      if (error) throw new Error(error.message);
      return parseProvisionReport(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organization-domains"] });
      void queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      void queryClient.invalidateQueries({ queryKey: ["root-onboarding-status"] });
    },
  });
}
