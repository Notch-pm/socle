/**
 * Les deux lectures du tableau de bord.
 *
 * ⚠️ TOUT PASSE PAR DEUX RPC `SECURITY DEFINER`, et jamais par les tables.
 * Deux raisons distinctes :
 *   • les chiffres du référentiel — avec le RLS, un membre ordinaire ne voit
 *     pas les sous-organisations et lirait des totaux PARTIELS. Un tableau de
 *     bord qui ment est pire qu'un tableau de bord absent. La garde des RPC
 *     (`has_org_access` sur la racine) rend les mêmes chiffres à tous les
 *     membres directs ;
 *   • les compteurs de fréquentation — leurs tables n'ont AUCUNE policy : une
 *     policy de lecture, même large, ferait de leur découpage un contrat
 *     public, alors qu'il doit rester libre.
 *
 * ⚠️ La période est calculée ICI (heure de Paris) et transmise à la RPC, qui
 * date ses compteurs dans le même fuseau. La laisser calculer côté serveur
 * empêcherait l'écran de garder deux périodes en cache côte à côte.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  emptyDashboardStats,
  parseDashboardStats,
  type DashboardStats,
} from "./dashboardStats";
import {
  emptyAudience,
  parseAudience,
  periodRange,
  type Audience,
  type AudiencePeriod,
  type DayRange,
} from "./audience";

export function useOrganizationDashboard(organizationId: string | null) {
  return useQuery<DashboardStats>({
    queryKey: ["organization-dashboard", organizationId],
    enabled: organizationId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("organization_dashboard", {
        p_org_id: organizationId!,
      });
      if (error) throw error;
      return parseDashboardStats(data);
    },
    placeholderData: emptyDashboardStats,
  });
}

export interface PortalAudienceResult {
  audience: Audience;
  range: DayRange;
}

export function usePortalAudience(organizationId: string | null, period: AudiencePeriod) {
  // Les bornes entrent dans la clé de cache : changer de période est une autre
  // question, pas un rafraîchissement de la même.
  const range = periodRange(period);
  return useQuery<PortalAudienceResult>({
    queryKey: ["portal-audience", organizationId, range.from, range.to],
    enabled: organizationId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_audience", {
        p_org_id: organizationId!,
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;
      return { audience: parseAudience(data), range };
    },
    placeholderData: () => ({ audience: emptyAudience(), range }),
  });
}
