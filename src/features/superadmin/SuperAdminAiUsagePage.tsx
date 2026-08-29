// Superadmin › Assistant IA — ce que chaque collectivité coûte ce mois-ci.
//
// L'écran que la gamme n'avait nulle part : la fiche d'une organisation dit
// « combien a dépensé celle-ci, et par quelle application » ; celui-ci dit
// « lesquelles me coûtent, et lesquelles ne sont pas bordées ». Il a vécu dans
// Iris jusqu'au 2026-08-29, où il n'avait plus de sens : le budget est celui
// de la collectivité, toute la gamme y puise, et Iris n'en voit qu'une part.
//
// ⚠️ CET ÉCRAN N'ÉCRIT RIEN, et c'est délibéré. Poser un plafond se fait sur
// la fiche de la collectivité — une seule porte, un seul dialogue. Un second
// formulaire de réglage ici serait un endroit de plus à corriger le jour où la
// règle change, pour une commodité de deux clics.

import { Link } from "react-router-dom";
import { AlertTriangle, Gauge, Infinity as InfinityIcon, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  formatTokens,
  nextRenewalIso,
  renewalLabel,
  type QuotaTone,
} from "@/features/superadmin/organizations/aiQuota";
import { usageTotals } from "./aiUsageAll";
import { useAllAiUsage } from "./useAllAiUsage";

const BAR_TONE: Record<QuotaTone, string> = {
  ok: "bg-primary",
  warn: "bg-amber-500",
  critical: "bg-destructive",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function SuperAdminAiUsagePage() {
  const { rows, period, isLoading, isError } = useAllAiUsage();
  const totals = usageTotals(rows);
  const renewal = renewalLabel(nextRenewalIso());

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assistant IA</h1>
        <p className="text-muted-foreground">
          Jetons consommés par collectivité, toutes applications Edilumen confondues.
          Période {period} — le crédit repart le {renewal}, sans intervention.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Jetons engagés ce mois</CardTitle>
              <p className="text-2xl font-bold tabular-nums">{formatTokens(totals.engaged)}</p>
              <p className="text-xs text-muted-foreground">
                {totals.active} collectivité{totals.active > 1 ? "s" : ""} active
                {totals.active > 1 ? "s" : ""}
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <InfinityIcon className="size-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Sans plafond</CardTitle>
              <p className="text-2xl font-bold tabular-nums">{totals.unlimited}</p>
              <p className="text-xs text-muted-foreground">
                Collectivités qui peuvent dépenser sans borne
              </p>
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
              <AlertTriangle className="size-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">Au-delà de 80 %</CardTitle>
              <p className="text-2xl font-bold tabular-nums">{totals.atRisk}</p>
              <p className="text-xs text-muted-foreground">
                Plafonds bientôt — ou déjà — atteints
              </p>
            </div>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
            Consommation du mois
          </CardTitle>
          <CardDescription>
            Le plafond se règle sur la fiche de la collectivité — cliquez son nom.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
          ) : isError ? (
            <EmptyState message="La consommation n'a pas pu être lue. Réessayez dans un instant." />
          ) : rows.length === 0 ? (
            <EmptyState message="Aucune collectivité." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
                    <th className="py-2 pr-4">Collectivité</th>
                    <th className="py-2 pr-4">Plafond</th>
                    <th className="py-2 pr-4">Engagé</th>
                    <th className="w-[180px] py-2 pr-4">Consommation</th>
                    <th className="py-2">Plafond modifié le</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.organizationId} className="border-b border-border last:border-b-0">
                      <td className="py-3 pr-4 font-semibold">
                        <Link
                          to={`/superadmin/organisations/${row.organizationId}?section=ia`}
                          className="hover:text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {row.view.unlimited ? (
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <InfinityIcon className="size-3.5" aria-hidden="true" />
                            {row.updatedAt && !row.isActive ? "désactivé" : "aucun"}
                          </span>
                        ) : (
                          formatTokens(row.view.limit ?? 0)
                        )}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatTokens(row.view.engaged)}
                        {row.view.reserved > 0 ? (
                          <span className="text-muted-foreground">
                            {" "}(dont {formatTokens(row.view.reserved)} en cours)
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4">
                        {row.view.unlimited ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <span
                                className={cn("block h-full rounded-full", BAR_TONE[row.view.tone])}
                                style={{ width: `${row.view.percent}%` }}
                              />
                            </span>
                            <span className="w-9 text-right text-xs font-semibold tabular-nums">
                              {row.view.percent}%
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {row.updatedAt ? formatDateTime(row.updatedAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
