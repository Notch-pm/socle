import { NavLink } from "react-router-dom";
import { LayoutDashboard, Network, ListChecks, Tags, FileCheck2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const PINNED: NavItem = { to: "/", title: "Tableau de bord", icon: LayoutDashboard, end: true };

const ITEMS: NavItem[] = [
  { to: "/organisations", title: "Organisations", icon: Network },
  { to: "/demarches", title: "Démarches", icon: ListChecks },
  { to: "/categories", title: "Catégories", icon: Tags },
  { to: "/types-pieces", title: "Types de pièce justificative", icon: FileCheck2 },
  { to: "/utilisateurs", title: "Utilisateurs & rôles", icon: Users },
];

function Tile({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.title}
      aria-label={item.title}
      className={({ isActive }) =>
        cn(
          "flex h-11 w-11 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-sidebar-foreground",
          isActive && "bg-white/15 text-sidebar-foreground",
        )
      }
    >
      <Icon className="size-5" />
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <nav
      aria-label="Navigation principale"
      className="flex w-[68px] shrink-0 flex-col items-center bg-sidebar py-4"
    >
      <Tile item={PINNED} />
      <div className="my-3 h-px w-8 bg-white/10" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        {ITEMS.map((item) => (
          <Tile key={item.to} item={item} />
        ))}
      </div>
    </nav>
  );
}
