import * as React from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/ui/field";
import { useWritableRootOrganizations } from "@/features/procedures/useWritableRootOrganizations";
import { QuartiersManager } from "@/features/quartiers/QuartiersManager";

/**
 * Page admin `/quartiers`. Les quartiers appartiennent à une organisation
 * principale (racine) : si l'utilisateur en voit plusieurs, un sélecteur
 * choisit celle à paramétrer (masqué s'il n'y en a qu'une).
 */
export function QuartiersPage() {
  const { data: organizations, isLoading } = useWritableRootOrganizations();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const organizationId = selectedId ?? organizations[0]?.id ?? null;

  return (
    <div className="p-6">
      <PageHeader
        title="Quartiers"
        subtitle="Le découpage du territoire en quartiers, pour rattacher les usagers et produire des statistiques."
      />

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      ) : !organizationId ? (
        <EmptyState message="Aucune organisation principale disponible." />
      ) : (
        <div className="flex flex-col gap-4">
          {organizations.length > 1 && (
            <Field label="Organisation" htmlFor="quartiers-org" className="max-w-sm">
              <select
                id="quartiers-org"
                value={organizationId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <QuartiersManager organizationId={organizationId} />
        </div>
      )}
    </div>
  );
}
