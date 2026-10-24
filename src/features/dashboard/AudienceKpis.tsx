import { Eye, MousePointerClick, Send } from "lucide-react";
import { KpiCard } from "./KpiCard";
import { formatCount } from "./dashboardStats";
import { depositSubtitle, type AudienceTotals } from "./audience";

/** Les trois tuiles de la fréquentation — tableau de bord et page Fréquentation. */
export function AudienceKpis({ totals, loading }: { totals: AudienceTotals; loading: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <KpiCard label="Visites" value={formatCount(totals.visits)} Icon={MousePointerClick} loading={loading} />
      <KpiCard
        label="Pages vues"
        value={formatCount(totals.views)}
        Icon={Eye}
        iconClassName="text-blue-500"
        loading={loading}
      />
      <KpiCard
        label="Demandes déposées"
        value={formatCount(totals.deposits)}
        sub={depositSubtitle(totals)}
        Icon={Send}
        iconClassName="text-amber-500"
        loading={loading}
      />
    </div>
  );
}

/** ⚠️ La méthode se dit à côté des chiffres : sans elle, « visites » se lirait « visiteurs ». */
export const AUDIENCE_METHOD =
  "Mesure sans cookie : aucune donnée n'est enregistrée sur le poste des visiteurs, et une visite est une arrivée sur le site — pas un visiteur unique.";
