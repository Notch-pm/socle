import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  useAllOrganizations,
  useUpdateOrganization,
  type Organization,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";

export function GeneralInfoSection({ organization }: { organization: Organization }) {
  const { data: allOrgs } = useAllOrganizations();
  const updateOrg = useUpdateOrganization();

  const [name, setName] = React.useState(organization.name);
  const [slug, setSlug] = React.useState(organization.slug ?? "");
  const [type, setType] = React.useState(organization.type ?? "");
  const [parentId, setParentId] = React.useState(organization.parent_id ?? "");

  const parentOptions = (allOrgs ?? []).filter((o) => o.id !== organization.id);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateOrg.mutate({
      id: organization.id,
      name: name.trim(),
      slug: slug.trim() || null,
      type: type.trim() || null,
      parent_id: parentId || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <Field label="Nom" htmlFor="gi-name">
        <Input id="gi-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Slug" htmlFor="gi-slug">
        <Input id="gi-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
      </Field>
      <Field label="Type" htmlFor="gi-type">
        <Input id="gi-type" value={type} onChange={(e) => setType(e.target.value)} />
      </Field>
      <Field label="Organisation parente" htmlFor="gi-parent">
        <select
          id="gi-parent"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Aucune (organisation racine)</option>
          {parentOptions.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" disabled={updateOrg.isPending} className="self-start">
        {updateOrg.isPending ? "Enregistrement…" : "Enregistrer"}
      </Button>
      {updateOrg.isSuccess ? (
        <p className="text-sm text-success">Organisation mise à jour.</p>
      ) : null}
    </form>
  );
}
