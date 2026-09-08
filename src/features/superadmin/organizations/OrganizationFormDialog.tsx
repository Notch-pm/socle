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
import { Switch } from "@/components/ui/switch";
import { useAllOrganizations, type Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { dnsLabelFromSlug } from "@/features/organizations/organizationDomains";

export interface OrganizationFormValues {
  name: string;
  slug: string | null;
  type: string | null;
  parent_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_internal_service: boolean;
}

/**
 * Le slug est dérivé comme un label DNS (`dnsLabelFromSlug`, miroir de la
 * fonction SQL) : c'est lui qui devient le sous-domaine fourni du portail à
 * la création d'une racine. « Sète » donne `sete`, pas `s-te`.
 */
const slugify = (value: string) => dnsLabelFromSlug(value);

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
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [isInternalService, setIsInternalService] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(organization?.name ?? "");
    setSlug(organization?.slug ?? "");
    setType(organization?.type ?? "");
    setParentId(organization?.parent_id ?? fixedParentId ?? "");
    setAddress(organization?.address ?? "");
    setPhone(organization?.phone ?? "");
    setEmail(organization?.email ?? "");
    setIsInternalService(organization?.is_internal_service ?? false);
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
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      // Une racine n'est jamais un service interne : la base le corrigerait de
      // toute façon, autant ne pas l'envoyer.
      is_internal_service: parentId ? isInternalService : false,
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

          {parentId ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Service interne</p>
                <p className="text-xs text-muted-foreground">
                  N'apparaît pas sur le site de démarches : ses démarches y sont présentées au nom
                  de l'organisme parent.
                </p>
              </div>
              <Switch
                checked={isInternalService}
                aria-label="Service interne"
                onCheckedChange={setIsInternalService}
              />
            </div>
          ) : null}

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
