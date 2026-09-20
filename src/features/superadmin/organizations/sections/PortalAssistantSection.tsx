import { MessagesSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/features/auth/AuthProvider";
import { PortalAssistantBudget } from "@/features/superadmin/organizations/sections/PortalAssistantBudget";
import {
  PORTAL_ASSISTANT_CLOSED,
  usePortalAssistantSettings,
  useSetPortalAssistant,
  type PortalAssistantFlags,
} from "@/features/superadmin/organizations/usePortalAssistant";

/**
 * L'assistant conversationnel du site de démarches (Nora) — l'interrupteur.
 *
 * Réglé ICI, côté super admin, et nulle part ailleurs : un assistant public
 * dépense le crédit IA de la collectivité, que ses agents partagent (Iris,
 * Clara). L'ouvrir est une décision de mise en service, prise avec le plafond —
 * d'où le renvoi vers la section « Assistant IA ».
 *
 * Deux niveaux, le second sous le premier : renseigner et orienter, puis
 * recueillir un formulaire dans la conversation. ⚠️ Couper le premier CONSERVE
 * le second (le réglage gouverne l'usage, pas la donnée) : l'API publique cesse
 * de le servir, et le rouvrir rend le réglage tel qu'il était.
 */
export function PortalAssistantSection({ organizationId }: { organizationId: string }) {
  const { profile } = useAuth();
  const { data: settings, isLoading } = usePortalAssistantSettings(organizationId);
  const setAssistant = useSetPortalAssistant();

  const flags: PortalAssistantFlags = settings
    ? { enabled: settings.enabled, deposit_enabled: settings.deposit_enabled }
    : PORTAL_ASSISTANT_CLOSED;

  const save = (next: Partial<PortalAssistantFlags>) =>
    setAssistant.mutate({ organizationId, ...flags, ...next, updatedBy: profile?.id });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <MessagesSquare className="size-5 text-primary" />
          <div>
            <CardTitle className="text-base">Assistant du portail usagers</CardTitle>
            <CardDescription>
              Un assistant conversationnel sur le site de démarches. Il ne s'appuie que sur ce que
              la collectivité écrit pour ses usagers — descriptifs, pièces annoncées, FAQ usager,
              formulaires — jamais sur la base de connaissances des agents.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted/40" />
        ) : (
          <>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Proposer l'assistant sur le site</span>
                <span className="text-xs text-muted-foreground">
                  Il renseigne l'usager et l'oriente vers la bonne démarche. Effet immédiat, sans
                  publication du site.
                </span>
              </span>
              <Switch
                checked={flags.enabled}
                disabled={setAssistant.isPending}
                aria-label="Proposer l'assistant sur le site"
                onCheckedChange={(enabled) => save({ enabled })}
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Déposer une demande par la conversation</span>
                <span className="text-xs text-muted-foreground">
                  {flags.enabled
                    ? "L'assistant recueille les réponses du formulaire ; l'usager relit et envoie lui-même."
                    : "Sans effet tant que l'assistant n'est pas proposé — le réglage est conservé."}
                </span>
              </span>
              <Switch
                checked={flags.deposit_enabled}
                disabled={setAssistant.isPending || !flags.enabled}
                aria-label="Déposer une demande par la conversation"
                onCheckedChange={(deposit_enabled) => save({ deposit_enabled })}
              />
            </label>

            {/* La borne de l'assistant, à côté de son interrupteur : on ne devrait
                pas pouvoir ouvrir l'un sans voir l'autre. */}
            <PortalAssistantBudget organizationId={organizationId} assistantEnabled={flags.enabled} />

            <p className="text-xs text-muted-foreground">
              L'assistant puise dans le crédit IA de la collectivité, comme Iris et Clara.{" "}
              <Link className="underline" to="?section=ia">
                Vérifier le plafond
              </Link>{" "}
              avant de l'ouvrir au public. La collectivité doit aussi être abonnée à Nora.
            </p>
          </>
        )}
        {setAssistant.error ? (
          <p className="text-sm text-destructive">{(setAssistant.error as Error).message}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
