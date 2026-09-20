import * as React from "react";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatTokens } from "@/features/ai-usage/aiQuota";
import { useConsumerQuota, useSetConsumerQuota } from "@/features/ai-usage/useConsumerQuota";

/** L'application qui impute les appels de l'assistant du portail (`api_keys.consumer`). */
const ASSISTANT_CONSUMER = "nora";

/**
 * La part du crédit IA que l'assistant du portail a le droit de consommer.
 *
 * Le plafond mensuel d'une collectivité est commun à toutes ses applications.
 * C'était juste tant que tous les appelants étaient des agents ; l'assistant,
 * lui, est ouvert à des visiteurs anonymes. Sans borne propre, il peut épuiser
 * en quelques heures le crédit dont Iris et Clara ont besoin pour instruire.
 *
 * ⚠️ Réglé ICI, à côté de l'interrupteur : on ne devrait pas pouvoir ouvrir
 * l'un sans voir l'autre. L'écran AVERTIT quand l'assistant est ouvert sans
 * borne ; il ne l'interdit pas — une collectivité de démonstration peut s'en
 * passer, et c'est au super administrateur d'en juger.
 *
 * ⚠️ « Lever la borne » CONSERVE la valeur (le réglage gouverne l'usage, pas la
 * donnée) : la rétablir est un geste, pas une ressaisie.
 */
export function PortalAssistantBudget({
  organizationId,
  assistantEnabled,
}: {
  organizationId: string;
  assistantEnabled: boolean;
}) {
  const quota = useConsumerQuota(organizationId, ASSISTANT_CONSUMER);
  const setQuota = useSetConsumerQuota();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const configured = quota.data?.configuredLimit ?? null;
  const active = quota.data?.isActive ?? false;

  // La saisie suit la valeur enregistrée tant que l'on n'a rien tapé.
  React.useEffect(() => {
    setValue(configured === null ? "" : String(configured));
  }, [configured]);

  function parseValue(): number | null {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  async function save(isActive: boolean) {
    setError(null);
    const limit = isActive ? parseValue() : (configured ?? parseValue());
    if (limit === null) {
      setError("La borne doit être un nombre de jetons strictement positif.");
      return;
    }
    try {
      await setQuota.mutateAsync({
        organizationId,
        consumer: ASSISTANT_CONSUMER,
        limitTokens: limit,
        isActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement refusé.");
    }
  }

  if (quota.isLoading) return <div className="h-20 animate-pulse rounded-lg bg-muted/40" />;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        {active ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        ) : (
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Part du crédit IA réservée à l'assistant</span>
          <span className="text-xs text-muted-foreground">
            {active && configured !== null
              ? `Bornée à ${formatTokens(configured)} jetons par mois — ${formatTokens(
                  (quota.data?.used ?? 0) + (quota.data?.reserved ?? 0),
                )} engagés ce mois-ci. Au-delà, l'assistant s'efface jusqu'au mois suivant ; les démarches et les agents ne sont pas touchés.`
              : assistantEnabled
                ? "Aucune borne : l'assistant, ouvert à des visiteurs anonymes, peut consommer tout le crédit IA de la collectivité — celui dont ses agents ont besoin."
                : "Aucune borne. À poser avant d'ouvrir l'assistant au public."}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Borne mensuelle (jetons)" htmlFor="assistant-budget" className="min-w-[14rem] flex-1">
          <Input
            id="assistant-budget"
            inputMode="numeric"
            value={value}
            placeholder="ex. 500 000"
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <Button type="button" onClick={() => void save(true)} disabled={setQuota.isPending}>
          {setQuota.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {active ? "Modifier la borne" : configured !== null ? "Rétablir la borne" : "Poser la borne"}
        </Button>
        {active ? (
          <Button type="button" variant="ghost" onClick={() => void save(false)} disabled={setQuota.isPending}>
            Lever la borne
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Repère : une conversation consomme de l'ordre de 25 000 jetons. La borne s'ajoute au plafond de
        la collectivité, elle ne le remplace pas.
      </p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
