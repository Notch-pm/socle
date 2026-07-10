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
import { IconPicker } from "@/features/categories/IconPicker";
import { useWritableOrganizations } from "@/features/categories/useWritableOrganizations";
import { useAllOrganizations } from "@/features/superadmin/organizations/useOrganizationsAdmin";
import type { Category } from "@/features/categories/useCategories";

export interface CategoryFormValues {
  name: string;
  icon: string | null;
  organization_id: string;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
  onSubmit: (values: CategoryFormValues) => void;
  submitting: boolean;
}) {
  const isEdit = Boolean(category);
  const { data: organizations, isLoading: loadingOrgs } = useWritableOrganizations();
  const { data: allOrgs } = useAllOrganizations();

  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState<string | null>(null);
  const [organizationId, setOrganizationId] = React.useState("");

  // Première organisation inscriptible qui est aussi une organisation principale (racine).
  const rootIds = React.useMemo(
    () =>
      new Set(
        (allOrgs ?? [])
          .filter((o) => o.parent_id === null && o.status !== "obsolete")
          .map((o) => o.id),
      ),
    [allOrgs],
  );
  const defaultOrgId = (organizations ?? []).find((o) => rootIds.has(o.id))?.id;

  React.useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setIcon(category?.icon ?? null);
    setOrganizationId(category?.organization_id ?? "");
  }, [open, category]);

  // En création, pré-sélectionner l'organisation principale dès qu'elle est connue.
  React.useEffect(() => {
    if (!open || category || organizationId) return;
    if (defaultOrgId) setOrganizationId(defaultOrgId);
  }, [open, category, organizationId, defaultOrgId]);

  const canSubmit = name.trim().length > 0 && organizationId.length > 0 && !submitting;
  const noOrgAvailable = !loadingOrgs && (organizations?.length ?? 0) === 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), icon, organization_id: organizationId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier la catégorie" : "Nouvelle catégorie"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Mettez à jour le libellé, l'icône ou l'organisation."
              : "Ajoutez une catégorie pour regrouper des démarches."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Libellé" htmlFor="category-name">
            <Input
              id="category-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. État civil"
            />
          </Field>

          <Field label="Organisation" htmlFor="category-org">
            {noOrgAvailable ? (
              <p className="text-sm text-muted-foreground">
                Aucune organisation disponible. Créez une organisation avant de pouvoir
                créer une catégorie.
              </p>
            ) : (
              <select
                id="category-org"
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

          <Field label="Icône">
            <IconPicker value={icon} onChange={setIcon} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
