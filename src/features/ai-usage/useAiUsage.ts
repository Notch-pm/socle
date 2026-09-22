/**
 * Plafond, partage et consommation IA d'une collectivité — lecture et réglage.
 *
 * LECTURE : accès direct aux tables sous RLS (`ai_usage_quotas_select` /
 * `..._counters_select`, ouvertes à l'administrateur de la collectivité et au
 * super admin) plus deux RPC `SECURITY INVOKER`, donc soumises aux mêmes
 * policies : la ventilation (`ai_usage_breakdown`) et les parts réservées
 * (`ai_usage_shares`). C'est l'idiome natif du Socle — même posture que
 * `useSmtpSettings`. Les mêmes hooks servent donc les deux écrans, celui de
 * l'éditeur et celui du client : un seul jeu de requêtes à faire évoluer.
 *
 * ⚠️ UNE SEULE QUERY. Le plafond et les parts se lisent ensemble, sous une
 * seule clé : une part en pourcentage se résout contre le plafond, et deux
 * caches à invalider l'un pour l'autre auraient fini par se contredire à
 * l'écran (2026-09-22, en remplacement de `useConsumerQuota`).
 *
 * ÉCRITURE : `set_ai_usage_quota` / `delete_ai_usage_quota` pour le plafond,
 * `set_ai_usage_consumer_quota` pour la part — l'UNIQUE porte. Les tables
 * n'ont aucune policy d'écriture cliente : le refus remonte du serveur, avec
 * son message français, et s'affiche tel quel.
 *
 * ⚠️ Le plafond se pose sur une organisation PRINCIPALE : un budget est une
 * affaire de collectivité, pas de service. Le trigger le garde en base,
 * l'écran ne fait que refléter.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  currentPeriod,
  quotaView,
  splitView,
  type AiShare,
  type QuotaView,
  type ShareMode,
  type SplitView,
} from "./aiQuota";

/** Sentinelle du plafond « tous fournisseurs confondus » (jumeau du SQL). */
export const GLOBAL_PROVIDER = "__global__";

/**
 * L'application qui impute les appels de l'assistant du portail usagers
 * (`api_keys.consumer`). Sa part est la seule que le Socle règle à l'écran :
 * la règle en base vaut pour n applications, l'écran n'en connaît qu'une.
 */
export const ASSISTANT_CONSUMER = "nora";

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
  /** Les parts réservées de la collectivité, résolues par le serveur. */
  shares: AiShare[];
  /** La répartition entre l'assistant du portail et le reste, prête à afficher. */
  split: SplitView;
}

const key = (orgId: string, period: string) => ["ai-usage", orgId, period] as const;

interface ShareRow {
  consumer: string;
  limit_mode: string;
  limit_percent: number | null;
  configured_tokens: number | null;
  effective_tokens: number | null;
  is_active: boolean;
  used_tokens: number;
  reserved_tokens: number;
  updated_at: string | null;
}

function toShare(row: ShareRow): AiShare {
  const mode: ShareMode = row.limit_mode === "percent" ? "percent" : "tokens";
  return {
    consumer: row.consumer,
    mode,
    configuredTokens: row.configured_tokens ?? null,
    percent: row.limit_percent ?? null,
    effectiveTokens: row.effective_tokens ?? null,
    isActive: row.is_active,
    used: row.used_tokens ?? 0,
    reserved: row.reserved_tokens ?? 0,
    updatedAt: row.updated_at ?? null,
  };
}

export function useAiUsage(orgId: string, period: string = currentPeriod()) {
  return useQuery({
    queryKey: key(orgId, period),
    enabled: Boolean(orgId),
    queryFn: async (): Promise<AiUsage> => {
      const [quotas, counters, breakdown, shares] = await Promise.all([
        supabase.from("ai_usage_quotas")
          .select("provider, monthly_limit_tokens, is_active, updated_at")
          .eq("organization_id", orgId),
        supabase.from("ai_usage_counters")
          .select("provider, used_tokens, reserved_tokens")
          .eq("organization_id", orgId).eq("period", period),
        supabase.rpc("ai_usage_breakdown", { p_org_id: orgId, p_period: period }),
        supabase.rpc("ai_usage_shares", { p_org_id: orgId, p_period: period }),
      ]);
      if (quotas.error) throw quotas.error;
      if (counters.error) throw counters.error;
      if (breakdown.error) throw breakdown.error;
      if (shares.error) throw shares.error;

      const quota = (quotas.data ?? []).find((q) => q.provider === GLOBAL_PROVIDER) ?? null;
      const counter = (counters.data ?? []).find((c) => c.provider === GLOBAL_PROVIDER) ?? null;
      // Un plafond désactivé compte comme absent : c'est ce que fait
      // `reserve_ai_usage`, et l'écran doit dire la même chose que le serveur.
      const active = quota?.is_active ?? false;
      const limit = quota && active ? quota.monthly_limit_tokens : null;
      const used = counter?.used_tokens ?? 0;
      const reserved = counter?.reserved_tokens ?? 0;
      const shareList = ((shares.data ?? []) as ShareRow[]).map(toShare);

      return {
        organizationId: orgId,
        period,
        isActive: active,
        updatedAt: quota?.updated_at ?? null,
        configuredLimit: quota?.monthly_limit_tokens ?? null,
        view: quotaView({ limit, used, reserved }),
        byConsumer: (breakdown.data ?? []) as ConsumerUsage[],
        shares: shareList,
        split: splitView({
          plafond: limit,
          share: shareList.find((s) => s.consumer === ASSISTANT_CONSUMER) ?? null,
          totalUsed: used,
          totalReserved: reserved,
        }),
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

/**
 * La part réservée d'une application — en jetons OU en pourcentage, jamais
 * les deux (la RPC refuse). Désactiver renvoie la valeur enregistrée avec
 * `isActive: false` : le réglage gouverne l'usage, pas la donnée.
 */
export interface SetAiShareVars {
  organizationId: string;
  consumer: string;
  isActive: boolean;
  tokens?: number;
  percent?: number;
}

export function useSetAiShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SetAiShareVars) => {
      const { error } = await supabase.rpc("set_ai_usage_consumer_quota", {
        p_org_id: vars.organizationId,
        p_consumer: vars.consumer,
        p_is_active: vars.isActive,
        ...(vars.percent !== undefined
          ? { p_limit_percent: vars.percent }
          : { p_monthly_limit_tokens: vars.tokens }),
      });
      // Message du serveur (RPC), en français — on ne le réécrit pas.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidate(queryClient),
  });
}
