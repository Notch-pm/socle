/**
 * Persistance des contenus du site (`portal_contents`) — un par `slug`.
 *
 * Miroir exact de `usePortalTheme.ts` — deux colonnes, deux mutations qui ne se
 * croisent pas : `useSaveContentDraft` n'écrit que `draft`,
 * `usePublishPortalContent` écrit `published`. Sauvegarder n'est pas publier.
 *
 * Comme le thème, un contenu se publie avec le reste du site : c'est
 * `PortalEditorPage` qui enchaîne les publications, parce que l'agent publie
 * « son site », pas trois tables.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json, Tables } from "@/types/database.types";
import {
  defaultPortalContent,
  parsePortalContent,
  type PortalContent,
  type PortalContentSlug,
} from "@/features/portal/portalContent";

const PORTAL_CONTENTS_KEY = ["portal-contents"] as const;

export type PortalContentRow = Tables<"portal_contents">;

/**
 * Un contenu d'une organisation, ou `null` s'il n'a jamais été ouvert dans
 * l'éditeur (`useEnsurePortalContent` le crée alors).
 */
export function usePortalContent(organizationId: string | undefined, slug: PortalContentSlug) {
  return useQuery({
    queryKey: [...PORTAL_CONTENTS_KEY, organizationId, slug],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_contents")
        .select("*")
        .eq("organization_id", organizationId!)
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Crée le contenu, vide, s'il n'existe pas encore. `upsert … ignoreDuplicates`
 * pour la même raison que la page et le thème : en développement, React monte
 * deux fois les effets. La contrainte d'unicité fait le reste.
 */
export function useEnsurePortalContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      slug,
    }: {
      organizationId: string;
      slug: PortalContentSlug;
    }) => {
      const { error } = await supabase.from("portal_contents").upsert(
        {
          organization_id: organizationId,
          slug,
          draft: defaultPortalContent() as unknown as Json,
        },
        { onConflict: "organization_id,slug", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PORTAL_CONTENTS_KEY }),
  });
}

/** N'écrit que `draft`. Appelée par la sauvegarde automatique. */
export function useSaveContentDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: PortalContent }) => {
      const { error } = await supabase
        .from("portal_contents")
        .update({ draft: draft as unknown as Json })
        .eq("id", id);
      if (error) throw error;
    },
    // Pas d'invalidation : l'éditeur possède l'état local, et relire la ligne
    // pendant la frappe ferait revenir une version d'avant la frappe.
    onSuccess: (_data, { id, draft }) => {
      queryClient.setQueriesData<PortalContentRow | null>(
        { queryKey: PORTAL_CONTENTS_KEY },
        (row) => (row && row.id === id ? { ...row, draft: draft as unknown as Json } : row),
      );
    },
  });
}

/** Publie : `published := draft`, horodaté. */
export function usePublishPortalContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: PortalContent }) => {
      const json = draft as unknown as Json;
      const { error } = await supabase
        .from("portal_contents")
        .update({ draft: json, published: json, published_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PORTAL_CONTENTS_KEY }),
  });
}

/**
 * Annule le brouillon : `draft := published`, ou un contenu vide si rien n'a
 * jamais été publié. `published` n'est pas touché.
 */
export function useDiscardContentDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, published }: { id: string; published: Json | null }) => {
      const restored = published === null ? defaultPortalContent() : parsePortalContent(published);
      const { error } = await supabase
        .from("portal_contents")
        .update({ draft: restored as unknown as Json })
        .eq("id", id);
      if (error) throw error;
      return restored;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PORTAL_CONTENTS_KEY }),
  });
}
