import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database.types";

export type SmtpSettings = Tables<"smtp_settings">;

export interface SmtpForm {
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
  /** true = ligne inerte, l'organisation utilise le relais de son parent. */
  inherit_parent: boolean;
}

/**
 * Relais dont **hérite** une organisation, c'est-à-dire celui qui s'applique à
 * son parent (RPC `parent_smtp_settings`). Aperçu **sans mot de passe** : un
 * admin de sous-organisation n'a pas à lire le secret de sa principale.
 */
export interface ParentSmtpSettings {
  source_organization_id: string;
  source_organization_name: string;
  configured: boolean;
  host: string;
  port: number;
  username: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
}

const key = (orgId: string) => ["smtp-settings", orgId] as const;

export function useSmtpSettings(orgId: string) {
  return useQuery({
    queryKey: key(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("smtp_settings")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Aucun parent (organisation principale) ⇒ requête inutile, `null` renvoyé. */
export function useParentSmtpSettings(orgId: string, hasParent: boolean) {
  return useQuery({
    queryKey: [...key(orgId), "parent"] as const,
    enabled: hasParent,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("parent_smtp_settings", { p_org_id: orgId })
        .maybeSingle();
      if (error) throw error;
      return data as ParentSmtpSettings | null;
    },
  });
}

export function useSaveSmtpSettings(orgId: string, existingId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: SmtpForm) => {
      if (existingId) {
        const { error } = await supabase.from("smtp_settings").update(form).eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("smtp_settings")
          .insert({ ...form, organization_id: orgId });
        if (error) throw error;
      }
    },
    // Invalidation de TOUTES les organisations : le relais d'un parent est celui
    // de sa descendance non spécifique, l'aperçu des enfants change avec lui.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["smtp-settings"] }),
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: async ({ to, organizationId }: { to: string; organizationId: string }) => {
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
        "send-test-email",
        { body: { to, organization_id: organizationId } },
      );
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.success) throw new Error("Réponse inattendue du serveur");
    },
  });
}
