import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_TONES, type IntegrationStatus } from "./integrationStatus";
import type { CatalogueIntegration } from "./useIntegrations";

/** Logo du partenaire, ou son initiale quand aucun logo n'est renseigné. */
export function IntegrationLogo({ integration, className }: { integration: CatalogueIntegration; className?: string }) {
  const [broken, setBroken] = React.useState(false);
  const box = cn(
    "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card",
    className,
  );
  if (integration.logo_url && !broken) {
    return (
      <div className={box}>
        <img
          src={integration.logo_url}
          alt={`Logo ${integration.name}`}
          className="max-h-full max-w-full object-contain p-1.5"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }
  return (
    <div className={cn(box, "bg-primary/10 text-lg font-bold text-primary")} aria-hidden="true">
      {integration.name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

export function StatusBadge({ status }: { status: IntegrationStatus }) {
  return (
    <Badge variant={STATUS_TONES[status]} className="gap-1.5">
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/** Applications de la gamme concernées, triées par nom. */
export function applicationNames(integration: CatalogueIntegration): string[] {
  return integration.integration_applications
    .map((link) => shortName(link.applications?.name ?? link.application_id))
    .sort((a, b) => a.localeCompare(b, "fr"));
}

/** « Clara — gestion de courrier » → « Clara » : la carte doit se lire d'un coup d'œil. */
function shortName(name: string): string {
  return name.split(" — ")[0];
}

/**
 * Une carte du catalogue : qui, quel type de connexion, pour quelles
 * applications, dans quel état — et une action. Rien de technique.
 */
export function IntegrationCard({
  integration,
  status,
  action,
}: {
  integration: CatalogueIntegration;
  status: IntegrationStatus;
  action?: React.ReactNode;
}) {
  const applications = applicationNames(integration);
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start gap-4">
        <IntegrationLogo integration={integration} />
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-base">{integration.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{integration.integration_types?.name}</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Applications</p>
          <div className="flex flex-wrap gap-1.5">
            {applications.length > 0 ? (
              applications.map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">Aucune</span>
            )}
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3">
          <StatusBadge status={status} />
          {action}
        </div>
      </CardContent>
    </Card>
  );
}
