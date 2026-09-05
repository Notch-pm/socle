import * as React from "react";
import { Plus, Pencil, Trash2, Download, Braces, FileSignature } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
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
import { documentTemplateTypeLabel } from "@/features/documents/documentTemplates";
import {
  useDocumentTemplatesQuery,
  useDocumentTemplatesForOrg,
  useCreateDocumentTemplate,
  useUpdateDocumentTemplate,
  useDeleteDocumentTemplate,
  useUploadDocumentTemplateFile,
  useRemoveDocumentTemplateFile,
  createSignedTemplateUrl,
  UNIQUE_VIOLATION,
  type DocumentTemplate,
} from "@/features/documents/useDocumentTemplates";
import {
  DocumentTemplateFormDialog,
  type DocumentTemplateFormValues,
} from "@/features/documents/DocumentTemplateFormDialog";
import { VariablesDialog } from "@/features/documents/VariablesDialog";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

/**
 * Liste + CRUD des documents (modèles à variables). Deux modes :
 * - `organizationId` fourni → **une organisation** (section superadmin) : le
 *   dialogue verrouille l'organisation.
 * - sans `organizationId` → **toutes les racines inscriptibles** (page admin) :
 *   le dialogue propose un sélecteur d'organisation.
 */
export function DocumentTemplatesManager({ organizationId }: { organizationId?: string }) {
  const scoped = organizationId != null;
  const allQuery = useDocumentTemplatesQuery(!scoped);
  const orgQuery = useDocumentTemplatesForOrg(organizationId);
  const { data: templates, isLoading, isError } = scoped ? orgQuery : allQuery;

  const createTemplate = useCreateDocumentTemplate();
  const updateTemplate = useUpdateDocumentTemplate();
  const deleteTemplate = useDeleteDocumentTemplate();
  const uploadFile = useUploadDocumentTemplateFile();
  const removeFile = useRemoveDocumentTemplateFile();

  const [formOpen, setFormOpen] = React.useState(false);
  const [variablesOpen, setVariablesOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DocumentTemplate | null>(null);
  const [deleting, setDeleting] = React.useState<DocumentTemplate | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setServerError(null);
    setFormOpen(true);
  }

  function openEdit(template: DocumentTemplate) {
    setEditing(template);
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

  async function handleSubmit(values: DocumentTemplateFormValues) {
    setServerError(null);
    const { file, ...fields } = values;
    let uploaded: { file_path: string; file_name: string } | null = null;

    try {
      // Le fichier part avant la ligne : il n'y a pas d'id de document à mettre
      // dans son chemin. En cas d'échec ensuite, on le retire (compensation).
      if (file) {
        uploaded = await uploadFile.mutateAsync({
          organizationId: fields.organization_id,
          file,
        });
      }

      if (editing) {
        const previousPath = editing.file_path;
        await updateTemplate.mutateAsync({ id: editing.id, ...fields, ...(uploaded ?? {}) });
        // L'ancien objet ne part qu'une fois la ligne à jour : l'inverse
        // laisserait un document introuvable si l'écriture échouait.
        if (uploaded && previousPath !== uploaded.file_path) {
          removeFile.mutate(previousPath);
        }
      } else {
        if (!uploaded) return; // Le formulaire l'impose déjà à la création.
        await createTemplate.mutateAsync({ ...fields, ...uploaded });
      }

      setFormOpen(false);
    } catch (error) {
      if (uploaded) removeFile.mutate(uploaded.file_path);
      handleError(error);
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    const { id, file_path } = deleting;
    setListError(null);
    deleteTemplate.mutate(id, {
      onSuccess: () => {
        // Best-effort, et seulement après le retrait de la ligne : le RLS peut
        // refuser la suppression, auquel cas le fichier doit rester en place.
        removeFile.mutate(file_path);
        setDeleting(null);
      },
      onError: () => {
        setDeleting(null);
        setListError("La suppression a échoué. Vous n'avez peut-être pas les droits.");
      },
    });
  }

  async function handleDownload(template: DocumentTemplate) {
    setListError(null);
    try {
      const url = await createSignedTemplateUrl(template.file_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setListError("Impossible d'ouvrir le document.");
    }
  }

  const submitting = createTemplate.isPending || updateTemplate.isPending || uploadFile.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={() => setVariablesOpen(true)}>
          <Braces />
          Variables disponibles
        </Button>
        <Button onClick={openCreate}>
          <Plus />
          Nouveau document
        </Button>
      </div>

      {listError ? <p className="text-sm text-destructive">{listError}</p> : null}

      {isLoading ? (
        <div className="rounded-lg border border-border">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse border-b border-border bg-muted/40 last:border-b-0"
            />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Impossible de charger les documents.</p>
      ) : templates && templates.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3" />
                <th className="px-4 py-3">Libellé</th>
                <th className="px-4 py-3">Nom fichier</th>
                <th className="w-32 px-4 py-3">Type</th>
                <th className="w-32 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileSignature className="size-4" />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{template.name}</p>
                    {template.description ? (
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{template.file_name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="muted">{documentTemplateTypeLabel(template.type)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Télécharger"
                        onClick={() => handleDownload(template)}
                      >
                        <Download className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Modifier"
                        onClick={() => openEdit(template)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Supprimer"
                        onClick={() => setDeleting(template)}
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
        <EmptyState message="Aucun document configuré." />
      )}

      <DocumentTemplateFormDialog
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        template={editing}
        existing={templates ?? []}
        fixedOrganizationId={organizationId}
        onSubmit={handleSubmit}
        submitting={submitting}
        serverError={serverError}
      />

      <VariablesDialog open={variablesOpen} onOpenChange={setVariablesOpen} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleting?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le document et son fichier seront retirés. Cette action est irréversible.
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
