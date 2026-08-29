/**
 * Lecture inter-clients de la consommation IA.
 *
 * Deux `select` sous RLS (`ai_usage_quotas_select` / `..._counters_select`,
 * réservées au super admin) et rien d'autre : ni RPC par organisation, ni
 * lecture du journal. Le détail par application se lit sur la fiche d'une
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
import { buildUsageRows, type CounterRow, type OrgUsage, type QuotaRow } from "./aiUsageAll";

const QUOTA_SELECT = "organization_id, provider, monthly_limit_tokens, is_active, updated_at";
const COUNTER_SELECT = "organization_id, provider, used_tokens, reserved_tokens";

export function useAllAiUsage(period: string = currentPeriod()) {
  const orgs = useAllOrganizations();

  const usage = useQuery({
    queryKey: ["sa-ai-usage-all", period] as const,
    queryFn: async (): Promise<{ quotas: QuotaRow[]; counters: CounterRow[] }> => {
      const [quotas, counters] = await Promise.all([
        supabase.from("ai_usage_quotas").select(QUOTA_SELECT),
        supabase.from("ai_usage_counters").select(COUNTER_SELECT).eq("period", period),
      ]);
      if (quotas.error) throw quotas.error;
      if (counters.error) throw counters.error;
      return {
        quotas: (quotas.data ?? []) as QuotaRow[],
        counters: (counters.data ?? []) as CounterRow[],
      };
    },
  });

  const rows: OrgUsage[] = orgs.data && usage.data
    ? buildUsageRows(orgs.data, usage.data.quotas, usage.data.counters)
    : [];

  return {
    rows,
    period,
    isLoading: orgs.isLoading || usage.isLoading,
    isError: orgs.isError || usage.isError,
  };
}
