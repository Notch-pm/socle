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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(orgId) }),
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
