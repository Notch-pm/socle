import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { generateApiKey } from "@/features/superadmin/organizations/apiKeys";

const API_KEYS_KEY = ["api-keys"] as const;

/**
 * Propriétaire d'un jeu de clés : l'id d'une organisation **racine**, ou `null`
 * pour les clés **plateforme** (`organization_id IS NULL`). Depuis le registre
 * des applications (2026-09-08), une clé plateforme est rattachée à une
 * application et ne voit que les collectivités abonnées à celle-ci.
 */
export type ApiKeyOwner = string | null;

/**
 * Filtre par application : `undefined` = toutes les clés du propriétaire ;
 * un identifiant = les clés de cette application ; `null` = les clés SANS
 * application (celles d'avant le registre, à rattacher).
 */
export type ApiKeyApplicationFilter = string | null | undefined;

/** Vue liste d'une clé — **jamais** le hachage (`key_hash`) ni le secret. */
export interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  consumer: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

/**
 * Clés API d'une organisation racine, ou clés plateforme (`owner = null`),
 * éventuellement filtrées par application. Réservé au super admin (RLS).
 */
export function useApiKeys(owner: ApiKeyOwner, application?: ApiKeyApplicationFilter) {
  return useQuery({
    queryKey: [...API_KEYS_KEY, owner ?? "platform", application === undefined ? "*" : application ?? "none"],
    queryFn: async (): Promise<ApiKeyListItem[]> => {
      let query = supabase
        .from("api_keys")
        .select("id, name, key_prefix, scopes, consumer, last_used_at, expires_at, revoked_at, created_at");
      // Une clé plateforme n'a pas d'organisation : `eq(null)` ne matcherait rien,
      // il faut `IS NULL`.
      query = owner === null ? query.is("organization_id", null) : query.eq("organization_id", owner);
      if (application === null) query = query.is("consumer", null);
      else if (application !== undefined) query = query.eq("consumer", application);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Crée une clé : génère le secret + le hachage dans le navigateur, n'insère que
 * le hachage, et **renvoie le secret en clair une seule fois** (à afficher puis
 * oublier). `owner = null` crée une **clé plateforme**. `createdBy` = id de
 * l'utilisateur courant (`profile.id`).
 */
export function useCreateApiKey(owner: ApiKeyOwner, createdBy: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      expiresAt: string | null;
      scopes: string[];
      /**
       * Application du registre : obligatoire pour une clé plateforme (son
       * périmètre en dépend) et pour le scope « ai » (la dépense s'impute).
       */
      consumer: string | null;
    }): Promise<string> => {
      const generated = await generateApiKey();
      const { error } = await supabase.from("api_keys").insert({
        organization_id: owner,
        name: input.name,
        key_prefix: generated.prefix,
        key_hash: generated.hash,
        expires_at: input.expiresAt,
        scopes: input.scopes,
        consumer: input.consumer,
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
