import * as React from "react";
import { Loader2, Pencil, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { AiUsageOverview, shareSettingLabel } from "@/features/ai-usage/AiUsageOverview";
import { formatTokens, nextRenewalIso, renewalLabel } from "@/features/ai-usage/aiQuota";
import { useAiUsage, useSetAiQuota } from "@/features/ai-usage/useAiUsage";
import { AiShareDialog } from "./AiShareDialog";

/**
 * Assistant IA d'une collectivité : le plafond mensuel de jetons, sa
 * répartition entre l'assistant du portail et les agents, et ce qui a été
 * consommé, par application.
 *
 * Le RÉGLAGE et la LECTURE au même endroit — dans le Socle, c'est une seule
 * personne. Les séparer reproduirait l'arrangement d'Iris, qui n'existait que
 * parce que les deux publics étaient dans deux produits différents.
 *
 * ⚠️ CE FICHIER NE PORTE PLUS QUE LA PART QUI ÉCRIT. Les cartes vivent dans
 * `AiUsageOverview`, parce que l'administrateur de la collectivité les
 * consulte lui aussi depuis `/consommation-ia` — mais sans les boutons
 * ci-dessous : le budget se négocie avec l'éditeur, il ne se sert pas. Le
 * serveur dit d'ailleurs la même chose, `set_ai_usage_quota` et
 * `set_ai_usage_consumer_quota` gardant leur garde `is_super_admin()` à
 * l'intérieur de la fonction.
 *
 * Trois états, et le troisième est une DÉCISION : un plafond actif, un plafond
 * « passé en illimité » (la ligne reste, `is_active = false`, la valeur est
 * conservée pour le retour en arrière), et « rien de décidé » — l'état d'une
 * collectivité que personne n'a réglée, illimitée par défaut, que la
 * check-list de mise en service signale. Depuis le provisioning, une racine
 * naît avec le plafond par défaut de la plateforme quand il existe.
 */

export function AiUsageSection({ organizationId }: { organizationId: string }) {
  const usage = useAiUsage(organizationId);
  const setQuota = useSetAiQuota();

  const [open, setOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const renewsAt = nextRenewalIso();

  function openDialog() {
    setError(null);
    const configured = usage.data?.configuredLimit;
    setValue(configured ? String(configured) : "");
    setOpen(true);
  }

  function parseValue(): number | null {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  async function submit() {
    setError(null);
    const parsed = parseValue();
    if (parsed === null) {
      setError("Le plafond doit être un nombre de jetons strictement positif.");
      return;
    }
    try {
      await setQuota.mutateAsync({ organizationId, limitTokens: parsed, isActive: true });
      setOpen(false);
    } catch (err) {
      // Message du serveur (RPC) — on ne le réécrit pas.
      setError(err instanceof Error ? err.message : "Enregistrement refusé.");
    }
  }

  /**
   * Illimité EXPLICITE : la ligne reste, inactive, avec sa valeur. Sans ligne
   * ni saisie, il n'y a rien à conserver — on demande la valeur qui
   * s'appliquerait le jour où l'on rebornerait, plutôt que d'en inventer une.
   */
  async function goUnlimited() {
    setError(null);
    const kept = usage.data?.configuredLimit ?? parseValue();
    if (kept === null) {
      setError("Indiquez le plafond à conserver pour un retour en arrière, puis passez en illimité.");
      return;
    }
    try {
      await setQuota.mutateAsync({ organizationId, limitTokens: kept, isActive: false });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement refusé.");
    }
  }

  const view = usage.data?.view;
  const decided = usage.data?.configuredLimit != null;
  const unlimitedByChoice = decided && usage.data?.isActive === false;

  // Les cas limites du partage, DITS au moment où l'on touche au plafond :
  // la base les accepte et les rend inoffensifs, l'écran doit les nommer.
  const share = usage.data?.split.share ?? null;
  const activeShare = share && share.isActive ? share : null;
  const typed = parseValue();
  const shareTakesAll =
    activeShare?.mode === "tokens" && typed !== null && (activeShare.configuredTokens ?? 0) >= typed;
  const percentWouldIdle = activeShare?.mode === "percent";

  return (
    <>
      <AiUsageOverview
        organizationId={organizationId}
        action={
          <Button type="button" variant="outline" size="sm" onClick={openDialog}>
            <Pencil className="size-4" /> {decided ? "Modifier" : "Décider"}
          </Button>
        }
        shareAction={
          <Button type="button" variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <SlidersHorizontal className="size-4" /> Répartir
          </Button>
        }
      />

      {usage.data ? (
        <AiShareDialog
          organizationId={organizationId}
          usage={usage.data}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plafond mensuel de jetons</DialogTitle>
            <DialogDescription>
              Au-delà, l'assistant refuse poliment et nomme la date de renouvellement. Le reste
              des applications continue de fonctionner normalement.
              {!decided
                ? " Rien n'a encore été décidé pour cette collectivité : elle est illimitée."
                : unlimitedByChoice
                  ? " Cette collectivité est illimitée par choix ; la valeur ci-dessous est celle qu'un retour en arrière rétablirait."
                  : ""}
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

          {activeShare && shareTakesAll ? (
            <p className="text-xs text-amber-700">
              La part de l'assistant ({shareSettingLabel(activeShare)}) atteint ou dépasse ce
              plafond : elle serait bornée au plafond, et il ne resterait rien aux agents.
            </p>
          ) : null}
          {activeShare && percentWouldIdle ? (
            <p className="text-xs text-muted-foreground">
              La part de l'assistant ({shareSettingLabel(activeShare)}) suit ce plafond. Passer en
              illimité la laisserait sans effet.
            </p>
          ) : null}

          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={unlimitedByChoice || setQuota.isPending}
              onClick={() => void goUnlimited()}
            >
              Passer en illimité
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="button" onClick={() => void submit()} disabled={setQuota.isPending}>
                {setQuota.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                {unlimitedByChoice ? "Rétablir ce plafond" : "Enregistrer"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
