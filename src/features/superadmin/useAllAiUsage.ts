/**
 * Lecture inter-clients de la consommation IA.
 *
 * Trois `select` sous RLS (`ai_usage_quotas_select` / `..._counters_select` /
 * `..._consumer_quotas_select`, ouvertes au super admin) et rien d'autre : ni
 * RPC par organisation, ni lecture du journal. La part de l'assistant se lit
 * telle qu'enregistrée — le tableau dit « 25 % » ou « 500 000 », la fiche de
 * la collectivité la résout et la jauge. Le détail par application se lit sur la fiche d'une
 * collectivité — ici on compare des collectivités entre elles, et parcourir
 * `ai_usage_events` pour toute la plateforme serait un coût qui croît avec
 * l'usage sans rien apprendre de plus à cet écran.
 *
 * ⚠️ Aucune écriture ici. Poser un plafond se fait sur la fiche de la
 * collectivité, par `set_ai_usage_quota` — une seule porte, un seul écran qui
 * écrit. Deux dialogues de réglage seraient deux endroits à corriger le jour
 * où la règle change.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { currentPeriod } from "@/features/ai-usage/aiQuota";
import { useAllOrganizations } from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { ASSISTANT_CONSUMER } from "@/features/ai-usage/useAiUsage";
import {
  buildUsageRows,
  type CounterRow,
  type OrgUsage,
  type QuotaRow,
  type ShareRow,
} from "./aiUsageAll";

const QUOTA_SELECT = "organization_id, provider, monthly_limit_tokens, is_active, updated_at";
const COUNTER_SELECT = "organization_id, provider, used_tokens, reserved_tokens";
const SHARE_SELECT = "organization_id, limit_mode, monthly_limit_tokens, limit_percent, is_active";

export function useAllAiUsage(period: string = currentPeriod()) {
  const orgs = useAllOrganizations();

  const usage = useQuery({
    queryKey: ["sa-ai-usage-all", period] as const,
    queryFn: async (): Promise<{ quotas: QuotaRow[]; counters: CounterRow[]; shares: ShareRow[] }> => {
      const [quotas, counters, shares] = await Promise.all([
        supabase.from("ai_usage_quotas").select(QUOTA_SELECT),
        supabase.from("ai_usage_counters").select(COUNTER_SELECT).eq("period", period),
        supabase.from("ai_usage_consumer_quotas").select(SHARE_SELECT).eq("consumer", ASSISTANT_CONSUMER),
      ]);
      if (quotas.error) throw quotas.error;
      if (counters.error) throw counters.error;
      if (shares.error) throw shares.error;
      return {
        quotas: (quotas.data ?? []) as QuotaRow[],
        counters: (counters.data ?? []) as CounterRow[],
        shares: (shares.data ?? []) as ShareRow[],
      };
    },
  });

  const rows: OrgUsage[] = orgs.data && usage.data
    ? buildUsageRows(orgs.data, usage.data.quotas, usage.data.counters, usage.data.shares)
    : [];

  return {
    rows,
    period,
    isLoading: orgs.isLoading || usage.isLoading,
    isError: orgs.isError || usage.isError,
  };
}
