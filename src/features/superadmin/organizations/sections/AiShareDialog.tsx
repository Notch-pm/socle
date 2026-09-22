import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { formatTokens, resolveShare, type ShareMode } from "@/features/ai-usage/aiQuota";
import { ASSISTANT_CONSUMER, useSetAiShare, type AiUsage } from "@/features/ai-usage/useAiUsage";

/**
 * La RÉPARTITION du plafond : une part réservée à l'assistant du portail
 * usagers, le reste aux agents.
 *
 * Réglée ICI, dans la section « Assistant IA », à côté du plafond qu'elle
 * partage — et nulle part ailleurs : la section de l'assistant la MONTRE et y
 * renvoie. Deux formulaires pour une même valeur seraient deux endroits à
 * corriger le jour où la règle change.
 *
 * Deux unités : un pourcentage VIVANT du plafond (relever le plafond fait
 * suivre la part) ou un nombre de jetons. ⚠️ Le serveur ne refuse que les
 * invalidités intrinsèques ; les cas limites (pourcentage sans plafond, part
 * qui prend tout) sont ACCEPTÉS et rendus inoffensifs en base — ce dialogue
 * les dit, il ne les interdit pas : le réglage gouverne l'usage, pas la donnée.
 *
 * ⚠️ Couper l'interrupteur CONSERVE valeur et mode (`isActive: false` avec
 * la valeur enregistrée) : rétablir est un geste, pas une ressaisie.
 */
export function AiShareDialog({
  organizationId,
  usage,
  open,
  onOpenChange,
}: {
  organizationId: string;
  usage: AiUsage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setShare = useSetAiShare();
  const share = usage.split.share;
  const plafond = usage.view.unlimited ? null : usage.view.limit;

  const [enabled, setEnabled] = React.useState(false);
  const [mode, setMode] = React.useState<ShareMode>("percent");
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // La saisie repart de l'enregistré à chaque ouverture.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setEnabled(share?.isActive ?? false);
    setMode(share?.mode ?? "percent");
    setValue(
      share
        ? share.mode === "percent"
          ? String(share.percent ?? "")
          : String(share.configuredTokens ?? "")
        : "",
    );
  }, [open, share]);

  function parseValue(): number | null {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const parsed = parseValue();
  const preview = resolveShare(
    { mode, tokens: mode === "tokens" ? parsed : null, percent: mode === "percent" ? parsed : null },
    plafond,
  );
  const rest = plafond !== null && preview !== null ? Math.max(plafond - preview, 0) : null;

  const percentOutOfRange = mode === "percent" && parsed !== null && parsed > 99;
  const percentWithoutQuota = enabled && mode === "percent" && plafond === null;
  const takesAll = enabled && mode === "tokens" && plafond !== null && parsed !== null && parsed >= plafond;

  async function submit() {
    setError(null);
    if (!enabled) {
      // Rien d'enregistré et rien à réserver : il n'y a rien à envoyer.
      if (!share) { onOpenChange(false); return; }
      try {
        await setShare.mutateAsync({
          organizationId,
          consumer: ASSISTANT_CONSUMER,
          isActive: false,
          ...(share.mode === "percent"
            ? { percent: share.percent ?? 1 }
            : { tokens: share.configuredTokens ?? 1 }),
        });
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Enregistrement refusé.");
      }
      return;
    }
    if (parsed === null || percentOutOfRange) {
      setError(mode === "percent"
        ? "Le pourcentage doit être compris entre 1 et 99."
        : "La part doit être un nombre de jetons strictement positif.");
      return;
    }
    try {
      await setShare.mutateAsync({
        organizationId,
        consumer: ASSISTANT_CONSUMER,
        isActive: true,
        ...(mode === "percent" ? { percent: parsed } : { tokens: parsed }),
      });
      onOpenChange(false);
    } catch (err) {
      // Message du serveur (RPC) — on ne le réécrit pas.
      setError(err instanceof Error ? err.message : "Enregistrement refusé.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Répartition du plafond</DialogTitle>
          <DialogDescription>
            Réserver une part du plafond à l'assistant du portail usagers : il ne peut pas la
            dépasser, et les agents disposent du reste. Sans part, tout le monde puise dans le
            plafond commun.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Réserver une part à l'assistant du portail usagers</span>
            <span className="text-xs text-muted-foreground">
              {share && !share.isActive && !enabled
                ? "Part levée : sa valeur est conservée, la rétablir est un geste."
                : "Ouvert à des visiteurs anonymes, l'assistant ne peut pas affamer les agents."}
            </span>
          </span>
          <Switch
            checked={enabled}
            aria-label="Réserver une part à l'assistant du portail usagers"
            onCheckedChange={setEnabled}
          />
        </label>

        {enabled ? (
          <div className="flex flex-col gap-3">
            <SegmentedControl
              aria-label="Unité de la part"
              size="sm"
              value={mode}
              onChange={(next) => { setMode(next); setValue(""); setError(null); }}
              options={[
                { value: "percent", label: "Pourcentage du plafond" },
                { value: "tokens", label: "Jetons" },
              ]}
            />
            <Field
              label={mode === "percent" ? "Part de l'assistant (%)" : "Part de l'assistant (jetons)"}
              htmlFor="ai-share"
            >
              <Input
                id="ai-share"
                inputMode="numeric"
                value={value}
                placeholder={mode === "percent" ? "ex. 25" : "ex. 500 000"}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>

            <p className="text-xs text-muted-foreground" data-testid="share-preview">
              {plafond === null
                ? mode === "percent"
                  ? "Aucun plafond actif : un pourcentage est sans effet tant qu'il n'y a rien à partager."
                  : preview !== null
                    ? `Sans plafond commun : l'assistant serait borné à ${formatTokens(preview)} jetons, les agents resteraient illimités.`
                    : "Sans plafond commun, la part borne l'assistant seul."
                : preview !== null && rest !== null
                  ? `Sur un plafond de ${formatTokens(plafond)} jetons : usagers ${formatTokens(preview)} · agents ${formatTokens(rest)}.`
                  : `Sur un plafond de ${formatTokens(plafond)} jetons.`}
            </p>
            {percentWithoutQuota ? null : takesAll ? (
              <p className="text-xs text-amber-700">
                Cette part prend tout le plafond : il ne resterait rien aux agents.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button type="button" onClick={() => void submit()} disabled={setShare.isPending}>
            {setShare.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
