import * as React from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import type { CatalogueIntegration, IntegrationType } from "./useIntegrations";

/**
 * Les intégrations rangées par type, dans l'ordre des types. Les types SANS
 * partenaire ne prennent pas la place de ceux qui en ont : `showEmptyTypes`
 * les nomme sur une seule ligne, en bas (le catalogue annonce ce qui viendra) ;
 * la fiche d'une collectivité, elle, ne montre que ce qui existe.
 */
export function IntegrationGrid({
  types,
  integrations,
  showEmptyTypes,
  renderCard,
}: {
  types: IntegrationType[];
  integrations: CatalogueIntegration[];
  showEmptyTypes: boolean;
  renderCard: (integration: CatalogueIntegration) => React.ReactNode;
}) {
  const groups = types.map((type) => ({
    type,
    items: integrations.filter((i) => i.type_id === type.id),
  }));
  const filled = groups.filter((group) => group.items.length > 0);
  const empty = groups.filter((group) => group.items.length === 0);

  if (filled.length === 0 && !showEmptyTypes) {
    return <EmptyState message="Aucune intégration au catalogue pour l'instant." />;
  }

  return (
    <div className="flex flex-col gap-8">
      {filled.map(({ type, items }) => (
        <section key={type.id} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{type.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((integration) => (
              <React.Fragment key={integration.id}>{renderCard(integration)}</React.Fragment>
            ))}
          </div>
        </section>
      ))}
      {showEmptyTypes && empty.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Aucun partenaire pour l'instant</h2>
          <p className="text-sm text-muted-foreground">{empty.map(({ type }) => type.name).join(" · ")}</p>
        </section>
      ) : null}
    </div>
  );
}
