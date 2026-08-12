import * as React from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  useAllOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  useSetOrganizationStatus,
  buildOrgTree,
  collectDescendantIds,
  collectDescendantIdsFlat,
  type OrgNode,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import {
  OrganizationFormDialog,
  type OrganizationFormValues,
} from "@/features/superadmin/organizations/OrganizationFormDialog";
import { OrganizationTree } from "@/features/organizations/OrganizationTree";

export function OrganizationsManager({
  /** Super admin may delete sub-organizations. */
  canManageRoots,
  /** Restrict the tree to this organization and its descendants (super admin org page). */
  rootOrganizationId,
  /** Navigate to the org-settings area (super admin only). */
  onConfigure,
  /** When provided, editing opens a full-page editor instead of the inline dialog. */
  onEditOrganization,
}: {
  canManageRoots: boolean;
  rootOrganizationId?: string;
  onConfigure?: (node: OrgNode) => void;
  onEditOrganization?: (node: OrgNode) => void;
}) {
  const { data: orgs, isLoading, isError } = useAllOrganizations();
  const createOrg = useCreateOrganization();
  const updateOrg = useUpdateOrganization();
  const deleteOrg = useDeleteOrganization();
  const setStatus = useSetOrganizationStatus();

  const tree = React.useMemo(() => {
    const all = orgs ?? [];
    if (!rootOrganizationId) return buildOrgTree(all);
    const scope = new Set([
      rootOrganizationId,
      ...collectDescendantIdsFlat(all, rootOrganizationId),
    ]);
    return buildOrgTree(all.filter((o) => scope.has(o.id)));
  }, [orgs, rootOrganizationId]);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<OrgNode | null>(null);
  const [parentForNew, setParentForNew] = React.useState<OrgNode | null>(null);
  const [deleting, setDeleting] = React.useState<OrgNode | null>(null);
  const [obsoleting, setObsoleting] = React.useState<OrgNode | null>(null);

  const excludeIds = editing ? collectDescendantIds(editing) : [];

  function openAddChild(node: OrgNode) {
    setEditing(null);
    setParentForNew(node);
    setFormOpen(true);
  }

  function openEdit(node: OrgNode) {
    if (onEditOrganization) {
      onEditOrganization(node);
      return;
    }
    setParentForNew(null);
    setEditing(node);
    setFormOpen(true);
  }

  function handleSubmit(values: OrganizationFormValues) {
    if (editing) {
      updateOrg.mutate({ id: editing.id, ...values }, { onSuccess: () => setFormOpen(false) });
    } else {
      const parent_id = parentForNew ? parentForNew.id : values.parent_id;
      createOrg.mutate({ ...values, parent_id }, { onSuccess: () => setFormOpen(false) });
    }
  }

  function handleToggleStatus(node: OrgNode) {
    if (node.status === "obsolete") {
      setStatus.mutate({ id: node.id, status: "active" });
    } else {
      setObsoleting(node);
    }
  }

  function confirmObsolete() {
    if (!obsoleting) return;
    setStatus.mutate(
      { id: obsoleting.id, status: "obsolete" },
      { onSuccess: () => setObsoleting(null) },
    );
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteOrg.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }

  const submitting = createOrg.isPending || updateOrg.isPending;
  const mutationError =
    createOrg.error || updateOrg.error || deleteOrg.error || setStatus.error;

  return (
    <div className="flex flex-col gap-4">
      {mutationError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {(mutationError as Error).message}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Impossible de charger les organisations.</p>
      ) : tree.length === 0 ? (
        <EmptyState
          message={
            canManageRoots
              ? "Aucune organisation. Créez une organisation racine via le bouton « + » du menu latéral."
              : "Aucune organisation rattachée à votre compte."
          }
        />
      ) : (
        <OrganizationTree
          nodes={tree}
          handlers={{
            onAddChild: openAddChild,
            onEdit: openEdit,
            onToggleStatus: handleToggleStatus,
            onDelete: setDeleting,
            onConfigure,
            canDelete: canManageRoots,
          }}
        />
      )}

      <OrganizationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        organization={editing}
        fixedParentId={parentForNew?.id}
        excludeIds={excludeIds}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <AlertDialog open={Boolean(obsoleting)} onOpenChange={(open) => !open && setObsoleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rendre « {obsoleting?.name} » obsolète ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'organisation restera visible mais grisée et ne pourra plus être choisie comme
              parente. Vous pourrez la réactiver à tout moment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmObsolete}>Rendre obsolète</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleting?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les éventuelles sous-organisations rattachées ne
              seront pas supprimées automatiquement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
