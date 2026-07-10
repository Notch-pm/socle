import * as React from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/ui/field";
import { useWritableRootOrganizations } from "@/features/procedures/useWritableRootOrganizations";
import { ProceduresListPanel } from "@/features/procedures/ProceduresListPanel";

/** Catalogue de démarches de l'organisation principale (côté administrateur). */
export function ProceduresPage() {
  const navigate = useNavigate();
  const { data: roots, isLoading } = useWritableRootOrganizations();
  const [selectedId, setSelectedId] = React.useState("");

  React.useEffect(() => {
    if (!selectedId && roots.length > 0) setSelectedId(roots[0].id);
  }, [roots, selectedId]);

  return (
    <div className="p-6">
      <PageHeader
        title="Démarches"
        subtitle="Paramétrez le catalogue de démarches de votre organisation principale."
      />

      {isLoading ? (
        <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
      ) : roots.length === 0 ? (
        <EmptyState message="Aucune organisation principale rattachée à votre compte." />
      ) : (
        <div className="flex flex-col gap-4">
          {roots.length > 1 ? (
            <Field label="Organisation principale" htmlFor="proc-org">
              <select
                id="proc-org"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-11 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {roots.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {selectedId ? (
            <ProceduresListPanel
              organizationId={selectedId}
              canDelete={false}
              onNew={() => navigate(`/demarches/nouveau?org=${selectedId}`)}
              onEdit={(id) => navigate(`/demarches/${id}`)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
