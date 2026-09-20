/**
 * Sous-plafond IA d'UNE application pour une collectivité — lecture et réglage.
 *
 * Le plafond mensuel est commun à toutes les applications d'une collectivité.
 * Le sous-plafond est une porte EN PLUS, pour une application donnée : il dit
 * « pas plus de N jetons ce mois-ci pour elle », et laisse le reste aux autres.
 * Né avec l'assistant du portail usagers (`nora`), ouvert à des visiteurs
 * anonymes, qui sans borne propre pourrait épuiser le crédit des agents.
 *
 * Même posture que `useAiUsage` : LECTURE directe sous RLS (administrateur de
 * la collectivité et super admin), ÉCRITURE par les seules RPC
 * `set_/delete_ai_usage_consumer_quota`, gardées par `is_super_admin()` DANS la
 * fonction. ⚠️ Un plafond que son porteur pourrait lever ne serait pas un plafond.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { currentPeriod } from "./aiQuota";

export interface ConsumerQuota {
  /**
   * La valeur portée par la ligne, active ou non — `null` sans ligne. Un
   * sous-plafond désactivé la conserve (le réglage gouverne l'usage, pas la
   * donnée) : c'est elle que le retour en arrière retrouve.
   */
  configuredLimit: number | null;
  /** Le sous-plafond borne-t-il réellement l'application, là, maintenant ? */
  isActive: boolean;
  used: number;
  reserved: number;
}

const key = (orgId: string, consumer: string, period: string) =>
  ["ai-consumer-quota", orgId, consumer, period] as const;

export function useConsumerQuota(orgId: string, consumer: string, period: string = currentPeriod()) {
  return useQuery({
    queryKey: key(orgId, consumer, period),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<ConsumerQuota> => {
      const [quota, counter] = await Promise.all([
        supabase.from("ai_usage_consumer_quotas")
          .select("monthly_limit_tokens, is_active")
          .eq("organization_id", orgId).eq("consumer", consumer).maybeSingle(),
        supabase.from("ai_usage_consumer_counters")
          .select("used_tokens, reserved_tokens")
          .eq("organization_id", orgId).eq("consumer", consumer).eq("period", period).maybeSingle(),
      ]);
      if (quota.error) throw quota.error;
      if (counter.error) throw counter.error;
      return {
        configuredLimit: quota.data?.monthly_limit_tokens ?? null,
        isActive: quota.data?.is_active ?? false,
        used: counter.data?.used_tokens ?? 0,
        reserved: counter.data?.reserved_tokens ?? 0,
      };
    },
  });
}

export function useSetConsumerQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      organizationId: string;
      consumer: string;
      limitTokens: number;
      isActive?: boolean;
    }) => {
      const { error } = await supabase.rpc("set_ai_usage_consumer_quota", {
        p_org_id: vars.organizationId,
        p_consumer: vars.consumer,
        p_monthly_limit_tokens: vars.limitTokens,
        p_is_active: vars.isActive ?? true,
      });
      // Message du serveur (RPC), en français — on ne le réécrit pas.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-consumer-quota"] }),
  });
}
