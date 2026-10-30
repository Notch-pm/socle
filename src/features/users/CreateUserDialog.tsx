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
import { NO_ACCESS, SOCLE_APPLICATION_ID, type AccessApplication } from "@/features/users/agentAccess";

const schema = z.object({
  email: z.string().email("Email invalide"),
  first_name: z.string().min(1, "Prénom obligatoire"),
  last_name: z.string().min(1, "Nom obligatoire"),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_ROLES = { [SOCLE_APPLICATION_ID]: "consultant" };

export function CreateUserDialog({
  open,
  onOpenChange,
  organizationId,
  applications,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  applications: AccessApplication[];
}) {
  const createUser = useCreateOrgUser(organizationId);
  const [roles, setRoles] = React.useState<Record<string, string>>(DEFAULT_ROLES);
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
    setRoles(DEFAULT_ROLES);
    setRolesError(null);
    createUser.reset();
    onOpenChange(false);
  }

  function onSubmit(values: FormValues) {
    const socleRole = roles[SOCLE_APPLICATION_ID] ?? NO_ACCESS;
    const appAccess = applications
      .map((app) => ({ application_id: app.id, role_code: roles[app.id] ?? NO_ACCESS }))
      .filter((a) => a.role_code !== NO_ACCESS);
    if (socleRole === NO_ACCESS && appAccess.length === 0) {
      setRolesError("Ouvrez l'accès à au moins une application.");
      return;
    }
    setRolesError(null);
    createUser.mutate(
      { ...values, role: socleRole, organization_id: organizationId, applications: appAccess },
      { onSuccess: (result) => (result.email_sent || !result.is_new_user || socleRole === NO_ACCESS) && close() },
    );
  }

  const result = createUser.data;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
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
            value={roles}
            onChange={(app, role) => setRoles((prev) => ({ ...prev, [app]: role }))}
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
