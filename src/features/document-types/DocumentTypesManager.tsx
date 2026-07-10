import * as React from "react";
import { Plus, Pencil, Trash2, FileCheck2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
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
  useDocumentTypesQuery,
  useDocumentTypesForOrg,
  useCreateDocumentType,
  useUpdateDocumentType,
  useDeleteDocumentType,
  UNIQUE_VIOLATION,
  type DocumentType,
} from "@/features/document-types/useDocumentTypes";
import {
  DocumentTypeFormDialog,
  type DocumentTypeFormValues,
} from "@/features/document-types/DocumentTypeFormDialog";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

/**
 * Liste + CRUD des types de pièce justificative. Deux modes :
 * - `organizationId` fourni → **une organisation** (section superadmin) : le
 *   dialogue verrouille l'organisation.
 * - sans `organizationId` → **toutes les racines inscriptibles** (page admin) :
 *   le dialogue propose un sélecteur d'organisation.
 */
export function DocumentTypesManager({ organizationId }: { organizationId?: string }) {
  const scoped = organizationId != null;
  const allQuery = useDocumentTypesQuery(!scoped);
  const orgQuery = useDocumentTypesForOrg(organizationId);
  const { data: documentTypes, isLoading, isError } = scoped ? orgQuery : allQuery;

  const createDocumentType = useCreateDocumentType();
  const updateDocumentType = useUpdateDocumentType();
  const deleteDocumentType = useDeleteDocumentType();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DocumentType | null>(null);
  const [deleting, setDeleting] = React.useState<DocumentType | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setServerError(null);
    setFormOpen(true);
  }

  function openEdit(documentType: DocumentType) {
    setEditing(documentType);
    setServerError(null);
    setFormOpen(true);
  }

  function handleFormOpenChange(open: boolean) {
    setFormOpen(open);
    if (!open) setServerError(null);
  }

  function handleError(error: unknown) {
    if (isUniqueViolation(error)) {
      setServerError("Ce libellé existe déjà pour cette organisation.");
    } else {
      setServerError("L'enregistrement a échoué. Réessayez.");
    }
  }

  function handleSubmit(values: DocumentTypeFormValues) {
    setServerError(null);
    if (editing) {
      updateDocumentType.mutate(
        { id: editing.id, ...values },
        { onSuccess: () => setFormOpen(false), onError: handleError },
      );
    } else {
      createDocumentType.mutate(values, {
        onSuccess: () => setFormOpen(false),
        onError: handleError,
      });
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteDocumentType.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }

  const submitting = createDocumentType.isPending || updateDocumentType.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus />
          Nouveau type
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse border-b border-border bg-muted/40 last:border-b-0" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Impossible de charger les types de pièce.</p>
      ) : documentTypes && documentTypes.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3" />
                <th className="px-4 py-3">Libellé</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {documentTypes.map((documentType) => (
                <tr key={documentType.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileCheck2 className="size-4" />
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{documentType.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Modifier"
                        onClick={() => openEdit(documentType)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Supprimer"
                        onClick={() => setDeleting(documentType)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="Aucun type de pièce justificative configuré." />
      )}

      <DocumentTypeFormDialog
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        documentType={editing}
        existing={documentTypes ?? []}
        fixedOrganizationId={organizationId}
        onSubmit={handleSubmit}
        submitting={submitting}
        serverError={serverError}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleting?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
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
