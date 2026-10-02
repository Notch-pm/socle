import * as React from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntegrationCard } from "./IntegrationCard";
import { IntegrationConfigDialog } from "./IntegrationConfigDialog";
import { IntegrationGrid } from "./IntegrationGrid";
import { organizationStatus } from "./integrationStatus";
import {
  useIntegrationTypes,
  useIntegrationsCatalogue,
  useOrganizationIntegrations,
} from "./useIntegrations";

/**
 * Intégrations d'une collectivité (racine) — fiche client du super
 * administrateur. Mêmes cartes que le catalogue, avec l'état de CETTE
 * collectivité ; « Configurer » ouvre la fiche détaillée.
 */
export function IntegrationsSection({ organizationId }: { organizationId: string }) {
  const { data: types, isLoading: typesLoading } = useIntegrationTypes();
  const { data: catalogue, isLoading: catalogueLoading } = useIntegrationsCatalogue();
  const { data: configs, isLoading: configsLoading } = useOrganizationIntegrations(organizationId);
  const [openId, setOpenId] = React.useState<string | null>(null);

  if (typesLoading || catalogueLoading || configsLoading) {
    return <div className="h-32 animate-pulse rounded-lg bg-muted/40" />;
  }

  const configFor = (integrationId: string) =>
    configs?.find((entry) => entry.config.integration_id === integrationId) ?? null;
  const open = catalogue?.find((integration) => integration.id === openId) ?? null;
  const openEntry = open ? configFor(open.id) : null;

  return (
    <>
      <IntegrationGrid
        types={types ?? []}
        integrations={catalogue ?? []}
        showEmptyTypes={false}
        renderCard={(integration) => {
          const entry = configFor(integration.id);
          const status = organizationStatus(integration, entry?.config, entry?.secretKeys);
          // Une offre retirée reste consultable si la collectivité l'avait configurée.
          const openable = status !== "soon" && (status !== "disabled" || entry !== null);
          return (
            <IntegrationCard
              integration={integration}
              status={status}
              action={
                openable ? (
                  <Button size="sm" onClick={() => setOpenId(integration.id)}>
                    <Settings2 className="size-4" />
                    Configurer
                  </Button>
                ) : null
              }
            />
          );
        }}
      />

      {open ? (
        <IntegrationConfigDialog
          // Remonté à chaque ouverture : le formulaire repart de l'enregistré.
          key={open.id}
          organizationId={organizationId}
          integration={open}
          config={openEntry?.config ?? null}
          secretKeys={openEntry?.secretKeys ?? []}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
