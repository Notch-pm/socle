import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { formatTokens } from "@/features/ai-usage/aiQuota";
import { shareSettingLabel } from "@/features/ai-usage/AiUsageOverview";
import { useAiUsage } from "@/features/ai-usage/useAiUsage";

/**
 * La part du crédit IA réservée à l'assistant du portail — ce qu'elle vaut,
 * vue depuis l'interrupteur de l'assistant.
 *
 * Le plafond mensuel d'une collectivité est commun à toutes ses applications ;
 * l'assistant, ouvert à des visiteurs anonymes, pourrait sans part propre
 * épuiser en quelques heures le crédit dont Iris et Clara ont besoin.
 *
 * ⚠️ MONTRÉE ICI, RÉGLÉE DANS « ASSISTANT IA ». On ne devrait pas pouvoir
 * ouvrir l'assistant sans voir sa part — d'où ce résumé à côté de
 * l'interrupteur. Mais la part se règle avec le plafond qu'elle partage, dans
 * la section IA (`AiShareDialog`), qui reste le seul écran qui écrit ; ce
 * composant n'a aucun chemin vers l'écriture, seulement un lien. L'écran
 * AVERTIT quand l'assistant est ouvert sans part ; il ne l'interdit pas — une
 * collectivité de démonstration peut s'en passer.
 */
export function PortalAssistantBudget({
  organizationId,
  assistantEnabled,
}: {
  organizationId: string;
  assistantEnabled: boolean;
}) {
  const usage = useAiUsage(organizationId);

  if (usage.isLoading) return <div className="h-20 animate-pulse rounded-lg bg-muted/40" />;

  const split = usage.data?.split;
  const share = split?.share ?? null;
  const bounded = split?.state === "split" || split?.state === "share-without-quota";
  const engaged = share ? share.used + share.reserved : 0;

  let text: string;
  if (bounded && share && split?.usagers) {
    text = `Part réservée : ${shareSettingLabel(share)}, soit ${formatTokens(split.usagers.limit ?? 0)} jetons par mois — ${formatTokens(engaged)} engagés ce mois-ci. Au-delà, l'assistant s'efface jusqu'au mois suivant ; les agents disposent du reste.`;
  } else if (split?.state === "percent-without-quota" && share) {
    text = `Part réglée à ${shareSettingLabel(share)}, mais aucun plafond n'est posé : elle est sans effet, et l'assistant peut consommer sans borne.`;
  } else if (share && !share.isActive) {
    text = `Part levée — sa valeur (${shareSettingLabel(share)}) est conservée.${
      assistantEnabled
        ? " L'assistant, ouvert à des visiteurs anonymes, peut consommer tout le crédit IA de la collectivité."
        : ""
    }`;
  } else if (assistantEnabled) {
    text = "Aucune part réservée : l'assistant, ouvert à des visiteurs anonymes, peut consommer tout le crédit IA de la collectivité — celui dont ses agents ont besoin.";
  } else {
    text = "Aucune part réservée. À poser avant d'ouvrir l'assistant au public.";
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        {bounded ? (
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        ) : (
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Part du crédit IA réservée à l'assistant</span>
          <span className="text-xs text-muted-foreground">{text}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Repère : une conversation consomme de l'ordre de 25 000 jetons. La part se règle avec le
        plafond qu'elle partage :{" "}
        <Link className="underline" to="?section=ia">
          Régler la part
        </Link>
        .
      </p>
    </div>
  );
}
