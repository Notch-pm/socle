import * as React from "react";
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
import { useWritableRootOrganizations } from "@/features/procedures/useWritableRootOrganizations";
import type { DocumentType } from "@/features/document-types/useDocumentTypes";

export interface DocumentTypeFormValues {
  name: string;
  organization_id: string;
}

export function DocumentTypeFormDialog({
  open,
  onOpenChange,
  documentType,
  existing,
  fixedOrganizationId,
  onSubmit,
  submitting,
  serverError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType?: DocumentType | null;
  /** Types existants, pour valider l'unicité du libellé côté client. */
  existing: DocumentType[];
  /** Si fourni, l'organisation est verrouillée (section par organisation) — pas de sélecteur. */
  fixedOrganizationId?: string;
  onSubmit: (values: DocumentTypeFormValues) => void;
  submitting: boolean;
  /** Message d'erreur renvoyé par le serveur (ex. doublon détecté en base). */
  serverError?: string | null;
}) {
  const isEdit = Boolean(documentType);
  const scoped = fixedOrganizationId != null;
  const { data: organizations, isLoading: loadingOrgs } = useWritableRootOrganizations();

  const [name, setName] = React.useState("");
  const [organizationId, setOrganizationId] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setName(documentType?.name ?? "");
    setOrganizationId(documentType?.organization_id ?? fixedOrganizationId ?? "");
  }, [open, documentType, fixedOrganizationId]);

  // En création (mode multi-org), pré-sélectionner la première organisation disponible.
  React.useEffect(() => {
    if (!open || documentType || organizationId || scoped) return;
    const first = organizations?.[0]?.id;
    if (first) setOrganizationId(first);
  }, [open, documentType, organizationId, organizations, scoped]);

  const trimmed = name.trim();

  // Doublon : même libellé (insensible à la casse) dans la même organisation,
  // en excluant la ligne en cours d'édition.
  const isDuplicate = React.useMemo(() => {
    if (!trimmed || !organizationId) return false;
    const key = trimmed.toLocaleLowerCase();
    return existing.some(
      (dt) =>
        dt.id !== documentType?.id &&
        dt.organization_id === organizationId &&
        dt.name.trim().toLocaleLowerCase() === key,
    );
  }, [existing, trimmed, organizationId, documentType]);

  const noOrgAvailable = !scoped && !loadingOrgs && (organizations?.length ?? 0) === 0;
  const canSubmit =
    trimmed.length > 0 && organizationId.length > 0 && !isDuplicate && !submitting;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ name: trimmed, organization_id: organizationId });
  }

  // Sélecteur masqué si l'organisation est verrouillée, ou s'il n'y a qu'un choix.
  const singleOrg = (organizations?.length ?? 0) === 1;
  const showOrgSelector = !scoped && !singleOrg;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier le type de pièce" : "Nouveau type de pièce"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Mettez à jour le libellé de ce type de pièce justificative."
              : "Ajoutez un type de pièce justificative réutilisable dans vos démarches."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Libellé" htmlFor="document-type-name">
            <Input
              id="document-type-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Justificatif de domicile"
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

          {showOrgSelector && (
            <Field label="Organisation" htmlFor="document-type-org">
              {noOrgAvailable ? (
                <p className="text-sm text-muted-foreground">
                  Aucune organisation principale disponible. Créez une organisation avant de
                  pouvoir ajouter un type de pièce.
                </p>
              ) : (
                <select
                  id="document-type-org"
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
