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
import { AccessRolesFields } from "@/features/users/AccessRolesFields";
import {
  draftFromAgent,
  validateDraft,
  type AccessApplication,
  type AccessDraft,
  type ManagedOrganization,
} from "@/features/users/agentAccess";

export function EditUserDialog({
  user,
  organizationId,
  applications,
  organizations,
  rootId,
  onClose,
}: {
  user: OrgAgent | null;
  organizationId: string;
  applications: AccessApplication[];
  /** Sous-arbre géré : l'organisme de la page en tête, puis ses services. */
  organizations: ManagedOrganization[];
  rootId: string | null;
  onClose: () => void;
}) {
  const updateUser = useUpdateOrgUser(organizationId);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [draft, setDraft] = React.useState<AccessDraft>({});
  const [draftError, setDraftError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setDraft(draftFromAgent(user, applications, organizationId, rootId));
    setDraftError(null);
  }, [user, applications, organizationId, rootId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    // Retirer tous les accès passe par « Retirer » : ici, au moins un accès.
    const refusal = validateDraft(draft, applications, organizations);
    if (refusal) {
      setDraftError(refusal);
      return;
    }
    setDraftError(null);
    updateUser.mutate(
      { agent: user, firstName, lastName, draft, applications, rootId },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
              organizations={organizations}
              rootId={rootId}
              value={draft}
              onChange={setDraft}
            />

            {draftError ? <p className="text-sm text-destructive">{draftError}</p> : null}
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
