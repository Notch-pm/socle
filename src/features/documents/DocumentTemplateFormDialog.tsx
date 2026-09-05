import * as React from "react";
import { FileText, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { acceptAttribute } from "@/lib/fileStorage";
import { useWritableRootOrganizations } from "@/features/procedures/useWritableRootOrganizations";
import {
  DOCUMENT_TEMPLATE_FORMATS,
  DOCUMENT_TEMPLATE_TYPES,
  documentTemplateTypeLabel,
  validateTemplateFile,
} from "@/features/documents/documentTemplates";
import type { DocumentTemplate } from "@/features/documents/useDocumentTemplates";

export interface DocumentTemplateFormValues {
  name: string;
  description: string | null;
  type: string;
  organization_id: string;
  /** Nouveau fichier choisi, ou `null` si le fichier existant est conservé. */
  file: File | null;
}

export function DocumentTemplateFormDialog({
  open,
  onOpenChange,
  template,
  existing,
  fixedOrganizationId,
  onSubmit,
  submitting,
  serverError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: DocumentTemplate | null;
  /** Documents existants, pour valider l'unicité du libellé côté client. */
  existing: DocumentTemplate[];
  /** Si fourni, l'organisation est verrouillée (section par organisation) — pas de sélecteur. */
  fixedOrganizationId?: string;
  onSubmit: (values: DocumentTemplateFormValues) => void;
  submitting: boolean;
  /** Message d'erreur renvoyé par le serveur (ex. doublon détecté en base). */
  serverError?: string | null;
}) {
  const isEdit = Boolean(template);
  const scoped = fixedOrganizationId != null;
  const { data: organizations, isLoading: loadingOrgs } = useWritableRootOrganizations();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<string>("courrier");
  const [organizationId, setOrganizationId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setDescription(template?.description ?? "");
    setType(template?.type ?? "courrier");
    setOrganizationId(template?.organization_id ?? fixedOrganizationId ?? "");
    setFile(null);
    setFileError(null);
  }, [open, template, fixedOrganizationId]);

  // En création (mode multi-org), pré-sélectionner la première organisation disponible.
  React.useEffect(() => {
    if (!open || template || organizationId || scoped) return;
    const first = organizations?.[0]?.id;
    if (first) setOrganizationId(first);
  }, [open, template, organizationId, organizations, scoped]);

  const trimmed = name.trim();

  // Doublon : même libellé (insensible à la casse) dans la même organisation,
  // en excluant la ligne en cours d'édition.
  const isDuplicate = React.useMemo(() => {
    if (!trimmed || !organizationId) return false;
    const key = trimmed.toLocaleLowerCase();
    return existing.some(
      (d) =>
        d.id !== template?.id &&
        d.organization_id === organizationId &&
        d.name.trim().toLocaleLowerCase() === key,
    );
  }, [existing, trimmed, organizationId, template]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    e.target.value = ""; // Permet de re-choisir le même fichier après une erreur.
    if (!chosen) return;
    const message = validateTemplateFile(chosen);
    if (message) {
      setFile(null);
      setFileError(message);
      return;
    }
    setFileError(null);
    setFile(chosen);
  }

  const noOrgAvailable = !scoped && !loadingOrgs && (organizations?.length ?? 0) === 0;
  // Le fichier est obligatoire à la création ; en édition on ne remplace que si
  // l'agent en choisit un nouveau.
  const hasFile = isEdit || file != null;
  const canSubmit =
    trimmed.length > 0 &&
    organizationId.length > 0 &&
    type.length > 0 &&
    hasFile &&
    !isDuplicate &&
    !fileError &&
    !submitting;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      name: trimmed,
      description: description.trim() || null,
      type,
      organization_id: organizationId,
      file,
    });
  }

  // Sélecteur masqué si l'organisation est verrouillée, ou s'il n'y a qu'un choix.
  const singleOrg = (organizations?.length ?? 0) === 1;
  const showOrgSelector = !scoped && !singleOrg;
  const formats = DOCUMENT_TEMPLATE_FORMATS.map((f) => f.toUpperCase()).join(", ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le document" : "Nouveau document"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Mettez à jour ce document, et remplacez son fichier si besoin."
              : `Déposez un modèle ${formats} porteur de variables, réutilisable dans vos démarches.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Libellé" htmlFor="document-template-name" required>
            <Input
              id="document-template-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Accusé de réception"
              aria-invalid={isDuplicate || Boolean(serverError)}
            />
            {isDuplicate ? (
              <p className="mt-1.5 text-sm text-destructive">
                Ce libellé existe déjà pour cette organisation.
              </p>
            ) : serverError ? (
              <p className="mt-1.5 text-sm text-destructive">{serverError}</p>
            ) : null}
          </Field>

          <Field label="Description" htmlFor="document-template-description">
            <textarea
              id="document-template-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="À quoi sert ce document, et quand l'utiliser."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <Field label="Type" htmlFor="document-template-type" required>
            <select
              id="document-template-type"
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {DOCUMENT_TEMPLATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {documentTemplateTypeLabel(t)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fichier" required={!isEdit}>
            {isEdit && !file ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="size-4 shrink-0" />
                <span className="truncate">{template?.file_name}</span>
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border/70 px-3 py-5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Upload className="size-5" />
              {file ? (
                <span className="max-w-full truncate font-medium text-foreground">{file.name}</span>
              ) : (
                <span>{isEdit ? "Remplacer le fichier" : "Choisir un fichier"}</span>
              )}
              <span className="text-xs">{formats} — 25 Mo maximum</span>
            </button>

            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={acceptAttribute(DOCUMENT_TEMPLATE_FORMATS)}
              onChange={handleFileChange}
            />

            {fileError ? <p className="mt-1.5 text-sm text-destructive">{fileError}</p> : null}
          </Field>

          {showOrgSelector && (
            <Field label="Organisation" htmlFor="document-template-org">
              {noOrgAvailable ? (
                <p className="text-sm text-muted-foreground">
                  Aucune organisation principale disponible. Créez une organisation avant de
                  pouvoir ajouter un document.
                </p>
              ) : (
                <select
                  id="document-template-org"
                  required
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="" disabled>
                    {loadingOrgs ? "Chargement…" : "Sélectionner une organisation"}
                  </option>
                  {organizations?.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit || noOrgAvailable}>
              {submitting ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
