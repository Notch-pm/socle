/**
 * L'accueil de l'app par organisation (`/`) — ce qu'un agent voit en arrivant.
 *
 * Deux blocs, et l'ordre n'est pas indifférent : d'abord ce que la
 * collectivité A PARAMÉTRÉ (démarches, usagers, organismes) — les chiffres du
 * Socle, qui est un référentiel —, ensuite ce que son site PRODUIT
 * (fréquentation), qui vient d'ailleurs et n'existe qu'une fois Nora déployé.
 *
 * ⚠️ La fréquentation vide est l'ÉTAT NORMAL tant que le portail ne mesure pas :
 * l'écran le dit (« Aucune visite enregistrée »), il ne se cache pas. Masquer
 * la section ferait chercher un réglage qui n'existe pas.
 */

import * as React from "react";
import { FileText, Users, User, Building2, HeartHandshake, Eye, MousePointerClick, Send } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useWritableRootOrganizations } from "@/features/procedures/useWritableRootOrganizations";
import { useOrganizationLanguages } from "@/features/languages/useOrganizationLanguages";
import { KpiCard } from "./KpiCard";
import { useOrganizationDashboard, usePortalAudience } from "./useDashboard";
import {
  activationRows,
  contactsSubtitle,
  emptyDashboardStats,
  formatCount,
  proceduresSubtitle,
} from "./dashboardStats";
import {
  AUDIENCE_PERIODS,
  DEFAULT_PERIOD,
  PERIOD_LABELS,
  breakdownOf,
  depositSubtitle,
  emptyAudience,
  seriesFor,
  type AudiencePeriod,
} from "./audience";

// ApexCharts pèse ~130 Ko : les tuiles ne l'attendent pas (voir l'en-tête de
// `DashboardCharts`).
const DashboardCharts = React.lazy(() => import("./DashboardCharts"));

function ChartsFallback() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
      <div className="h-72 animate-pulse rounded-lg bg-muted/40" />
    </div>
  );
}

export function DashboardPage() {
  const { data: organizations, isLoading: orgsLoading } = useWritableRootOrganizations();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const organizationId = selectedId ?? organizations[0]?.id ?? null;

  const [period, setPeriod] = React.useState<AudiencePeriod>(DEFAULT_PERIOD);

  const stats = useOrganizationDashboard(organizationId);
  const audienceQuery = usePortalAudience(organizationId, period);
  // La pastille « Langues » n'a de sens que si la collectivité en a plusieurs —
  // même règle que le filtre par organisme du portail : le réglage dit ce que la
  // collectivité VEUT, c'est le contenu qui dit si un découpage a un sens.
  const { data: languages } = useOrganizationLanguages(organizationId ?? undefined);

  const data = stats.data ?? emptyDashboardStats();
  const audience = audienceQuery.data?.audience ?? emptyAudience();
  const range = audienceQuery.data?.range;

  const points = React.useMemo(
    () => (range ? seriesFor(audience, period, range) : []),
    [audience, period, range],
  );

  if (orgsLoading) {
    return (
      <div className="p-6">
        <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble de votre activité." />
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      </div>
    );
  }

  if (organizationId === null) {
    return (
      <div className="p-6">
        <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble de votre activité." />
        {/* Un membre rattaché seulement à des sous-organisations : les chiffres
            se lisent sur la collectivité, et il n'en voit aucune. Le dire, plutôt
            que d'afficher des zéros qui passeraient pour la réalité. */}
        <EmptyState message="Aucune organisation principale à afficher. Les chiffres du tableau de bord se lisent sur une collectivité ; rapprochez-vous de son administrateur pour y être rattaché." />
      </div>
    );
  }

  const statsLoading = stats.isLoading;
  const audienceLoading = audienceQuery.isLoading;

  return (
    <div className="p-6">
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble de votre activité." />

      {organizations.length > 1 && (
        <Field label="Organisation" htmlFor="dashboard-org" className="mb-6 max-w-sm">
          <select
            id="dashboard-org"
            value={organizationId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="flex flex-col gap-8">
        {/* --- Ce que la collectivité a paramétré --------------------------- */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label="Démarches"
            value={formatCount(data.procedures.total)}
            sub={proceduresSubtitle(data.procedures)}
            Icon={FileText}
            href="/demarches"
            loading={statsLoading}
          />
          <KpiCard
            label="Usagers"
            value={formatCount(data.contacts.total)}
            sub={contactsSubtitle(data.contacts)}
            Icon={Users}
            loading={statsLoading}
          />
          <KpiCard
            label="Personnes"
            value={formatCount(data.contacts.personne)}
            Icon={User}
            iconClassName="text-blue-500"
            loading={statsLoading}
          />
          <KpiCard
            label="Entreprises"
            value={formatCount(data.contacts.entreprise)}
            Icon={Building2}
            iconClassName="text-amber-500"
            loading={statsLoading}
          />
          <KpiCard
            label="Associations"
            value={formatCount(data.contacts.association)}
            Icon={HeartHandshake}
            iconClassName="text-violet-500"
            loading={statsLoading}
          />
        </div>

        {/* --- Ce que son site produit -------------------------------------- */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Fréquentation du site de démarches</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Mesure sans cookie : aucune donnée n'est enregistrée sur le poste des visiteurs, et
                une visite est une arrivée sur le site — pas un visiteur unique.
              </p>
            </div>
            <SegmentedControl
              value={period}
              onChange={setPeriod}
              options={AUDIENCE_PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
              aria-label="Période"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="Visites"
              value={formatCount(audience.totals.visits)}
              Icon={MousePointerClick}
              loading={audienceLoading}
            />
            <KpiCard
              label="Pages vues"
              value={formatCount(audience.totals.views)}
              Icon={Eye}
              iconClassName="text-blue-500"
              loading={audienceLoading}
            />
            <KpiCard
              label="Demandes déposées"
              value={formatCount(audience.totals.deposits)}
              sub={depositSubtitle(audience.totals)}
              Icon={Send}
              iconClassName="text-amber-500"
              loading={audienceLoading}
            />
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <React.Suspense fallback={<ChartsFallback />}>
            <DashboardCharts
              activations={activationRows(data)}
              statsLoading={statsLoading}
              points={points}
              audience={audience}
              audienceLoading={audienceLoading}
              languages={breakdownOf(audience, "langue")}
              devices={breakdownOf(audience, "appareil")}
              multilingual={(languages ?? ["fr"]).length > 1}
            />
          </React.Suspense>
        </div>
      </div>
    </div>
  );
}
