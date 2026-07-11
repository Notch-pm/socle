import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { generateApiKey } from "@/features/superadmin/organizations/apiKeys";

const API_KEYS_KEY = ["api-keys"] as const;

/** Vue liste d'une clé — **jamais** le hachage (`key_hash`) ni le secret. */
export interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/** Clés API d'une organisation (racine). Réservé au super admin (RLS). */
export function useApiKeys(organizationId: string) {
  return useQuery({
    queryKey: [...API_KEYS_KEY, organizationId],
    queryFn: async (): Promise<ApiKeyListItem[]> => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Crée une clé : génère le secret + le hachage dans le navigateur, n'insère que
 * le hachage, et **renvoie le secret en clair une seule fois** (à afficher puis
 * oublier). `createdBy` = id de l'utilisateur courant (`profile.id`).
 */
export function useCreateApiKey(organizationId: string, createdBy: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; expiresAt: string | null }): Promise<string> => {
      const generated = await generateApiKey();
      const { error } = await supabase.from("api_keys").insert({
        organization_id: organizationId,
        name: input.name,
        key_prefix: generated.prefix,
        key_hash: generated.hash,
        expires_at: input.expiresAt,
        created_by: createdBy ?? null,
      });
      if (error) throw error;
      return generated.secret;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_KEY }),
  });
}

/** Révoque une clé (révocation douce : `revoked_at = now()`). */
export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_KEY }),
  });
}
