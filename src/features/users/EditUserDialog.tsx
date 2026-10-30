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
import { useUpdateOrgUser, type OrgAgent } from "@/features/users/useOrgUsers";
import { AccessRolesFields, withSocle } from "@/features/users/AccessRolesFields";
import { currentRole, type AccessApplication } from "@/features/users/agentAccess";

export function EditUserDialog({
  user,
  organizationId,
  applications,
  onClose,
}: {
  user: OrgAgent | null;
  organizationId: string;
  applications: AccessApplication[];
  onClose: () => void;
}) {
  const updateUser = useUpdateOrgUser(organizationId);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [roles, setRoles] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setRoles(Object.fromEntries(withSocle(applications).map((app) => [app.id, currentRole(user, app.id)])));
  }, [user, applications]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    updateUser.mutate({ agent: user, firstName, lastName, roles }, { onSuccess: onClose });
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier l'utilisateur</DialogTitle>
        </DialogHeader>
        {user ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" htmlFor="edit-first-name">
                <Input
                  id="edit-first-name"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </Field>
              <Field label="Nom" htmlFor="edit-last-name">
                <Input
                  id="edit-last-name"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </Field>
            </div>
            <AccessRolesFields
              idPrefix="edit-access"
              applications={applications}
              value={roles}
              onChange={(app, role) => setRoles((prev) => ({ ...prev, [app]: role }))}
            />

            {updateUser.isError ? (
              <p className="text-sm text-destructive">{(updateUser.error as Error).message}</p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
