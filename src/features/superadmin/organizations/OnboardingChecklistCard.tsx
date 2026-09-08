import { CircleCheck, Circle, ChevronRight, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useRootOnboardingStatus } from "./useOrganizationsAdmin";
import { buildChecklist, checklistProgress, type ChecklistTarget } from "./onboardingChecklist";

/**
 * La mise en service d'une collectivité, ligne par ligne, en tête de sa page.
 *
 * Chaque ligne mène à la section qui la règle : la check-list ne fait rien
 * elle-même, elle dit où aller. Ce qu'elle lit vient d'une seule RPC
 * (`root_onboarding_status`) — la définition de « prêt » vit en base, pas ici.
 */
export function OnboardingChecklistCard({
  organizationId,
  onOpen,
}: {
  organizationId: string;
  onOpen: (target: Exclude<ChecklistTarget, null>) => void;
}) {
  const status = useRootOnboardingStatus(organizationId);

  if (status.isLoading) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted/40" />;
  }
  if (status.isError || !status.data) {
    return (
      <p className="text-sm text-muted-foreground">
        L'état de mise en service n'a pas pu être lu.
      </p>
    );
  }

  const items = buildChecklist(status.data);
  const progress = checklistProgress(items);
  const complete = progress.done === progress.total;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            Mise en service
          </CardTitle>
          <CardDescription>
            {complete
              ? "Tout ce qu'une collectivité attend est en place."
              : "Ce qu'il reste à faire pour que cette collectivité soit servie de bout en bout."}
          </CardDescription>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
            complete ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
          aria-label={`${progress.done} sur ${progress.total} étapes faites`}
        >
          {progress.done} / {progress.total}
        </span>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => {
            const Icon = item.done ? CircleCheck : Circle;
            const content = (
              <>
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    item.done ? "text-primary" : "text-muted-foreground/60",
                  )}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("text-sm font-medium", item.done && "text-muted-foreground")}>
                    {item.label}
                    {item.optional ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">facultatif</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.detail}</span>
                </span>
              </>
            );
            return (
              <li key={item.key}>
                {item.target ? (
                  <button
                    type="button"
                    onClick={() => onOpen(item.target!)}
                    className="flex w-full items-start gap-3 rounded-md px-1 py-2.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {content}
                    <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                ) : (
                  <div className="flex items-start gap-3 px-1 py-2.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
