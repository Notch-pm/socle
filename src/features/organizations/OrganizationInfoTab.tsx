import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  useAllOrganizations,
  useChildOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  bearerByOrganization,
  collectDescendantIdsFlat,
  type Organization,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import {
  OrganizationFormDialog,
  type OrganizationFormValues,
} from "@/features/superadmin/organizations/OrganizationFormDialog";
import { slugIssue, slugPathPreview } from "./organizationSlug";

/** Exporté pour que le test cible l'interrupteur par son nom accessible. */
export const INTERNAL_SERVICE_SWITCH_LABEL = "Service interne";

/**
 * Informations générales d'une organisation : la page de réglages du superadmin
 * le monte aussi (`GeneralInfoSection`) — un seul formulaire pour deux zones,
 * motif `SmtpSettingsSection`.
 *
 * `withEmailSender = false` (éditeur de l'app par organisation, navigation v2) :
 * l'expéditeur spécifique vit dans « Envoi des e-mails » (`EmailSenderForm`).
 * Ses champs sortent alors AUSSI de l'enregistrement — sinon ce formulaire
 * réécrirait l'expéditeur avec la valeur qu'il avait à son ouverture.
 */
export function GeneralInfoForm({
  organization,
  withEmailSender = true,
}: {
  organization: Organization;
  withEmailSender?: boolean;
}) {
  const { data: allOrgs } = useAllOrganizations();
  const updateOrg = useUpdateOrganization();

  const [name, setName] = React.useState(organization.name);
  const [parentId, setParentId] = React.useState(organization.parent_id ?? "");
  const [address, setAddress] = React.useState(organization.address ?? "");
  const [phone, setPhone] = React.useState(organization.phone ?? "");
  const [email, setEmail] = React.useState(organization.email ?? "");
  const [type, setType] = React.useState(organization.type ?? "");
  const [slug, setSlug] = React.useState(organization.slug ?? "");
  const [emailSenderOverride, setEmailSenderOverride] = React.useState(
    organization.email_sender_override,
  );
  const [emailSenderName, setEmailSenderName] = React.useState(
    organization.email_sender_name ?? "",
  );
  const [isInternalService, setIsInternalService] = React.useState(
    organization.is_internal_service,
  );

  // On ne peut pas rattacher une org à elle-même ni à l'un de ses descendants.
  const excluded = new Set([
    organization.id,
    ...collectDescendantIdsFlat(allOrgs ?? [], organization.id),
  ]);
  const parentOptions = (allOrgs ?? []).filter(
    (o) => !excluded.has(o.id) && o.status !== "obsolete",
  );

  // Le porteur se résout depuis le PARENT, jamais depuis l'organisation
  // elle-même : tant que la case n'est pas cochée, elle est encore son propre
  // porteur et l'aperçu annoncerait son propre nom (même piège que
  // `parent_branding`, qui résout depuis le parent pour la même raison).
  const bearer = organization.parent_id
    ? bearerByOrganization(allOrgs ?? []).get(organization.parent_id)
    : undefined;

  // Ce que la base refuserait, dit en français et avant l'aller-retour. Sur
  // une sous-organisation, ce champ est une ADRESSE PUBLIQUE du site de
  // démarches : une erreur de saisie ne doit pas revenir en code Postgres.
  const slugProblem = slugIssue(slug);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (slugProblem !== null) return;
    updateOrg.mutate({
      id: organization.id,
      name: name.trim(),
      parent_id: parentId || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      type: type.trim() || null,
      slug: slug.trim() || null,
      ...(withEmailSender
        ? {
            email_sender_override: emailSenderOverride,
            email_sender_name: emailSenderName.trim() || null,
          }
        : {}),
      is_internal_service: isInternalService,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-4">
      <Field label="Nom" htmlFor="oi-name">
        <Input
          id="oi-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Mairie de Cahors"
        />
      </Field>

      <Field label="Organisation parente" htmlFor="oi-parent">
        <select
          id="oi-parent"
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

      <Field label="Adresse complète" htmlFor="oi-address">
        <textarea
          id="oi-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={3}
          placeholder={"12 rue de la République\n46000 Cahors"}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <Field label="Téléphone" htmlFor="oi-phone">
        <Input
          id="oi-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="05 65 00 00 00"
        />
      </Field>

      <Field label="Courriel" htmlFor="oi-email">
        <Input
          id="oi-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contact@exemple.fr"
        />
      </Field>

      <Field label="Type" htmlFor="oi-type" hint="Facultatif — ex. collectivite, service">
        <Input
          id="oi-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="Ex. collectivite, service"
        />
      </Field>

      <Field
        label="Slug"
        htmlFor="oi-slug"
        error={slugProblem ?? undefined}
        hint={
          organization.parent_id === null
            ? "Identifiant lisible. Il sert de point de départ au sous-domaine fourni par la plateforme."
            : slugPathPreview(slug) === null
            ? "Identifiant lisible. Il ouvre la page de cet organisme sur le site de démarches."
            : `Adresse de cet organisme sur le site de démarches : ${slugPathPreview(slug)}`
        }
      >
        <Input
          id="oi-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="mairie-de-cahors"
        />
      </Field>

      {withEmailSender ? (
        <EmailSenderFields
          override={emailSenderOverride}
          onOverrideChange={setEmailSenderOverride}
          name={emailSenderName}
          onNameChange={setEmailSenderName}
        />
      ) : null}

      {organization.parent_id !== null ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{INTERNAL_SERVICE_SWITCH_LABEL}</p>
              <p className="text-xs text-muted-foreground">
                Ce service n'apparaît pas sur le site de démarches
                {bearer ? (
                  <>
                    {" "}
                    : les démarches qu'il instruit y sont présentées au nom de{" "}
                    <span className="font-medium text-foreground">{bearer.name}</span>
                  </>
                ) : null}
                .
              </p>
            </div>
            <Switch
              checked={isInternalService}
              aria-label={INTERNAL_SERVICE_SWITCH_LABEL}
              onCheckedChange={setIsInternalService}
            />
          </div>
          {isInternalService ? (
            <p className="text-xs text-muted-foreground">
              Une même démarche ne peut être activée que dans un seul service interne d'un même
              organisme : sinon, on ne saurait pas à qui adresser la demande.
            </p>
          ) : null}
        </div>
      ) : null}

      {updateOrg.error ? (
        <p className="text-sm text-destructive">{(updateOrg.error as Error).message}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={updateOrg.isPending} className="self-start">
          {updateOrg.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {updateOrg.isSuccess && !updateOrg.isPending ? (
          <p className="text-sm text-success">Organisation mise à jour.</p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * L'interrupteur et le nom d'expéditeur. ⚠️ Le réglage gouverne l'usage, pas
 * la donnée (motif `email_sender_name`) : couper l'interrupteur masque le nom
 * sans l'effacer.
 */
function EmailSenderFields({
  override,
  onOverrideChange,
  name,
  onNameChange,
}: {
  override: boolean;
  onOverrideChange: (value: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Expéditeur spécifique pour les e-mails</p>
          <p className="text-xs text-muted-foreground">
            Utiliser un nom d'expéditeur propre à cette organisation, au lieu de celui par défaut.
          </p>
        </div>
        <Switch
          checked={override}
          aria-label="Expéditeur spécifique pour les e-mails"
          onCheckedChange={onOverrideChange}
        />
      </div>
      {override ? (
        <Field label="Nom d'expéditeur" htmlFor="oi-sender-name">
          <Input
            id="oi-sender-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Ex. Mairie de Saint Martin de Crau"
          />
        </Field>
      ) : null}
    </div>
  );
}

/**
 * L'expéditeur spécifique seul, enregistré à part : section « Envoi des
 * e-mails » de l'éditeur d'organisation, au-dessus du serveur SMTP. N'écrit
 * que ses deux colonnes.
 */
export function EmailSenderForm({ organization }: { organization: Organization }) {
  const updateOrg = useUpdateOrganization();
  const [override, setOverride] = React.useState(organization.email_sender_override);
  const [name, setName] = React.useState(organization.email_sender_name ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        updateOrg.mutate({
          id: organization.id,
          email_sender_override: override,
          email_sender_name: name.trim() || null,
        });
      }}
      className="flex max-w-lg flex-col gap-4"
    >
      <EmailSenderFields
        override={override}
        onOverrideChange={setOverride}
        name={name}
        onNameChange={setName}
      />
      {updateOrg.error ? (
        <p className="text-sm text-destructive">{(updateOrg.error as Error).message}</p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={updateOrg.isPending} className="self-start">
          {updateOrg.isPending ? "Enregistrement…" : "Enregistrer l'expéditeur"}
        </Button>
        {updateOrg.isSuccess && !updateOrg.isPending ? (
          <p className="text-sm text-success">Expéditeur mis à jour.</p>
        ) : null}
      </div>
    </form>
  );
}

/** Organisations rattachées directement à celle-ci, avec création d'une nouvelle. */
export function ChildOrganizations({ organization }: { organization: Organization }) {
  const navigate = useNavigate();
  const { data: children, isLoading } = useChildOrganizations(organization.id);
  const createOrg = useCreateOrganization();
  const [formOpen, setFormOpen] = React.useState(false);

  function handleCreate(values: OrganizationFormValues) {
    createOrg.mutate(
      { ...values, parent_id: organization.id },
      { onSuccess: () => setFormOpen(false) },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="size-4" />
          Ajouter
        </Button>
      </div>

      {isLoading ? (
        <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
      ) : !children?.length ? (
        <EmptyState message="Aucune sous-organisation." />
      ) : (
        <ul className="flex flex-col gap-2">
          {children.map((child) => (
            <li
              key={child.id}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-2 font-medium">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{child.name}</span>
                {child.is_internal_service ? (
                  <Badge variant="muted" className="shrink-0">
                    Service interne
                  </Badge>
                ) : null}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/organisations/${child.id}`)}
              >
                <Pencil className="size-4" />
                Éditer
              </Button>
            </li>
          ))}
        </ul>
      )}

      <OrganizationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        fixedParentId={organization.id}
        onSubmit={handleCreate}
        submitting={createOrg.isPending}
      />
    </div>
  );
}
