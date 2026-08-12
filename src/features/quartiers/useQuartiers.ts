import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Geometry } from "geojson";
import { supabase } from "@/lib/supabase";
import type { Json, Tables } from "@/types/database.types";

const QUARTIERS_KEY = ["quartiers"] as const;

/** Code d'erreur Postgres pour une violation de contrainte d'unicité. */
export const UNIQUE_VIOLATION = "23505";

/** Ligne `quartiers` sans la géométrie (binaire PostGIS, inutilisable côté client). */
export type Quartier = Pick<
  Tables<"quartiers">,
  "id" | "organization_id" | "name" | "color" | "created_at" | "created_by"
>;

export interface QuartierGeoJson {
  id: string;
  name: string;
  color: string | null;
  geojson: Geometry;
}

export interface QuartierContactCount {
  quartier_id: string | null;
  quartier_name: string;
  color: string | null;
  count: number;
}

export function useQuartiers(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUARTIERS_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quartiers")
        .select("id, organization_id, name, color, created_at, created_by")
        .eq("organization_id", organizationId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Quartier[];
    },
  });
}

/**
 * Quartiers avec leur géométrie en GeoJSON (affichage carte). PostGIS stocke
 * en binaire ; la RPC fait le cast `ST_AsGeoJSON` côté serveur.
 */
export function useQuartiersGeoJson(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUARTIERS_KEY, organizationId, "geojson"],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_quartiers_geojson", {
        p_org_id: organizationId!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as QuartierGeoJson[];
    },
  });
}

/** Nombre de contacts (usagers) par quartier, + ligne « Sans quartier ». */
export function useQuartierContactCounts(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUARTIERS_KEY, organizationId, "contacts"],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stats_contacts_by_quartier", {
        p_org_id: organizationId!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as QuartierContactCount[];
    },
  });
}

export interface QuartierImportItem {
  name: string;
  color: string | null;
  geometry: Geometry;
}

export interface QuartierImportResult {
  quartier_id: string;
  quartier_name: string;
}

/**
 * Import en lot : un seul appel RPC = une seule transaction Postgres (si un
 * élément échoue, tout le lot est annulé). Les collisions de nom sont
 * dédoublonnées côté serveur ; le nom réellement utilisé est renvoyé. Le
 * recalcul des assignations de contacts est enchaîné après l'import.
 *
 * L'import **remplace** le découpage existant (`p_replace`) : les quartiers de
 * l'organisation sont supprimés dans la **même transaction** que la création des
 * nouveaux — un import qui échoue ne laisse donc jamais l'organisation sans
 * découpage. Les usagers rattachés manuellement à un quartier disparu repassent
 * en rattachement automatique (sinon le recalcul les ignorerait à jamais).
 */
export function useImportQuartiers(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: QuartierImportItem[]) => {
      const { data, error } = await supabase.rpc("create_quartiers_batch", {
        p_org_id: organizationId,
        p_items: items.map((i) => ({
          name: i.name.trim(),
          color: i.color,
          geometry: i.geometry,
        })) as unknown as Json,
        p_replace: true,
      });
      if (error) throw error;
      const { error: recalcError } = await supabase.rpc("recalculate_contact_quartiers", {
        p_org_id: organizationId,
      });
      if (recalcError) throw recalcError;
      return (data ?? []) as QuartierImportResult[];
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUARTIERS_KEY }),
  });
}

export function useUpdateQuartier(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string | null }) => {
      const { error } = await supabase
        .from("quartiers")
        .update({ name: name.trim(), color })
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUARTIERS_KEY }),
  });
}

export function useDeleteQuartier(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("quartiers")
        .delete()
        .eq("id", id)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUARTIERS_KEY }),
  });
}

/**
 * Réapplique l'assignation automatique à tous les contacts en
 * `quartier_auto = true` (RPC SECURITY DEFINER réservée aux admins de l'org).
 */
export function useRecalculateQuartiers(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("recalculate_contact_quartiers", {
        p_org_id: organizationId,
      });
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...QUARTIERS_KEY, organizationId, "contacts"] }),
  });
}
