import * as React from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useOrgUsers, useRemoveOrgUser, type OrgUser } from "@/features/users/useOrgUsers";
import { CreateUserDialog } from "@/features/users/CreateUserDialog";
import { EditUserDialog } from "@/features/users/EditUserDialog";

const roleLabel: Record<string, string> = { admin: "Administrateur", consultant: "Consultant" };

export function UsersManagementPage({ organizationId }: { organizationId: string }) {
  const { data: users, isLoading, isError } = useOrgUsers(organizationId);
  const removeUser = useRemoveOrgUser(organizationId);

  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<OrgUser | null>(null);
  const [removing, setRemoving] = React.useState<OrgUser | null>(null);

  const filtered = (users ?? []).filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Nouvel utilisateur
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              {[0, 1].map((i) => (
                <div key={i} className="h-12 animate-pulse border-b border-border bg-muted/40 last:border-b-0" />
              ))}
            </div>
          ) : isError ? (
            <p className="p-4 text-sm text-destructive">Impossible de charger les utilisateurs.</p>
          ) : !filtered.length ? (
            <div className="p-4">
              <EmptyState
                message={
                  search
                    ? "Aucun utilisateur ne correspond à cette recherche."
                    : "Aucun utilisateur. Cliquez sur « Nouvel utilisateur »."
                }
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="w-24 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.membershipId} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === "admin" ? "secondary" : "outline"}>
                        {roleLabel[u.role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Modifier"
                          onClick={() => setEditing(u)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Retirer"
                          onClick={() => setRemoving(u)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} organizationId={organizationId} />
      <EditUserDialog user={editing} organizationId={organizationId} onClose={() => setEditing(null)} />

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer « {removing?.email} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette personne perdra l'accès à cette organisation. Son compte et ses éventuels
              rattachements à d'autres organisations ne sont pas supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removing && removeUser.mutate(removing.membershipId, { onSuccess: () => setRemoving(null) })}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
