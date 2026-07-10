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
import { useUpdateOrgUser, type OrgUser } from "@/features/users/useOrgUsers";

const ROLES = [
  { value: "admin", label: "Administrateur" },
  { value: "consultant", label: "Consultant" },
] as const;

export function EditUserDialog({
  user,
  organizationId,
  onClose,
}: {
  user: OrgUser | null;
  organizationId: string;
  onClose: () => void;
}) {
  const updateUser = useUpdateOrgUser(organizationId);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [role, setRole] = React.useState("consultant");

  React.useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setRole(user.role);
  }, [user]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    updateUser.mutate(
      { userId: user.userId, membershipId: user.membershipId, firstName, lastName, role },
      { onSuccess: onClose },
    );
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
            <Field label="Rôle" htmlFor="edit-role">
              <select
                id="edit-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

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
