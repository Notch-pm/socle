import * as React from "react";
import { Gauge, Infinity as InfinityIcon, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  formatTokens,
  nextRenewalIso,
  renewalLabel,
  type AiShare,
  type QuotaTone,
  type QuotaView,
  type SplitView,
} from "./aiQuota";
import { useAiUsage, useAiUsageEvents } from "./useAiUsage";

/**
 * Ce que la consommation IA d'une collectivité donne à VOIR : le plafond et sa
 * jauge, la répartition entre l'assistant du portail et les agents, la
 * ventilation par application, les derniers appels.
 *
 * ⚠️ CE COMPOSANT N'ÉCRIT RIEN. C'est ce qui lui permet de servir les deux
 * publics — le super administrateur, qui pose le plafond, et l'administrateur
 * de la collectivité, qui le consulte. Les parties qui écrivent sont glissées
 * par le premier via `action` (le plafond) et `shareAction` (la répartition) ;
 * le second ne passe rien, et il n'y a alors aucun chemin vers l'écriture
 * dans l'arbre rendu. Deux copies de ces cartes auraient divergé au premier
 * ajustement de libellé.
 *
 * ⚠️ Le plafond est GLOBAL à la collectivité : Iris, Clara et les suivants
 * puisent au même seau. Depuis le 2026-09-22, une PART peut en être réservée
 * à l'assistant du portail — les agents disposent du reste, et y sont bornés.
 * La table « par application » ne ventile que le journal — c'est ce qui
 * permet de répondre à « combien me coûte ce client ? » ET à « qui a
 * dépensé ? » sans deux systèmes de comptage.
 *
 * ⚠️ Pas de colonne de contenu dans le journal, et il n'y en aura pas : le
 * Socle ne conserve ni le prompt ni la réponse.
 */

const BAR_TONE: Record<QuotaTone, string> = {
  ok: "bg-primary",
  warn: "bg-amber-500",
  critical: "bg-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  reserved: "en cours",
  completed: "abouti",
  failed: "échec",
  timeout: "expiré",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/** « 25 % du plafond » ou « 500 000 jetons » — la part telle qu'elle est réglée. */
export function shareSettingLabel(share: AiShare): string {
  if (share.mode === "percent" && share.percent !== null) return `${share.percent} % du plafond`;
  return `${formatTokens(share.configuredTokens ?? 0)} jetons`;
}

function ShareGauge({ label, view, ariaLabel }: { label: string; view: QuotaView; ariaLabel: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm">{label}</span>
        <span className="text-sm font-semibold tabular-nums">
          {view.unlimited
            ? `${formatTokens(view.engaged)} engagés · illimité`
            : `${formatTokens(view.engaged)} / ${formatTokens(view.limit ?? 0)}`}
        </span>
      </div>
      {view.unlimited ? null : (
        <div
          role="progressbar"
          aria-valuenow={view.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={ariaLabel}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <span
            className={`block h-full rounded-full ${BAR_TONE[view.tone]}`}
            style={{ width: `${view.percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * La répartition, dans chacun de ses états. Les cas limites sont dits en une
 * phrase, jamais cachés : un pourcentage sans plafond est un réglage SANS
 * EFFET, et l'écran doit le dire avant que quelqu'un ne s'y fie.
 */
function ShareBlock({ split, shareAction }: { split: SplitView; shareAction?: React.ReactNode }) {
  const share = split.share;
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Répartition</span>
          <span className="text-xs text-muted-foreground">
            Une part du plafond réservée à l'assistant du portail usagers ; les agents disposent du
            reste, et y sont bornés.
          </span>
        </div>
        {shareAction}
      </div>

      {split.state === "none" ? (
        <p className="text-sm text-muted-foreground">
          Pas de part réservée : toutes les applications puisent dans le plafond commun.
          {share && !share.isActive
            ? ` La part de l'assistant est levée ; sa valeur (${shareSettingLabel(share)}) est conservée.`
            : ""}
        </p>
      ) : split.state === "percent-without-quota" && share ? (
        <p className="text-sm text-muted-foreground">
          La part de l'assistant est réglée à {shareSettingLabel(share)}, mais aucun plafond n'est
          posé : elle est <strong>sans effet</strong> tant qu'il n'y a rien à partager.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {split.state === "share-without-quota" ? (
            <p className="text-sm text-muted-foreground">
              Sans plafond commun : l'assistant est borné à sa part, les agents restent illimités.
            </p>
          ) : null}
          {split.usagers ? (
            <ShareGauge
              label={`Assistant du portail (usagers)${share ? ` · ${shareSettingLabel(share)}` : ""}`}
              view={split.usagers}
              ariaLabel="Part de l'assistant"
            />
          ) : null}
          {split.agents ? (
            <ShareGauge label="Agents (le reste)" view={split.agents} ariaLabel="Part des agents" />
          ) : null}
        </div>
      )}
    </div>
  );
}

export interface AiUsageOverviewProps {
  organizationId: string;
  /** Commande de réglage du plafond, glissée par le seul écran qui écrit (superadmin). */
  action?: React.ReactNode;
  /** Commande de réglage de la répartition — même règle. */
  shareAction?: React.ReactNode;
}

export function AiUsageOverview({ organizationId, action, shareAction }: AiUsageOverviewProps) {
  const usage = useAiUsage(organizationId);
  const events = useAiUsageEvents(organizationId);
  const renewsAt = nextRenewalIso();
  const view = usage.data?.view;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
              Plafond mensuel
            </CardTitle>
            <CardDescription>
              Jetons que l'assistant IA peut consommer sur un mois pour cette collectivité,
              <strong> toutes applications confondues</strong>. Période {usage.data?.period ?? "—"} ·
              renouvellement le {renewalLabel(renewsAt)}.
            </CardDescription>
          </div>
          {action}
        </CardHeader>
        <CardContent>
          {usage.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Lecture…
            </p>
          ) : usage.isError ? (
            <p className="text-sm text-muted-foreground">
              La consommation n'a pas pu être lue. Réessayez dans un instant.
            </p>
          ) : view?.unlimited ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <InfinityIcon className="size-4" aria-hidden="true" />
              {usage.data?.updatedAt && !usage.data.isActive
                ? "Plafond désactivé — consommation illimitée."
                : "Aucun plafond configuré — consommation illimitée."}
              {view.used > 0 ? ` ${formatTokens(view.used)} jetons consommés ce mois.` : ""}
            </p>
          ) : view ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-muted-foreground">Jetons engagés ce mois</span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatTokens(view.engaged)} / {formatTokens(view.limit ?? 0)}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={view.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Consommation de jetons IA"
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
              >
                <span
                  className={`block h-full rounded-full ${BAR_TONE[view.tone]}`}
                  style={{ width: `${view.percent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatTokens(view.remaining ?? 0)} jetons restants
                {view.reserved > 0 ? ` · dont ${formatTokens(view.reserved)} en cours de traitement` : ""}
              </p>
            </div>
          ) : null}

          {usage.data ? <ShareBlock split={usage.data.split} shareAction={shareAction} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consommation par application</CardTitle>
          <CardDescription>
            Le plafond est commun ; le journal, lui, sait qui a dépensé. Appels aboutis de la
            période.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(usage.data?.byConsumer.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune consommation sur cette période.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold text-muted-foreground">
                  <th className="py-2 pr-4">Application</th>
                  <th className="py-2 pr-4">Fonctionnalité</th>
                  <th className="py-2 pr-4 text-right">Appels</th>
                  <th className="py-2 text-right">Jetons</th>
                </tr>
              </thead>
              <tbody>
                {usage.data?.byConsumer.map((row, i) => (
                  <tr key={`${row.consumer}-${row.feature ?? i}`} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-semibold">{row.consumer}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{row.feature ?? "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{row.calls}</td>
                    <td className="py-2 text-right tabular-nums">{formatTokens(row.tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Derniers appels</CardTitle>
          <CardDescription>
            Le Socle ne conserve <strong>ni le prompt ni la réponse</strong> : ce journal ne
            porte que des compteurs, des identifiants et des horodatages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(events.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun appel sur cette période.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold text-muted-foreground">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Application</th>
                  <th className="py-2 pr-4">Fonctionnalité</th>
                  <th className="py-2 pr-4">État</th>
                  <th className="py-2 text-right">Jetons</th>
                </tr>
              </thead>
              <tbody>
                {events.data?.map((e) => (
                  <tr key={e.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 text-muted-foreground">{formatDateTime(e.created_at)}</td>
                    <td className="py-2 pr-4 font-semibold">{e.consumer}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{e.feature ?? "—"}</td>
                    <td className="py-2 pr-4">{STATUS_LABELS[e.status] ?? e.status}</td>
                    <td className="py-2 text-right tabular-nums">
                      {e.actual_tokens === null
                        ? <span className="text-muted-foreground">—</span>
                        : formatTokens(e.actual_tokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
