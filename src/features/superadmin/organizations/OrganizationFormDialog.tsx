import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useAllOrganizations, type Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

export interface OrganizationFormValues {
  name: string;
  slug: string | null;
  type: string | null;
  parent_id: string | null;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function OrganizationFormDialog({
  open,
  onOpenChange,
  organization,
  fixedParentId,
  excludeIds = [],
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization?: Organization | null;
  /** Pre-fill and lock the parent — used when creating a sub-organization from a node. */
  fixedParentId?: string;
  /** Ids that must not be selectable as a parent (the org itself and its descendants). */
  excludeIds?: string[];
  onSubmit: (values: OrganizationFormValues) => void;
  submitting: boolean;
}) {
  const isEdit = Boolean(organization);
  const { data: allOrgs } = useAllOrganizations();

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [type, setType] = React.useState("");
  const [parentId, setParentId] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setName(organization?.name ?? "");
    setSlug(organization?.slug ?? "");
    setType(organization?.type ?? "");
    setParentId(organization?.parent_id ?? fixedParentId ?? "");
    setLogoUrl(organization?.logo_url ?? "");
    setAddress(organization?.address ?? "");
    setPhone(organization?.phone ?? "");
    setEmail(organization?.email ?? "");
  }, [open, organization, fixedParentId]);

  const excluded = new Set([organization?.id, ...excludeIds].filter(Boolean) as string[]);
  const parentOptions = (allOrgs ?? []).filter(
    (o) => !excluded.has(o.id) && o.status !== "obsolete",
  );
  const canSubmit = name.trim().length > 0 && !submitting;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      slug: slug.trim() ? slugify(slug) : slugify(name),
      type: type.trim() || null,
      parent_id: parentId || null,
      logo_url: logoUrl.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier l'organisation" : "Nouvelle organisation"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <Field label="Nom" htmlFor="org-name">
            <Input
              id="org-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Mairie de Cahors"
            />
          </Field>

          <Field label="Organisation parente" htmlFor="org-parent">
            <select
              id="org-parent"
              value={parentId}
              disabled={Boolean(fixedParentId)}
              onChange={(e) => setParentId(e.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Aucune (organisation racine)</option>
              {parentOptions.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Logo (URL)" htmlFor="org-logo" hint="Adresse d'une image déjà hébergée">
            <Input
              id="org-logo"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…/logo.png"
            />
          </Field>

          <Field label="Adresse complète" htmlFor="org-address">
            <textarea
              id="org-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              placeholder={"12 rue de la République\n46000 Cahors"}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <Field label="Téléphone" htmlFor="org-phone">
            <Input
              id="org-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05 65 00 00 00"
            />
          </Field>

          <Field label="Courriel" htmlFor="org-email">
            <Input
              id="org-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@exemple.fr"
            />
          </Field>

          <Field label="Type" htmlFor="org-type" hint="Facultatif — ex. collectivite, service">
            <Input
              id="org-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Ex. collectivite, service"
            />
          </Field>

          <Field label="Slug" htmlFor="org-slug" hint="Généré depuis le nom si laissé vide">
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="mairie-de-cahors"
            />
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
