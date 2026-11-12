import * as React from "react";
import { Braces, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  EMAIL_BODY_MAX_LENGTH,
  EMAIL_SUBJECT_MAX_LENGTH,
  unknownVariables,
  validateEmailTemplate,
  type ResolvedEmailTemplate,
} from "@/features/email-templates/emailTemplates";
import {
  allEmailVariableKeys,
  emailVariableTitle,
} from "@/features/email-templates/emailVariables";

export interface EmailApplicationOption {
  id: string;
  name: string;
}

export interface EmailTemplateFormValues {
  name: string;
  description: string | null;
  subject: string;
  body: string;
  applications: string[];
}

const TEXTAREA_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const KNOWN_VARIABLES = allEmailVariableKeys();

/**
 * Création ou modification d'un modèle de courriel.
 * - Courriel **système** : titre et applications figés (affichés, verrouillés),
 *   seuls l'objet et le corps se modifient.
 * - Modèle **créé** : titre, description, applications, objet, corps.
 */
export function EmailTemplateFormDialog({
  open,
  onOpenChange,
  template,
  existingNames,
  applicationOptions,
  onSubmit,
  onShowVariables,
  submitting,
  serverError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = nouveau modèle. */
  template: ResolvedEmailTemplate | null;
  /** Titres des modèles créés existants, pour l'unicité côté client. */
  existingNames: string[];
  applicationOptions: EmailApplicationOption[];
  onSubmit: (values: EmailTemplateFormValues) => void;
  onShowVariables: () => void;
  submitting: boolean;
  serverError?: string | null;
}) {
  const isSystem = template?.is_system ?? false;
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [applications, setApplications] = React.useState<string[]>([]);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setSubject(template?.subject ?? "");
    setBody(template?.body ?? "");
    setApplications(template?.applications ?? []);
    setTouched(false);
  }, [open, template]);

  const issues = validateEmailTemplate({ isSystem, name, subject, body });
  const isDuplicate =
    !isSystem &&
    name.trim() !== "" &&
    existingNames.some(
      (other) =>
        other.toLocaleLowerCase("fr") === name.trim().toLocaleLowerCase("fr") &&
        other !== template?.name,
    );
  const unknown = unknownVariables(`${subject}\n${body}`, KNOWN_VARIABLES);
  const hasIssues = Object.keys(issues).length > 0 || isDuplicate;

  function toggleApplication(id: string) {
    setApplications((current) =>
      current.includes(id) ? current.filter((app) => app !== id) : [...current, id],
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (hasIssues) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      subject,
      body,
      applications,
    });
  }

  const title = template
    ? isSystem
      ? `Modifier « ${template.name} »`
      : "Modifier le modèle de courriel"
    : "Nouveau modèle de courriel";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isSystem
              ? "Courriel envoyé automatiquement par l'application. Vous pouvez en modifier l'objet et le texte ; la mise en forme (logo, couleurs, bouton, pied de page) reste celle de l'application."
              : "Rédigez l'objet et le texte du courriel. La mise en forme (logo, couleurs, pied de page) est ajoutée par l'application qui l'envoie."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSystem ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground">
                <Lock className="size-4 shrink-0" />
                Titre et applications ne se modifient pas.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Utilisé par :</span>
                {template?.applications.map((app) => (
                  <Badge key={app} variant="secondary">
                    {app}
                  </Badge>
                ))}
              </div>
              {template?.description ? (
                <p className="text-xs text-muted-foreground">{template.description}</p>
              ) : null}
            </div>
          ) : (
            <>
              <Field label="Titre" htmlFor="email-template-name" required>
                <Input
                  id="email-template-name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex. Invitation à un rendez-vous"
                  aria-invalid={(touched && Boolean(issues.name)) || isDuplicate}
                />
                {isDuplicate ? (
                  <p className="mt-1.5 text-sm text-destructive">
                    Ce titre existe déjà pour cette collectivité.
                  </p>
                ) : touched && issues.name ? (
                  <p className="mt-1.5 text-sm text-destructive">{issues.name}</p>
                ) : null}
              </Field>

              <Field label="Description" htmlFor="email-template-description">
                <textarea
                  id="email-template-description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="À quoi sert ce courriel, et quand l'utiliser."
                  className={TEXTAREA_CLASS}
                />
              </Field>

              <Field label="Applications qui l'utilisent">
                {applicationOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune application disponible.</p>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    {applicationOptions.map((app) => (
                      <label key={app.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={applications.includes(app.id)}
                          onChange={() => toggleApplication(app.id)}
                        />
                        {app.name}
                      </label>
                    ))}
                  </div>
                )}
              </Field>
            </>
          )}

          <Field label="Objet" htmlFor="email-template-subject" required>
            <Input
              id="email-template-subject"
              autoFocus={isSystem}
              value={subject}
              maxLength={EMAIL_SUBJECT_MAX_LENGTH}
              onChange={(e) => setSubject(e.target.value)}
              aria-invalid={touched && Boolean(issues.subject)}
            />
            {touched && issues.subject ? (
              <p className="mt-1.5 text-sm text-destructive">{issues.subject}</p>
            ) : null}
          </Field>

          <Field label="Texte du courriel" htmlFor="email-template-body" required>
            <textarea
              id="email-template-body"
              rows={14}
              value={body}
              maxLength={EMAIL_BODY_MAX_LENGTH}
              onChange={(e) => setBody(e.target.value)}
              className={`${TEXTAREA_CLASS} font-mono text-[13px] leading-relaxed`}
              aria-invalid={touched && Boolean(issues.body)}
            />
            {touched && issues.body ? (
              <p className="mt-1.5 text-sm text-destructive">{issues.body}</p>
            ) : null}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Texte brut : une ligne vide sépare deux paragraphes. Une partie entre{" "}
              <code>{"{{#variable}}"}</code> et <code>{"{{/variable}}"}</code> n'apparaît que si
              la variable a une valeur.
            </p>
            {unknown.length > 0 ? (
              <p className="mt-1.5 text-xs text-warning">
                Variable inconnue du catalogue : {unknown.map((k) => `{{${k}}}`).join(", ")}.
                Vérifiez l'orthographe.
              </p>
            ) : null}
          </Field>

          {isSystem && template && template.variables.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Variables fournies par l'application</p>
              <div className="flex flex-wrap gap-1.5">
                {template.variables.map((key) => (
                  <code
                    key={key}
                    title={emailVariableTitle(key) ?? undefined}
                    className="rounded bg-muted px-2 py-1 text-xs"
                  >
                    {`{{${key}}}`}
                  </code>
                ))}
              </div>
            </div>
          ) : null}

          {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={onShowVariables}>
              <Braces />
              Variables disponibles
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting || (touched && hasIssues)}>
                {submitting ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
