import * as React from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/ui/field";
import { useAdminRootOrganizations } from "@/features/ai-usage/useAdminRootOrganizations";
import { IntegrationCard } from "./IntegrationCard";
import { IntegrationGrid } from "./IntegrationGrid";
import { overviewStatus } from "./integrationStatus";
import {
  useIntegrationTypes,
  useIntegrationsCatalogue,
  useOrganizationIntegrationOverview,
} from "./useIntegrations";

/**
 * Page admin `/integrations` — les connecteurs partenaires proposés par
 * l'éditeur, et ceux qui sont actifs pour la collectivité.
 *
 * ⚠️ CONSULTATION SEULE. Configurer, tester et activer restent au super
 * administrateur (fiche client → « Intégrations ») : la table de configuration
 * est toujours fermée à l'administrateur de collectivité, qui ne lit que
 * l'ÉTAT par `organization_integration_overview` — jamais une URL, un
 * identifiant ou un secret. L'écran n'offre donc aucune action.
 *
 * Une intégration est une affaire de racine : sélecteur des racines dont
 * l'utilisateur est administrateur direct (masqué s'il n'y en a qu'une), motif
 * de `/consommation-ia`.
 */
export function IntegrationsPage() {
  const { data: organizations, isLoading, isError } = useAdminRootOrganizations();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const roots = organizations ?? [];
  const organizationId = selectedId ?? roots[0]?.id ?? null;

  return (
    <div className="p-6">
      <PageHeader
        title="Intégrations"
        subtitle="Les connecteurs vers les logiciels partenaires que proposent les applications de la gamme, et ceux qui sont actifs pour votre collectivité. Consultation seule : la mise en place se fait avec l'éditeur."
      />

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      ) : isError ? (
        <EmptyState message="La liste des organisations n'a pas pu être lue. Réessayez dans un instant." />
      ) : !organizationId ? (
        <EmptyState message="Cette page est réservée aux administrateurs d'une organisation principale." />
      ) : (
        <div className="flex flex-col gap-6">
          {roots.length > 1 && (
            <Field label="Organisation" htmlFor="integrations-org" className="max-w-sm">
              <select
                id="integrations-org"
                value={organizationId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {roots.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <IntegrationsOverview organizationId={organizationId} />
        </div>
      )}
    </div>
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export function IntegrationsOverview({ organizationId }: { organizationId: string }) {
  const { data: types, isLoading: typesLoading } = useIntegrationTypes();
  const { data: catalogue, isLoading: catalogueLoading, isError: catalogueError } = useIntegrationsCatalogue();
  const { data: overview, isLoading: overviewLoading, isError: overviewError } =
    useOrganizationIntegrationOverview(organizationId);

  if (typesLoading || catalogueLoading || overviewLoading) {
    return <div className="h-32 animate-pulse rounded-lg bg-muted/40" />;
  }
  if (catalogueError || overviewError) {
    return <EmptyState message="Les intégrations n'ont pas pu être lues. Réessayez dans un instant." />;
  }

  const factsFor = (integrationId: string) =>
    overview?.find((row) => row.integration_id === integrationId) ?? null;
  // Une offre retirée n'intéresse la collectivité que si elle l'avait.
  const shown = (catalogue ?? []).filter((integration) => integration.is_available || factsFor(integration.id));
  const activeNames = shown
    .filter((integration) => overviewStatus(integration, factsFor(integration.id)) === "active")
    .map((integration) => integration.name);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm" role="status">
        {activeNames.length === 0
          ? "Aucune intégration n'est active pour votre collectivité."
          : `${activeNames.length === 1 ? "Intégration active" : "Intégrations actives"} : ${activeNames.join(", ")}.`}
      </p>
      <IntegrationGrid
        types={types ?? []}
        integrations={shown}
        showEmptyTypes={false}
        renderCard={(integration) => {
          const facts = factsFor(integration.id);
          const status = overviewStatus(integration, facts);
          return (
            <IntegrationCard
              integration={integration}
              status={status}
              showDescription
              action={
                facts?.last_tested_at && (status === "active" || status === "error") ? (
                  <span className="text-xs text-muted-foreground">
                    Testée le {DATE_FORMAT.format(new Date(facts.last_tested_at))}
                  </span>
                ) : null
              }
            />
          );
        }}
      />
    </div>
  );
}
