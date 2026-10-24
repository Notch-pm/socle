/**
 * `/site-de-demarches/frequentation` — la fréquentation du site de démarches
 * en détail (navigation v2, 2026-10-24) : période, visites et pages vues, pages
 * les plus vues, langues, appareils. Le tableau de bord n'en garde qu'un
 * aperçu sur 30 jours, qui renvoie ici.
 *
 * Mêmes données et mêmes règles que l'ancien bloc du tableau de bord
 * (`usePortalAudience`, `seriesFor`…) — voir la fiche « Tableau de bord et
 * fréquentation ». La collectivité choisie vit dans l'URL (`?org=`), pour que
 * le lien du tableau de bord ouvre la même.
 *
 * ⚠️ La fréquentation vide est l'ÉTAT NORMAL tant que le portail ne mesure pas :
 * les cartes le disent, la page ne se cache pas.
 */

import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useWritableRootOrganizations } from "@/features/procedures/useWritableRootOrganizations";
import { useOrganizationLanguages } from "@/features/languages/useOrganizationLanguages";
import { AUDIENCE_METHOD, AudienceKpis } from "./AudienceKpis";
import { usePortalAudience } from "./useDashboard";
import {
  AUDIENCE_PERIODS,
  DEFAULT_PERIOD,
  PERIOD_LABELS,
  breakdownOf,
  emptyAudience,
  seriesFor,
  type AudiencePeriod,
} from "./audience";

const AudienceCharts = React.lazy(() => import("./AudienceCharts"));

function ChartsFallback() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
      <div className="h-72 animate-pulse rounded-lg bg-muted/40" />
    </div>
  );
}

const TITLE = "Fréquentation";

export function AudiencePage() {
  const { data: organizations, isLoading: orgsLoading } = useWritableRootOrganizations();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("org");
  const organizationId =
    organizations.find((o) => o.id === requested)?.id ?? organizations[0]?.id ?? null;

  const [period, setPeriod] = React.useState<AudiencePeriod>(DEFAULT_PERIOD);
  const audienceQuery = usePortalAudience(organizationId, period);
  // Le camembert « Langues » n'a de sens que si la collectivité en a plusieurs —
  // même règle que le filtre par organisme du portail : le réglage dit ce que la
  // collectivité VEUT, c'est le contenu qui dit si un découpage a un sens.
  const { data: languages } = useOrganizationLanguages(organizationId ?? undefined);

  const audience = audienceQuery.data?.audience ?? emptyAudience();
  const range = audienceQuery.data?.range;
  const points = React.useMemo(
    () => (range ? seriesFor(audience, period, range) : []),
    [audience, period, range],
  );

  const header = <PageHeader section="Site de démarches" title={TITLE} subtitle={AUDIENCE_METHOD} />;

  if (orgsLoading) {
    return (
      <div className="p-6">
        {header}
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      </div>
    );
  }

  if (organizationId === null) {
    return (
      <div className="p-6">
        {header}
        {/* Même cas que le tableau de bord : des zéros passeraient pour la réalité. */}
        <EmptyState message="Aucune organisation principale à afficher. La fréquentation se lit sur une collectivité ; rapprochez-vous de son administrateur pour y être rattaché." />
      </div>
    );
  }

  const loading = audienceQuery.isLoading;

  return (
    <div className="p-6">
      {header}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        {organizations.length > 1 ? (
          <Field label="Organisation" htmlFor="audience-org" className="max-w-sm flex-1">
            <select
              id="audience-org"
              value={organizationId}
              onChange={(e) => setSearchParams({ org: e.target.value }, { replace: true })}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <span />
        )}
        <SegmentedControl
          value={period}
          onChange={setPeriod}
          options={AUDIENCE_PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
          aria-label="Période"
        />
      </div>

      <div className="flex flex-col gap-4">
        <AudienceKpis totals={audience.totals} loading={loading} />
        <React.Suspense fallback={<ChartsFallback />}>
          <AudienceCharts
            points={points}
            audience={audience}
            loading={loading}
            languages={breakdownOf(audience, "langue")}
            devices={breakdownOf(audience, "appareil")}
            multilingual={(languages ?? ["fr"]).length > 1}
          />
        </React.Suspense>
      </div>
    </div>
  );
}
