import { NavLink } from "react-router-dom";
import { LayoutDashboard, Building2, LogOut } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo-edilumen.svg";

const ITEMS = [
  { to: "/superadmin", title: "Tableau de bord", icon: LayoutDashboard, end: true },
  { to: "/superadmin/organisations", title: "Organisations", icon: Building2, end: false },
];

export function SuperAdminSidebar() {
  const { session, profile, signOut } = useAuth();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex flex-col gap-1 border-b border-border p-4">
        <img src={logo} alt="Edilumen" className="h-5" />
        <span className="text-xs text-muted-foreground">Administration plateforme</span>
      </div>

      <nav className="flex-1 p-2">
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Plateforme
        </span>
        <ul className="mt-2 flex flex-col gap-0.5">
          {ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground/80 hover:bg-muted",
                    isActive && "bg-primary/10 font-semibold text-primary",
                  )
                }
              >
                <item.icon className="size-4" />
                {item.title}
              </NavLink>
            </li>
          ))}
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
    </aside>
  );
}
