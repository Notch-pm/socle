import * as React from "react";
import type { Props } from "react-apexcharts";
import { ReactApexChart } from "./ReactApexChart";

/**
 * `ReactApexChart`, mais qui ne transmet de nouvelles `options`/`series` que
 * si leur CONTENU change.
 *
 * ⚠️ POURQUOI : `react-apexcharts@1.5.0` compare, à chaque rendu dont les
 * props changent d'identité, `JSON.stringify(options)` à la configuration
 * FUSIONNÉE de l'instance (type, hauteur et séries en plus) — la comparaison
 * échoue toujours, et il appelle `updateOptions`. Un parent qui se re-rend
 * pendant l'animation d'entrée (une requête voisine qui arrive : langues,
 * statistiques…) figeait ainsi l'aire « Visites et pages vues » sur sa
 * première image : tous les points à `x = 0`, aucune étiquette de date. Vu
 * dans un vrai navigateur le 2026-10-24, au premier affichage seulement — un
 * changement de période, qui remonte le graphique quand tout est déjà en
 * cache, le dessinait correctement. Le défaut datait de la création du
 * tableau de bord.
 *
 * Le contenu se compare en JSON : les fonctions (formateurs) n'y figurent pas.
 * Elles doivent donc rester des fonctions pures du texte, sans dépendre de
 * données qui changent — c'est le cas de tous les graphiques du Socle.
 *
 * Fichier propre au Socle : `ReactApexChart`, `chartConfig` et `ChartCard`
 * restent des copies d'Iris à l'identique.
 */
export function StableApexChart(props: Props) {
  const optionsKey = JSON.stringify(props.options);
  const seriesKey = JSON.stringify(props.series);
  // Mémorisés sur leur contenu, pas sur leur identité : c'est tout l'objet du composant.
  const options = React.useMemo(() => props.options, [optionsKey]);
  const series = React.useMemo(() => props.series, [seriesKey]);
  return <ReactApexChart {...props} options={options} series={series} />;
}
