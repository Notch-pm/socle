import * as React from "react";
import { NavLink, matchPath, useLocation } from "react-router-dom";
import { LayoutDashboard, Building2, LogOut, Plus, Globe, Sparkles } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";
import {
  useAllOrganizations,
  useCreateOrganization,
  sortedRootOrganizations,
  findRootAncestor,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import {
  OrganizationFormDialog,
  type OrganizationFormValues,
} from "@/features/superadmin/organizations/OrganizationFormDialog";
import logo from "@/assets/logo-edilumen.svg";

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-muted",
    isActive && "bg-primary/10 font-semibold text-primary",
  );
}

export function SuperAdminSidebar() {
  const { session, profile, signOut } = useAuth();
  const { data: orgs, isLoading } = useAllOrganizations();
  const createOrg = useCreateOrganization();
  const [createOpen, setCreateOpen] = React.useState(false);

  // Chaque organisation principale = un client : le menu les sépare au lieu
  // de les fondre dans un arbre commun.
  const roots = React.useMemo(() => sortedRootOrganizations(orgs ?? []), [orgs]);

  // Sur la page d'une sous-organisation, l'URL porte l'id de la sous-org :
  // on remonte à la racine pour garder l'entrée du client surlignée.
  const location = useLocation();
  const orgMatch = matchPath(
    { path: "/superadmin/organisations/:orgId", end: false },
    location.pathname,
  );
  const activeRootId = orgMatch?.params.orgId
    ? findRootAncestor(orgs ?? [], orgMatch.params.orgId)?.id
    : undefined;

  function handleCreate(values: OrganizationFormValues) {
    createOrg.mutate(values, { onSuccess: () => setCreateOpen(false) });
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex flex-col gap-1 border-b border-border p-4">
        <img src={logo} alt="Edilumen" className="h-5" />
        <span className="text-xs text-muted-foreground">Administration plateforme</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Plateforme
        </span>
        <ul className="mt-2 flex flex-col gap-0.5">
          <li>
            <NavLink to="/superadmin" end className={navLinkClass}>
              <LayoutDashboard className="size-4" />
              Tableau de bord
            </NavLink>
          </li>

          <li>
            <div className="flex items-center gap-1">
              <span className="flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground/80">
                <Building2 className="size-4" />
                Organisations
              </span>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                aria-label="Nouvelle organisation"
                title="Nouvelle organisation"
                className="rounded-md p-2 text-foreground/60 hover:bg-muted hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            </div>

            {createOrg.error ? (
              <p className="px-3 py-1 text-xs text-destructive">
                {(createOrg.error as Error).message}
              </p>
            ) : null}

            {isLoading || roots.length > 0 ? (
              <ul className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                {isLoading
                  ? [0, 1].map((i) => (
                      <li key={i} className="h-8 animate-pulse rounded-md bg-muted/40" />
                    ))
                  : roots.map((org) => (
                      <li key={org.id}>
                        <NavLink
                          to={`/superadmin/organisations/${org.id}`}
                          className={cn(
                            "flex items-center rounded-md px-3 py-1.5 text-sm text-foreground/80 hover:bg-muted",
                            org.status === "obsolete" && "text-muted-foreground line-through",
                            org.id === activeRootId && "bg-primary/10 font-semibold text-primary",
                          )}
                        >
                          <span className="truncate">{org.name}</span>
                        </NavLink>
                      </li>
                    ))}
              </ul>
            ) : null}
          </li>

          <li>
            <NavLink to="/superadmin/cles-plateforme" className={navLinkClass}>
              <Globe className="size-4" />
              Clés plateforme
            </NavLink>
          </li>

          <li>
            <NavLink to="/superadmin/ia" className={navLinkClass}>
              <Sparkles className="size-4" />
              Assistant IA
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 px-1">
          <div className="truncate text-sm font-medium">{session?.user.email}</div>
          <div className="text-xs text-muted-foreground">
            {profile?.global_role === "super_admin" ? "Super admin" : profile?.global_role}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10"
        >
          <LogOut className="size-4" />
          Déconnexion
        </button>
      </div>

      <OrganizationFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        submitting={createOrg.isPending}
      />
    </aside>
  );
}
