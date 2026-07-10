import { useNavigate } from "react-router-dom";
import { OrganizationsManager } from "@/features/organizations/OrganizationsManager";
import type { OrgNode } from "@/features/superadmin/organizations/useOrganizationsAdmin";

export function OrganizationsAdminPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Organisations</h1>
        <p className="text-muted-foreground">
          Hiérarchie des organisations de la plateforme (jusqu'à 10 niveaux)
        </p>
      </div>

      <OrganizationsManager
        canManageRoots
        onConfigure={(node: OrgNode) => navigate(`/superadmin/organisations/${node.id}`)}
      />
    </div>
  );
}
