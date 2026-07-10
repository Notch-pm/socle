import { PageHeader } from "@/components/shared/PageHeader";
import { OrganizationsManager } from "@/features/organizations/OrganizationsManager";

/** Admin-facing hierarchy: scoped by RLS to the organizations the user administers. */
export function OrganizationsPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Organisations"
        subtitle="Gérez la hiérarchie de vos organisations et de leurs sous-organisations."
      />
      <OrganizationsManager canManageRoots={false} />
    </div>
  );
}
