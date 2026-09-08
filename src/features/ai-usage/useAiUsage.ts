/**
 * Plafond et consommation IA d'une collectivité — lecture et réglage.
 *
 * LECTURE : accès direct aux tables sous RLS (`ai_usage_quotas_select` /
 * `..._counters_select`, ouvertes à l'administrateur de la collectivité et au
 * super admin) plus la RPC de ventilation, `SECURITY INVOKER` donc soumise aux
 * mêmes policies. C'est l'idiome natif du Socle — même posture que
 * `useSmtpSettings`. Les mêmes hooks servent donc les deux écrans, celui de
 * l'éditeur et celui du client : un seul jeu de requêtes à faire évoluer.
 *
 * ÉCRITURE : `set_ai_usage_quota` / `delete_ai_usage_quota` sont l'UNIQUE
 * porte. Les trois tables n'ont aucune policy d'écriture cliente : le refus
 * remonte du serveur, avec son message français, et s'affiche tel quel.
 *
 * ⚠️ Le plafond se pose sur une organisation PRINCIPALE : un budget est une
 * affaire de collectivité, pas de service. Le trigger le garde en base,
 * l'écran ne fait que refléter.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { currentPeriod, quotaView, type QuotaView } from "./aiQuota";

/** Sentinelle du plafond « tous fournisseurs confondus » (jumeau du SQL). */
export const GLOBAL_PROVIDER = "__global__";

export interface ConsumerUsage {
  consumer: string;
  feature: string | null;
  calls: number;
  tokens: number;
}

export interface AiUsage {
  organizationId: string;
  period: string;
  isActive: boolean;
  updatedAt: string | null;
  /**
   * La valeur portée par la ligne de plafond, active ou non — `null` sans
   * ligne. Un plafond « passé en illimité » la conserve (le réglage gouverne
   * l'usage, pas la donnée) : c'est elle que le retour en arrière retrouve.
   */
  configuredLimit: number | null;
  view: QuotaView;
  /** Qui a dépensé, et sur quelle fonctionnalité. */
  byConsumer: ConsumerUsage[];
}

const key = (orgId: string, period: string) => ["ai-usage", orgId, period] as const;

export function useAiUsage(orgId: string, period: string = currentPeriod()) {
  return useQuery({
    queryKey: key(orgId, period),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<AiUsage> => {
      const [quotas, counters, breakdown] = await Promise.all([
        supabase.from("ai_usage_quotas")
          .select("provider, monthly_limit_tokens, is_active, updated_at")
          .eq("organization_id", orgId),
        supabase.from("ai_usage_counters")
          .select("provider, used_tokens, reserved_tokens")
          .eq("organization_id", orgId).eq("period", period),
        supabase.rpc("ai_usage_breakdown", { p_org_id: orgId, p_period: period }),
      ]);
      if (quotas.error) throw quotas.error;
      if (counters.error) throw counters.error;
      if (breakdown.error) throw breakdown.error;

      const quota = (quotas.data ?? []).find((q) => q.provider === GLOBAL_PROVIDER) ?? null;
      const counter = (counters.data ?? []).find((c) => c.provider === GLOBAL_PROVIDER) ?? null;
      // Un plafond désactivé compte comme absent : c'est ce que fait
      // `reserve_ai_usage`, et l'écran doit dire la même chose que le serveur.
      const active = quota?.is_active ?? false;

      return {
        organizationId: orgId,
        period,
        isActive: active,
        updatedAt: quota?.updated_at ?? null,
        configuredLimit: quota?.monthly_limit_tokens ?? null,
        view: quotaView({
          limit: quota && active ? quota.monthly_limit_tokens : null,
          used: counter?.used_tokens ?? 0,
          reserved: counter?.reserved_tokens ?? 0,
        }),
        byConsumer: (breakdown.data ?? []) as ConsumerUsage[],
      };
    },
  });
}

/** Les vingt derniers appels — sans colonne de contenu : il n'y a rien à montrer. */
export interface AiUsageEventRow {
  id: string;
  consumer: string;
  feature: string | null;
  resource_type: string;
  status: string;
  actual_tokens: number | null;
  estimated_tokens: number;
  created_at: string;
}

export function useAiUsageEvents(orgId: string, period: string = currentPeriod()) {
  return useQuery({
    queryKey: ["ai-usage-events", orgId, period] as const,
    enabled: Boolean(orgId),
    queryFn: async (): Promise<AiUsageEventRow[]> => {
      const { data, error } = await supabase
        .from("ai_usage_events")
        .select("id, consumer, feature, resource_type, status, actual_tokens, estimated_tokens, created_at")
        .eq("organization_id", orgId)
        .eq("period", period)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
  void queryClient.invalidateQueries({ queryKey: ["ai-usage-events"] });
}

export function useSetAiQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { organizationId: string; limitTokens: number; isActive?: boolean }) => {
      const { error } = await supabase.rpc("set_ai_usage_quota", {
        p_org_id: vars.organizationId,
        p_monthly_limit_tokens: vars.limitTokens,
        p_is_active: vars.isActive ?? true,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteAiQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { organizationId: string }) => {
      const { error } = await supabase.rpc("delete_ai_usage_quota", { p_org_id: vars.organizationId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidate(queryClient),
  });
}
