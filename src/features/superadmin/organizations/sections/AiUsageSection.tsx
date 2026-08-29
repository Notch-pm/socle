import * as React from "react";
import { Gauge, Infinity as InfinityIcon, Loader2, Pencil } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { formatTokens, nextRenewalIso, renewalLabel, type QuotaTone } from "../aiQuota";
import {
  useAiUsage, useAiUsageEvents, useDeleteAiQuota, useSetAiQuota,
} from "../useAiUsage";

/**
 * Assistant IA d'une collectivité : le plafond mensuel de jetons et ce qui a
 * été consommé, par application.
 *
 * Le RÉGLAGE et la LECTURE au même endroit — dans le Socle, c'est une seule
 * personne. Les séparer reproduirait l'arrangement d'Iris, qui n'existait que
 * parce que les deux publics étaient dans deux produits différents.
 *
 * ⚠️ Le plafond est GLOBAL à la collectivité : Iris, Clara et les suivants
 * puisent au même seau. La table « par application » ne ventile que le
 * journal — c'est ce qui permet de répondre à « combien me coûte ce client ? »
 * ET à « qui a dépensé ? » sans deux systèmes de comptage.
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

export function AiUsageSection({ organizationId }: { organizationId: string }) {
  const usage = useAiUsage(organizationId);
  const events = useAiUsageEvents(organizationId);
  const setQuota = useSetAiQuota();
  const deleteQuota = useDeleteAiQuota();

  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const renewsAt = nextRenewalIso();

  function openDialog() {
    setError(null);
    setValue(usage.data?.view.limit ? String(usage.data.view.limit) : "");
    setOpen(true);
  }

  async function submit() {
    setError(null);
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Le plafond doit être un nombre de jetons strictement positif.");
      return;
    }
    try {
      await setQuota.mutateAsync({ organizationId, limitTokens: parsed });
      setOpen(false);
    } catch (err) {
      // Message du serveur (RPC) — on ne le réécrit pas.
      setError(err instanceof Error ? err.message : "Enregistrement refusé.");
    }
  }

  async function remove() {
    setError(null);
    try {
      await deleteQuota.mutateAsync({ organizationId });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retrait refusé.");
    }
  }

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
          <Button type="button" variant="outline" size="sm" onClick={openDialog}>
            <Pencil className="size-4" /> Modifier
          </Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plafond mensuel de jetons</DialogTitle>
            <DialogDescription>
              Au-delà, l'assistant refuse poliment et nomme la date de renouvellement. Le reste
              des applications continue de fonctionner normalement.
            </DialogDescription>
          </DialogHeader>

          <Field label="Plafond mensuel (jetons)" htmlFor="ai-quota">
            <Input
              id="ai-quota"
              inputMode="numeric"
              value={value}
              placeholder="ex. 2 000 000"
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>

          {view && !view.unlimited ? (
            <p className="text-xs text-muted-foreground">
              Déjà engagé ce mois : {formatTokens(view.engaged)} jetons. Un plafond inférieur
              bloque l'assistant immédiatement, jusqu'au {renewalLabel(renewsAt)}.
            </p>
          ) : null}

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={view?.unlimited || deleteQuota.isPending}
              onClick={() => void remove()}
            >
              {deleteQuota.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Retirer le plafond
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="button" onClick={() => void submit()} disabled={setQuota.isPending}>
                {setQuota.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Enregistrer
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
