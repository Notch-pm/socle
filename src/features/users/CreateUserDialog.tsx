import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { useCreateOrgUser } from "@/features/users/useOrgUsers";
import { AccessRolesFields } from "@/features/users/AccessRolesFields";
import {
  grantedEntries,
  newDraft,
  NO_ACCESS,
  SOCLE_APPLICATION_ID,
  validateDraft,
  type AccessApplication,
  type AccessDraft,
  type ManagedOrganization,
} from "@/features/users/agentAccess";

const schema = z.object({
  email: z.string().email("Email invalide"),
  first_name: z.string().min(1, "Prénom obligatoire"),
  last_name: z.string().min(1, "Nom obligatoire"),
});

type FormValues = z.infer<typeof schema>;

export function CreateUserDialog({
  open,
  onOpenChange,
  organizationId,
  applications,
  organizations,
  rootId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  applications: AccessApplication[];
  /** Sous-arbre géré : l'organisme de la page en tête, puis ses services. */
  organizations: ManagedOrganization[];
  rootId: string | null;
}) {
  const createUser = useCreateOrgUser(organizationId);
  const [draft, setDraft] = React.useState<AccessDraft>(() => newDraft(applications, organizationId));
  // Le catalogue arrive après l'ouverture de la page : le brouillon suit.
  React.useEffect(() => {
    if (open) setDraft(newDraft(applications, organizationId));
  }, [open, applications, organizationId]);
  const [rolesError, setRolesError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", first_name: "", last_name: "" },
  });

  function close() {
    reset();
    setDraft(newDraft(applications, organizationId));
    setRolesError(null);
    createUser.reset();
    onOpenChange(false);
  }

  function onSubmit(values: FormValues) {
    const refusal = validateDraft(draft, applications, organizations);
    if (refusal) {
      setRolesError(refusal);
      return;
    }
    setRolesError(null);
    const socle = draft[SOCLE_APPLICATION_ID] ?? { role: NO_ACCESS, organizationIds: [] };
    const appAccess = grantedEntries(draft)
      .filter(([id]) => id !== SOCLE_APPLICATION_ID)
      .map(([application_id, e]) => ({ application_id, role_code: e.role, organization_ids: e.organizationIds }));
    createUser.mutate(
      {
        ...values,
        role: socle.role,
        organization_id: organizationId,
        socle_organization_ids: socle.role === NO_ACCESS ? [] : socle.organizationIds,
        applications: appAccess,
      },
      { onSuccess: (result) => (result.email_sent || !result.is_new_user || socle.role === NO_ACCESS) && close() },
    );
  }

  const result = createUser.data;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvel utilisateur</DialogTitle>
          <DialogDescription>
            Avec un accès au Socle, un email d'invitation est envoyé pour définir le mot de passe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="user-email" error={errors.email?.message}>
            <Input id="user-email" type="email" placeholder="nom@exemple.fr" {...register("email")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" htmlFor="user-first-name" error={errors.first_name?.message}>
              <Input id="user-first-name" {...register("first_name")} />
            </Field>
            <Field label="Nom" htmlFor="user-last-name" error={errors.last_name?.message}>
              <Input id="user-last-name" {...register("last_name")} />
            </Field>
          </div>
          <AccessRolesFields
            idPrefix="user-access"
            applications={applications}
            organizations={organizations}
            rootId={rootId}
            value={draft}
            onChange={setDraft}
          />

          {rolesError ? <p className="text-sm text-destructive">{rolesError}</p> : null}
          {createUser.isError ? (
            <p className="text-sm text-destructive">{(createUser.error as Error).message}</p>
          ) : null}
          {result && result.is_new_user && !result.email_sent ? (
            <p className="text-sm text-warning">
              Utilisateur créé, mais l'email d'invitation n'a pas pu être envoyé
              {result.email_error ? ` (${result.email_error})` : ""}. Configurez l'envoi
              d'emails ou renvoyez l'invitation plus tard.
            </p>
          ) : null}
          {result && !result.is_new_user ? (
            <p className="text-sm text-success">
              Utilisateur existant ajouté à l'organisation.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Annuler
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Envoi…" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
