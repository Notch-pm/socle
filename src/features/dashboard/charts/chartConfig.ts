// Réglages communs des graphiques — COPIE d'Iris (`src/features/stats/chartConfig.ts`),
// elle-même copie de Clara. Même bibliothèque (ApexCharts), même rendu, même
// palette : l'écran de fréquentation du Socle se lit comme les statistiques
// d'Iris et de Clara.
//
// ⚠️ SEULE DIVERGENCE ASSUMÉE : `FONT_FAMILY`. Socle est en **Inter**, Iris et
// Clara en Nunito Sans (voir « Design system » dans CLAUDE.md — la divergence
// est connue et volontaire). Un graphique dans une autre police que la page qui
// le porte se remarque immédiatement ; le reste du fichier reste à l'identique.
//
// ⚠️ Palette en hexadécimal brut, comme chez Clara et Iris : ApexCharts ne lit
// pas les tokens CSS du design system, il lui faut des couleurs littérales.
// CHART_COLORS[0] est le vert vif de la gamme.

import type { ApexOptions } from "apexcharts";

export const CHART_COLORS = [
  "#0acf83",
  "#ffcd57",
  "#3b82f6",
  "#f97316",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f43f5e",
  "#a3e635",
  "#fb923c",
];

export const FONT_FAMILY = "Inter, ui-sans-serif, system-ui, sans-serif";

export const baseChart: ApexOptions["chart"] = {
  fontFamily: FONT_FAMILY,
  toolbar: {
    show: true,
    tools: {
      download: true,
      selection: true,
      zoom: true,
      zoomin: true,
      zoomout: true,
      pan: true,
      reset: true,
    },
    export: {
      csv: { columnDelimiter: ";" },
    },
  },
  zoom: { enabled: true },
};

export const baseGrid: ApexOptions["grid"] = {
  borderColor: "#e5e7eb",
  strokeDashArray: 4,
};

export const baseXAxis: ApexOptions["xaxis"] = {
  labels: { style: { fontFamily: FONT_FAMILY, fontSize: "11px" } },
  axisBorder: { show: false },
  axisTicks: { show: false },
};

export const baseYAxis: ApexOptions["yaxis"] = {
  labels: {
    style: { fontFamily: FONT_FAMILY, fontSize: "11px" },
    formatter: (v: number) => Math.round(v).toString(),
  },
};

export const baseTooltip: ApexOptions["tooltip"] = {
  style: { fontFamily: FONT_FAMILY },
};

export const baseLegend: ApexOptions["legend"] = {
  position: "bottom",
  fontSize: "11px",
  fontFamily: FONT_FAMILY,
};

/** Étiquettes d'axe entières seulement (une demi-visite n'existe pas). */
export const integerAxisLabel = (v: string | number) => {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : "";
};
