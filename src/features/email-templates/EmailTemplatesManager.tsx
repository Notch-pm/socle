import * as React from "react";
import { Plus, Pencil, Trash2, RotateCcw, Braces, Mail } from "lucide-react";
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
import { VariablesDialog } from "@/features/documents/VariablesDialog";
import { useApplications } from "@/features/superadmin/applications/useApplications";
import type { ResolvedEmailTemplate } from "@/features/email-templates/emailTemplates";
import { EMAIL_VARIABLE_GROUPS } from "@/features/email-templates/emailVariables";
import {
  useEmailTemplates,
  useSaveSystemEmailTemplate,
  useResetSystemEmailTemplate,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
  UNIQUE_VIOLATION,
} from "@/features/email-templates/useEmailTemplates";
import {
  EmailTemplateFormDialog,
  type EmailTemplateFormValues,
} from "@/features/email-templates/EmailTemplateFormDialog";

const EMAIL_VARIABLES_DESCRIPTION =
  "Recopiez le jeton tel quel dans l'objet ou le texte du courriel, accolades comprises. " +
  "L'application qui envoie le courriel le remplace par la valeur de la demande. " +
  "Une partie entre {{#variable}} et {{/variable}} n'apparaît que si la variable a une valeur.";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

/**
 * Tableau des modèles de courriels d'UNE racine : les courriels système
 * (envoyés automatiquement par une application — modifiables, jamais
 * supprimables) puis les modèles créés par la collectivité.
 */
export function EmailTemplatesManager({ organizationId }: { organizationId: string }) {
  const { data: templates, isLoading, isError } = useEmailTemplates(organizationId);
  const { data: applications } = useApplications();

  const saveSystem = useSaveSystemEmailTemplate();
  const resetSystem = useResetSystemEmailTemplate();
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  const deleteTemplate = useDeleteEmailTemplate();

  const [formOpen, setFormOpen] = React.useState(false);
  const [variablesOpen, setVariablesOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ResolvedEmailTemplate | null>(null);
  const [deleting, setDeleting] = React.useState<ResolvedEmailTemplate | null>(null);
  const [resetting, setResetting] = React.useState<ResolvedEmailTemplate | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);

  // Applications qu'une collectivité peut choisir : celles qu'on lui souscrit
  // (Nora, Iris, Clara…), pas le Socle lui-même.
  const applicationOptions = (applications ?? [])
    .filter((app) => app.scope === "abonnement")
    .map((app) => ({ id: app.id, name: app.name }));
  const applicationName = (id: string) =>
    applications?.find((app) => app.id === id)?.name ?? id;

  const existingNames = (templates ?? []).filter((t) => !t.is_system).map((t) => t.name);

  function openCreate() {
    setEditing(null);
    setServerError(null);
    setFormOpen(true);
  }

  function openEdit(template: ResolvedEmailTemplate) {
    setEditing(template);
    setServerError(null);
    setFormOpen(true);
  }

  async function handleSubmit(values: EmailTemplateFormValues) {
    setServerError(null);
    try {
      if (editing?.is_system && editing.key) {
        await saveSystem.mutateAsync({
          organizationId,
          key: editing.key,
          overrideId: editing.id,
          subject: values.subject,
          body: values.body,
        });
      } else if (editing?.id) {
        await updateTemplate.mutateAsync({
          id: editing.id,
          currentApplications: editing.applications,
          ...values,
        });
      } else {
        await createTemplate.mutateAsync({ organizationId, ...values });
      }
      setFormOpen(false);
    } catch (error) {
      setServerError(
        isUniqueViolation(error)
          ? "Ce titre existe déjà pour cette collectivité."
          : "L'enregistrement a échoué. Vous n'avez peut-être pas les droits.",
      );
    }
  }

  function confirmDelete() {
    if (!deleting?.id) return;
    setListError(null);
    deleteTemplate.mutate(deleting.id, {
      onSettled: () => setDeleting(null),
      onError: () => setListError("La suppression a échoué. Vous n'avez peut-être pas les droits."),
    });
  }

  function confirmReset() {
    if (!resetting?.id) return;
    setListError(null);
    resetSystem.mutate(resetting.id, {
      onSettled: () => setResetting(null),
      onError: () => setListError("Le texte d'origine n'a pas pu être rétabli."),
    });
  }

  const submitting = saveSystem.isPending || createTemplate.isPending || updateTemplate.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" onClick={() => setVariablesOpen(true)}>
          <Braces />
          Variables disponibles
        </Button>
        <Button onClick={openCreate}>
          <Plus />
          Nouveau modèle
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
        <p className="text-sm text-destructive">Impossible de charger les modèles de courriels.</p>
      ) : templates && templates.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3" />
                <th className="px-4 py-3">Titre du courriel</th>
                <th className="px-4 py-3">Applications</th>
                <th className="px-4 py-3">Objet</th>
                <th className="w-32 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr
                  key={template.key ?? template.id}
                  className="border-t border-border hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Mail className="size-4" />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{template.name}</p>
                      {template.is_system ? (
                        <Badge variant="muted">{template.is_customized ? "Système · modifié" : "Système"}</Badge>
                      ) : (
                        <Badge variant="outline">Personnalisé</Badge>
                      )}
                    </div>
                    {template.description ? (
                      <p className="text-xs text-muted-foreground">{template.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {template.applications.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {template.applications.map((app) => (
                          <Badge key={app} variant="secondary" title={applicationName(app)}>
                            {app}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Aucune</span>
                    )}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-muted-foreground" title={template.subject}>
                    {template.subject}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Modifier"
                        onClick={() => openEdit(template)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {template.is_system ? (
                        template.is_customized ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Rétablir le texte d'origine"
                            onClick={() => setResetting(template)}
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        ) : null
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Supprimer"
                          onClick={() => setDeleting(template)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="Aucun modèle de courriel." />
      )}

      <EmailTemplateFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setServerError(null);
        }}
        template={editing}
        existingNames={existingNames}
        applicationOptions={applicationOptions}
        onSubmit={handleSubmit}
        onShowVariables={() => setVariablesOpen(true)}
        submitting={submitting}
        serverError={serverError}
      />

      <VariablesDialog
        open={variablesOpen}
        onOpenChange={setVariablesOpen}
        groups={EMAIL_VARIABLE_GROUPS}
        description={EMAIL_VARIABLES_DESCRIPTION}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleting?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les applications qui utilisent ce modèle ne pourront plus l'envoyer. Cette action
              est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(resetting)} onOpenChange={(open) => !open && setResetting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rétablir le texte d'origine de « {resetting?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Votre objet et votre texte seront remplacés par ceux proposés par défaut. Le
              courriel continuera d'être envoyé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReset}>Rétablir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
