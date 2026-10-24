/**
 * Les graphiques de la page Fréquentation, chargés en `React.lazy` comme ceux
 * du tableau de bord (ApexCharts pèse ~130 Ko : les tuiles ne l'attendent pas).
 */

import { BreakdownChart, TopPagesChart, TrafficChart } from "./DashboardCharts";
import type { Audience, AudienceBreakdown, SeriesPoint } from "./audience";

export interface AudienceChartsProps {
  points: SeriesPoint[];
  audience: Audience;
  loading: boolean;
  languages: AudienceBreakdown[];
  devices: AudienceBreakdown[];
  /**
   * La collectivité s'adresse-t-elle à ses usagers en plusieurs langues ?
   * ⚠️ Le camembert des langues ne s'affiche que si oui — même règle que le
   * filtre par organisme du portail : un découpage à une seule part n'en est
   * pas un, et « 100 % français » sur une collectivité monolingue occuperait
   * une carte entière pour ne rien dire.
   */
  multilingual: boolean;
}

export default function AudienceCharts(props: AudienceChartsProps) {
  return (
    <>
      <TrafficChart points={props.points} loading={props.loading} />
      {/* `items-start` : les deux colonnes n'ont pas la même hauteur naturelle
          (une liste de pages contre un ou deux camemberts). Sans lui, la plus
          courte s'étire et laisse un grand vide sous son graphique. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <TopPagesChart audience={props.audience} loading={props.loading} />
        <div className="flex flex-col gap-4">
          {props.multilingual && (
            <BreakdownChart
              title="Langues"
              rows={props.languages}
              loading={props.loading}
              emptyText="Aucune langue enregistrée sur la période."
            />
          )}
          <BreakdownChart
            title="Appareils"
            rows={props.devices}
            loading={props.loading}
            emptyText="Aucun appareil enregistré sur la période."
          />
        </div>
      </div>
    </>
  );
}
