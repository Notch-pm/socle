import * as React from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AiUsageOverview } from "@/features/ai-usage/AiUsageOverview";
import { formatTokens, nextRenewalIso, renewalLabel } from "@/features/ai-usage/aiQuota";
import { useAiUsage, useDeleteAiQuota, useSetAiQuota } from "@/features/ai-usage/useAiUsage";

/**
 * Assistant IA d'une collectivité : le plafond mensuel de jetons et ce qui a
 * été consommé, par application.
 *
 * Le RÉGLAGE et la LECTURE au même endroit — dans le Socle, c'est une seule
 * personne. Les séparer reproduirait l'arrangement d'Iris, qui n'existait que
 * parce que les deux publics étaient dans deux produits différents.
 *
 * ⚠️ CE FICHIER NE PORTE PLUS QUE LA PART QUI ÉCRIT. Les trois cartes vivent
 * dans `AiUsageOverview`, parce que l'administrateur de la collectivité les
 * consulte lui aussi depuis `/consommation-ia` — mais sans le bouton
 * ci-dessous : le budget se négocie avec l'éditeur, il ne se sert pas. Le
 * serveur dit d'ailleurs la même chose, `set_ai_usage_quota` gardant sa garde
 * `is_super_admin()` à l'intérieur de la fonction.
 */

export function AiUsageSection({ organizationId }: { organizationId: string }) {
  const usage = useAiUsage(organizationId);
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
    <>
      <AiUsageOverview
        organizationId={organizationId}
        action={
          <Button type="button" variant="outline" size="sm" onClick={openDialog}>
            <Pencil className="size-4" /> Modifier
          </Button>
        }
      />

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
    </>
  );
}
