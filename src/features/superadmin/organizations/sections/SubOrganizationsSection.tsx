import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Building2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  useChildOrganizations,
  useCreateOrganization,
  type Organization,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import {
  OrganizationFormDialog,
  type OrganizationFormValues,
} from "@/features/superadmin/organizations/OrganizationFormDialog";

export function SubOrganizationsSection({ organization }: { organization: Organization }) {
  const navigate = useNavigate();
  const { data: children, isLoading } = useChildOrganizations(organization.id);
  const createOrg = useCreateOrganization();
  const [formOpen, setFormOpen] = React.useState(false);

  function handleSubmit(values: OrganizationFormValues) {
    createOrg.mutate(
      { ...values, parent_id: organization.id },
      { onSuccess: () => setFormOpen(false) },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setFormOpen(true)}>
          <Plus />
          Ajouter une sous-organisation
        </Button>
      </div>

      {isLoading ? (
        <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
      ) : !children?.length ? (
        <EmptyState message="Aucune sous-organisation." />
      ) : (
        <ul className="flex flex-col gap-2">
          {children.map((child) => (
            <li
              key={child.id}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
            >
              <div className="flex items-center gap-2 font-medium">
                <Building2 className="size-4 text-muted-foreground" />
                {child.name}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/superadmin/organisations/${child.id}`)}
              >
                <Settings className="size-4" />
                Paramétrer
              </Button>
            </li>
          ))}
        </ul>
      )}

      <OrganizationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        fixedParentId={organization.id}
        onSubmit={handleSubmit}
        submitting={createOrg.isPending}
      />
    </div>
  );
}
