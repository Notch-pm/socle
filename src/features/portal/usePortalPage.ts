/**
 * Persistance d'une page du portail (`portal_pages`).
 *
 * Deux colonnes, deux mutations qui ne se croisent pas :
 *   · `useSaveDraft` n'écrit QUE `draft` — c'est ce que la sauvegarde
 *     automatique appelle, à chaque modification ;
 *   · `usePublishPortalPage` écrit `published` (et `draft`, pour que la
 *     publication parte du dernier état, sauvegarde en attente comprise).
 * Sauvegarder n'est pas publier : la séparation est dans les signatures, pas
 * dans une option.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables } from "@/types/database.types";
import { defaultPortalPage, parsePortalPage, type PortalPage } from "@/features/portal/portalPage";

const PORTAL_PAGES_KEY = ["portal-pages"] as const;

/** La seule page qui existe à ce stade. */
export const HOME_SLUG = "accueil";

export type PortalPageRow = Tables<"portal_pages">;

/**
 * La page d'accueil d'une organisation, ou `null` si elle n'a jamais été
 * ouverte dans l'éditeur (`useEnsurePortalPage` la crée alors).
 */
export function usePortalPage(organizationId: string | undefined) {
  return useQuery({
    queryKey: [...PORTAL_PAGES_KEY, organizationId, HOME_SLUG],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_pages")
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("slug", HOME_SLUG)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Crée la page avec sa composition par défaut si elle n'existe pas encore.
 *
 * `upsert … ignoreDuplicates` plutôt qu'`insert` : en développement, React
 * monte deux fois les effets, et deux créations partiraient en même temps. La
 * contrainte d'unicité (organisation, slug) fait le reste — la seconde ne
 * change rien et ne lève rien.
 */
export function useEnsurePortalPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await supabase.from("portal_pages").upsert(
        {
          organization_id: organizationId,
          slug: HOME_SLUG,
          draft: defaultPortalPage() as unknown as Json,
        },
        { onConflict: "organization_id,slug", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PORTAL_PAGES_KEY }),
  });
}

/** N'écrit que `draft`. Appelée par la sauvegarde automatique. */
export function useSaveDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: PortalPage }) => {
      const { error } = await supabase
        .from("portal_pages")
        .update({ draft: draft as unknown as Json })
        .eq("id", id);
      if (error) throw error;
    },
    // Pas d'invalidation : l'éditeur possède l'état local, et relire la ligne
    // pendant qu'on tape ferait revenir une version d'avant la frappe.
    onSuccess: (_data, { id, draft }) => {
      queryClient.setQueriesData<PortalPageRow | null>({ queryKey: PORTAL_PAGES_KEY }, (row) =>
        row && row.id === id ? { ...row, draft: draft as unknown as Json } : row,
      );
    },
  });
}

/**
 * Publie : `published := draft`, horodaté. Le brouillon transmis est celui de
 * l'éditeur — le dernier état, même si sa sauvegarde automatique n'est pas
 * encore partie — et il est écrit en même temps, pour que ce qui est publié
 * soit exactement ce qui est affiché.
 */
export function usePublishPortalPage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: PortalPage }) => {
      const json = draft as unknown as Json;
      const { error } = await supabase
        .from("portal_pages")
        .update({ draft: json, published: json, published_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PORTAL_PAGES_KEY }),
  });
}

/**
 * Annule le brouillon : `draft := published`, ou la composition par défaut si
 * rien n'a jamais été publié. `published` n'est pas touché.
 */
export function useDiscardDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: Json | null }) => {
      const restored = published === null ? defaultPortalPage() : parsePortalPage(published);
      const { error } = await supabase
        .from("portal_pages")
        .update({ draft: restored as unknown as Json })
        .eq("id", id);
      if (error) throw error;
      return restored;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PORTAL_PAGES_KEY }),
  });
}
