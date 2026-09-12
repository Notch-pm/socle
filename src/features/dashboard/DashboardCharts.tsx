/**
 * Les graphiques du tableau de bord — chargés en `React.lazy` depuis
 * `DashboardPage`.
 *
 * ⚠️ POURQUOI UN MODULE À PART : ApexCharts pèse ~130 Ko compressé. Les tuiles
 * de chiffres, elles, sont là dès la première requête — et c'est l'accueil de
 * l'application, la page qu'un agent ouvre en arrivant. Faire attendre des
 * nombres derrière une bibliothèque de dessin serait payer le graphique deux
 * fois.
 */

import type { ApexOptions } from "apexcharts";
import { ReactApexChart } from "./charts/ReactApexChart";
import { ChartCard } from "./charts/ChartCard";
import {
  CHART_COLORS,
  FONT_FAMILY,
  baseChart,
  baseGrid,
  baseLegend,
  baseTooltip,
  baseXAxis,
  baseYAxis,
  integerAxisLabel,
} from "./charts/chartConfig";
import type { ActivationRow } from "./dashboardStats";
import {
  breakdownLabel,
  pageLabel,
  type Audience,
  type AudienceBreakdown,
  type SeriesPoint,
} from "./audience";

// --------------------------------------------------------------------------
// Démarches activées par organisme
// --------------------------------------------------------------------------

function ActivationsChart({ rows, loading }: { rows: ActivationRow[]; loading: boolean }) {
  const categories = rows.map((r) => r.name);
  const values = rows.map((r) => r.count);
  const max = Math.max(...values, 1);

  const options: ApexOptions = {
    chart: { ...baseChart, type: "bar", id: "activations-par-organisme" },
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "60%" } },
    colors: [CHART_COLORS[0]],
    xaxis: {
      categories,
      tickAmount: Math.min(max, 8),
      labels: { style: { fontFamily: FONT_FAMILY, fontSize: "11px" }, formatter: integerAxisLabel },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { fontFamily: FONT_FAMILY, fontSize: "11px" } } },
    grid: baseGrid,
    tooltip: { ...baseTooltip, y: { formatter: (v) => `${v} démarche(s) activée(s)` } },
    dataLabels: { enabled: false },
  };

  return (
    <ChartCard
      title="Démarches activées par organisme"
      loading={loading}
      empty={rows.length === 0}
      emptyText="Aucun organisme n'a encore activé de démarche."
    >
      <ReactApexChart
        options={options}
        series={[{ name: "Démarches activées", data: values }]}
        type="bar"
        // La hauteur suit le nombre de barres : une hauteur fixe écraserait
        // trente services ou laisserait un grand vide sous deux.
        height={Math.max(200, categories.length * 44)}
      />
    </ChartCard>
  );
}

// --------------------------------------------------------------------------
// Visites et pages vues
// --------------------------------------------------------------------------

function TrafficChart({ points, loading }: { points: SeriesPoint[]; loading: boolean }) {
  const empty = points.every((p) => p.views === 0 && p.visits === 0);

  const options: ApexOptions = {
    chart: { ...baseChart, type: "area", id: "frequentation", stacked: false },
    // ⚠️ Deux séries qui s'emboîtent (toute visite est aussi une page vue) :
    // `stacked` les additionnerait et annoncerait un trafic qui n'existe pas.
    colors: [CHART_COLORS[0], CHART_COLORS[2]],
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 0.2, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 90, 100] },
    },
    // ⚠️ SURTOUT PAS DE `tickAmount` ICI. Sur un axe de CATÉGORIES, ApexCharts
    // 3.54 ne s'en sert pas pour espacer les étiquettes : il traite la valeur
    // comme le nombre de points, et l'aire ne se dessine plus du tout —
    // vérifié dans un vrai navigateur le 2026-09-12, sur 30 jours avec
    // `tickAmount: 10` : série figée à `x = 0`, largeur nulle, axe étiqueté du
    // 14 au 23 août au lieu des trente jours demandés. Sur 7 jours, où la
    // valeur coïncidait avec le nombre de points, le bogue ne se voyait pas —
    // d'où un graphique vide qui se remplissait dès qu'on touchait à la
    // période. `hideOverlappingLabels` (actif par défaut) fait le travail qu'on
    // croyait lui confier.
    xaxis: { ...baseXAxis, categories: points.map((p) => p.label) },
    yaxis: baseYAxis,
    grid: baseGrid,
    legend: baseLegend,
    tooltip: { ...baseTooltip, shared: true },
    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 4 } },
  };

  return (
    <ChartCard
      title="Visites et pages vues"
      loading={loading}
      empty={empty}
      emptyText="Aucune visite enregistrée sur la période."
    >
      <ReactApexChart
        options={options}
        series={[
          { name: "Pages vues", data: points.map((p) => p.views) },
          { name: "Visites", data: points.map((p) => p.visits) },
        ]}
        type="area"
        height={300}
      />
    </ChartCard>
  );
}

// --------------------------------------------------------------------------
// Pages les plus vues
// --------------------------------------------------------------------------

function TopPagesChart({ audience, loading }: { audience: Audience; loading: boolean }) {
  const rows = audience.pages.filter((p) => p.views > 0);
  const categories = rows.map(pageLabel);
  const values = rows.map((p) => p.views);
  const max = Math.max(...values, 1);

  const options: ApexOptions = {
    chart: { ...baseChart, type: "bar", id: "pages-les-plus-vues" },
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "60%" } },
    colors: [CHART_COLORS[2]],
    xaxis: {
      categories,
      tickAmount: Math.min(max, 8),
      labels: { style: { fontFamily: FONT_FAMILY, fontSize: "11px" }, formatter: integerAxisLabel },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { fontFamily: FONT_FAMILY, fontSize: "11px" }, maxWidth: 220 } },
    grid: baseGrid,
    tooltip: { ...baseTooltip, y: { formatter: (v) => `${v} page(s) vue(s)` } },
    dataLabels: { enabled: false },
  };

  return (
    <ChartCard
      title="Pages les plus vues"
      loading={loading}
      empty={rows.length === 0}
      emptyText="Aucune page vue sur la période."
    >
      <ReactApexChart
        options={options}
        series={[{ name: "Pages vues", data: values }]}
        type="bar"
        height={Math.max(200, categories.length * 40)}
      />
    </ChartCard>
  );
}

// --------------------------------------------------------------------------
// Ventilations (langues, appareils)
// --------------------------------------------------------------------------

interface BreakdownChartProps {
  title: string;
  rows: AudienceBreakdown[];
  loading: boolean;
  emptyText: string;
}

function BreakdownChart({ title, rows, loading, emptyText }: BreakdownChartProps) {
  const options: ApexOptions = {
    chart: { ...baseChart, type: "donut", id: `ventilation-${title}` },
    labels: rows.map(breakdownLabel),
    colors: CHART_COLORS,
    plotOptions: {
      pie: {
        donut: {
          size: "60%",
          labels: { show: true, total: { show: true, label: "Pages vues", fontSize: "13px" } },
        },
      },
    },
    tooltip: { ...baseTooltip, y: { formatter: (v) => `${v} page(s) vue(s)` } },
    legend: baseLegend,
    dataLabels: { style: { fontFamily: FONT_FAMILY, fontSize: "11px" } },
  };

  return (
    <ChartCard title={title} loading={loading} empty={rows.length === 0} emptyText={emptyText}>
      <ReactApexChart
        options={options}
        series={rows.map((r) => r.views)}
        type="donut"
        height={280}
      />
    </ChartCard>
  );
}

// --------------------------------------------------------------------------
// La composition, en un seul export
// --------------------------------------------------------------------------

export interface DashboardChartsProps {
  activations: ActivationRow[];
  statsLoading: boolean;
  points: SeriesPoint[];
  audience: Audience;
  audienceLoading: boolean;
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

/**
 * Un seul export par défaut, pour que `React.lazy` n'ait rien à recomposer :
 * le module entier (ApexCharts compris) arrive derrière un seul `import()`.
 */
export default function DashboardCharts(props: DashboardChartsProps) {
  return (
    <>
      <ActivationsChart rows={props.activations} loading={props.statsLoading} />
      <TrafficChart points={props.points} loading={props.audienceLoading} />
      {/* `items-start` : les deux colonnes n'ont pas la même hauteur naturelle
          (une liste de pages contre un ou deux camemberts). Sans lui, la plus
          courte s'étire et laisse un grand vide sous son graphique. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <TopPagesChart audience={props.audience} loading={props.audienceLoading} />
        <div className="flex flex-col gap-4">
          {props.multilingual && (
            <BreakdownChart
              title="Langues"
              rows={props.languages}
              loading={props.audienceLoading}
              emptyText="Aucune langue enregistrée sur la période."
            />
          )}
          <BreakdownChart
            title="Appareils"
            rows={props.devices}
            loading={props.audienceLoading}
            emptyText="Aucun appareil enregistré sur la période."
          />
        </div>
      </div>
    </>
  );
}
