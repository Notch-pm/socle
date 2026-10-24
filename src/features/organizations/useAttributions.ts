import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  cleanAttributions,
  isAttributionsEmpty,
  parseAttributions,
} from "@/features/organizations/attributions";

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

/**
 * Organismes dont les attributions sont rédigées, parmi `organizationIds` —
 * l'état « renseigné / à rédiger » de la liste de la page Connaissances. Un
 * texte blanc compte pour rien, comme à la lecture par Clara.
 */
export function useFilledAttributions(organizationIds: string[]) {
  return useQuery({
    queryKey: [ATTRIBUTIONS_KEY, "renseignes", organizationIds] as const,
    enabled: organizationIds.length > 0,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("organization_attributions")
        .select("organization_id, attributions")
        .in("organization_id", organizationIds);
      if (error) throw error;
      return new Set(
        data
          .filter((row) => !isAttributionsEmpty(parseAttributions(row.attributions)))
          .map((row) => row.organization_id),
      );
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
      // Préfixe seul : le texte de l'organisme ET l'état de la liste.
      queryClient.invalidateQueries({ queryKey: [ATTRIBUTIONS_KEY] });
    },
  });
}
