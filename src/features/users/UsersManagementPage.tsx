import * as React from "react";
import { Plus, Search, Pencil, Trash2, MailPlus, Ban, RotateCcw } from "lucide-react";
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
import {
  useAccessApplications,
  useOrgUsers,
  useRemoveOrgUser,
  useResendInvitation,
  useSetUserStatus,
  type OrgAgent,
} from "@/features/users/useOrgUsers";
import { CreateUserDialog } from "@/features/users/CreateUserDialog";
import { EditUserDialog } from "@/features/users/EditUserDialog";
import { withSocle } from "@/features/users/AccessRolesFields";
import {
  currentRole,
  displayName,
  hasAnyAccess,
  NO_ACCESS,
  type AccessApplication,
} from "@/features/users/agentAccess";

const NO_APPLICATIONS: AccessApplication[] = [];

function RoleCell({ agent, application }: { agent: OrgAgent; application: AccessApplication }) {
  const code = currentRole(agent, application.id);
  if (code === NO_ACCESS) return <span className="text-muted-foreground">—</span>;
  const role = application.roles.find((r) => r.code === code);
  return (
    <Badge variant={role?.isAdmin ? "secondary" : "outline"}>{role?.label ?? code}</Badge>
  );
}

export function UsersManagementPage({ organizationId }: { organizationId: string }) {
  const { data: users, isLoading, isError } = useOrgUsers(organizationId);
  const accessApps = useAccessApplications(organizationId);
  const applications = accessApps.data ?? NO_APPLICATIONS;
  const columns = React.useMemo(() => withSocle(applications), [applications]);
  const removeUser = useRemoveOrgUser(organizationId);
  const resend = useResendInvitation(organizationId);
  const setStatus = useSetUserStatus(organizationId);

  const [search, setSearch] = React.useState("");
  const [showWithoutAccess, setShowWithoutAccess] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<OrgAgent | null>(null);
  const [removing, setRemoving] = React.useState<OrgAgent | null>(null);
  const [toggling, setToggling] = React.useState<OrgAgent | null>(null);
  // Le résultat d'un renvoi d'invitation ou d'un changement de statut, en
  // clair sous la barre d'actions : le serveur tranche et son message
  // s'affiche tel quel.
  const [notice, setNotice] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function resendInvitation(user: OrgAgent) {
    setNotice(null);
    resend.mutate(user.email, {
      onSuccess: (result) =>
        setNotice(
          result.email_sent
            ? { tone: "ok", text: `Invitation renvoyée à ${user.email}.` }
            : {
                tone: "error",
                text: `L'invitation n'a pas pu être envoyée${result.email_error ? ` : ${result.email_error}` : "."}`,
              },
        ),
      onError: (error) => setNotice({ tone: "error", text: error.message }),
    });
  }

  function confirmToggleStatus() {
    if (!toggling) return;
    const agent = toggling;
    const status = agent.status === "suspended" ? "active" : "suspended";
    setNotice(null);
    setStatus.mutate(
      { userId: agent.userId, status },
      {
        onSuccess: () => {
          setToggling(null);
          setNotice({
            tone: "ok",
            text:
              status === "suspended"
                ? `${displayName(agent)} est suspendu(e) dans toutes les applications.`
                : `${displayName(agent)} est réactivé(e).`,
          });
        },
        onError: (error) => {
          setToggling(null);
          setNotice({ tone: "error", text: error.message });
        },
      },
    );
  }

  const all = users ?? [];
  const withoutAccessCount = all.filter((u) => !hasAnyAccess(u)).length;
  const filtered = all.filter((u) => {
    if (!showWithoutAccess && !hasAnyAccess(u)) return false;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={accessApps.isLoading}>
          <Plus />
          Nouvel utilisateur
        </Button>
      </div>

      {withoutAccessCount > 0 ? (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showWithoutAccess}
            onChange={(e) => setShowWithoutAccess(e.target.checked)}
          />
          Afficher les utilisateurs sans accès ({withoutAccessCount})
        </label>
      ) : null}

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={notice.tone === "error" ? "text-sm text-destructive" : "text-sm text-success"}
        >
          {notice.text}
        </p>
      ) : null}

      <Card>
        <CardContent className="overflow-x-auto p-0">
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
                  {columns.map((app) => (
                    <th key={app.id} className="px-4 py-3">
                      {app.name}
                    </th>
                  ))}
                  <th className="w-40 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const suspended = u.status === "suspended";
                  return (
                    <tr key={u.userId} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span className={suspended ? "text-muted-foreground" : undefined}>
                            {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                          </span>
                          {suspended ? <Badge variant="destructive">Suspendu</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      {columns.map((app) => (
                        <td key={app.id} className="px-4 py-3">
                          <RoleCell agent={u} application={app} />
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {/* Seul un accès au Socle passe par une invitation
                              du Socle ; le serveur sait si le compte est
                              encore inactif (409 sinon). */}
                          {u.socle ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Renvoyer l'invitation"
                              disabled={resend.isPending}
                              onClick={() => resendInvitation(u)}
                            >
                              <MailPlus className="size-4" />
                            </Button>
                          ) : null}
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
                            title={suspended ? "Réactiver" : "Suspendre"}
                            onClick={() => setToggling(u)}
                          >
                            {suspended ? <RotateCcw className="size-4" /> : <Ban className="size-4" />}
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
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
        applications={applications}
      />
      <EditUserDialog
        user={editing}
        organizationId={organizationId}
        applications={applications}
        onClose={() => setEditing(null)}
      />

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer « {removing?.email} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette personne perdra ses accès sur cette organisation, dans le Socle comme dans les
              autres applications. Son compte et ses éventuels rattachements à d'autres
              organisations ne sont pas supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removing && removeUser.mutate(removing, { onSuccess: () => setRemoving(null) })}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(toggling)} onOpenChange={(open) => !open && setToggling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggling?.status === "suspended" ? "Réactiver" : "Suspendre"} « {toggling?.email} » ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggling?.status === "suspended"
                ? "Cette personne retrouve les accès qu'elle avait avant sa suspension."
                : "Cette personne perd l'accès à toutes les applications de la gamme. Ses accès sont conservés et reviennent à la réactivation."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleStatus} disabled={setStatus.isPending}>
              {toggling?.status === "suspended" ? "Réactiver" : "Suspendre"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
