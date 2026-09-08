/**
 * Persistance du thème du site (`portal_themes`).
 *
 * Miroir exact de `usePortalPage.ts` — deux colonnes, deux mutations qui ne se
 * croisent pas : `useSaveThemeDraft` n'écrit que `draft`, `usePublishPortalTheme`
 * écrit `published`. Sauvegarder n'est pas publier, ici comme là.
 *
 * Une table séparée, et non une clé de plus dans la page : le thème vaut pour
 * tout le site, une page vaut pour une adresse. Les deux se publient pourtant
 * d'un seul geste — c'est `PortalEditorPage` qui les enchaîne, parce que
 * l'agent, lui, publie « son site ».
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables } from "@/types/database.types";
import {
  defaultPortalTheme,
  parsePortalTheme,
  type PortalTheme,
} from "@/features/portal/portalTheme";

const PORTAL_THEMES_KEY = ["portal-themes"] as const;

export type PortalThemeRow = Tables<"portal_themes">;

/**
 * Le thème d'une organisation, ou `null` s'il n'a jamais été ouvert dans
 * l'éditeur (`useEnsurePortalTheme` le crée alors).
 */
export function usePortalTheme(organizationId: string | undefined) {
  return useQuery({
    queryKey: [...PORTAL_THEMES_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_themes")
        .select("*")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Crée le thème avec ses défauts s'il n'existe pas encore.
 *
 * `upsert … ignoreDuplicates` pour la même raison que la page : en
 * développement, React monte deux fois les effets, et deux créations
 * partiraient en même temps. La contrainte d'unicité fait le reste.
 */
export function useEnsurePortalTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await supabase.from("portal_themes").upsert(
        {
          organization_id: organizationId,
          draft: defaultPortalTheme() as unknown as Json,
        },
        { onConflict: "organization_id", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PORTAL_THEMES_KEY }),
  });
}

/** N'écrit que `draft`. Appelée par la sauvegarde automatique. */
export function useSaveThemeDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: PortalTheme }) => {
      const { error } = await supabase
        .from("portal_themes")
        .update({ draft: draft as unknown as Json })
        .eq("id", id);
      if (error) throw error;
    },
    // Pas d'invalidation : l'éditeur possède l'état local, et relire la ligne
    // pendant qu'on règle ferait revenir une version d'avant le réglage.
    onSuccess: (_data, { id, draft }) => {
      queryClient.setQueriesData<PortalThemeRow | null>({ queryKey: PORTAL_THEMES_KEY }, (row) =>
        row && row.id === id ? { ...row, draft: draft as unknown as Json } : row,
      );
    },
  });
}

/** Publie : `published := draft`, horodaté. */
export function usePublishPortalTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: PortalTheme }) => {
      const json = draft as unknown as Json;
      const { error } = await supabase
        .from("portal_themes")
        .update({ draft: json, published: json, published_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PORTAL_THEMES_KEY }),
  });
}

/**
 * Annule le brouillon : `draft := published`, ou les défauts si rien n'a jamais
 * été publié. `published` n'est pas touché.
 */
export function useDiscardThemeDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: Json | null }) => {
      const restored = published === null ? defaultPortalTheme() : parsePortalTheme(published);
      const { error } = await supabase
        .from("portal_themes")
        .update({ draft: restored as unknown as Json })
        .eq("id", id);
      if (error) throw error;
      return restored;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PORTAL_THEMES_KEY }),
  });
}
