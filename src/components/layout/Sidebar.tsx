import { NavLink } from "react-router-dom";
import { LayoutDashboard, Network, ListChecks, Tags, FileCheck2, MapPin, Users, Sparkles } from "lucide-react";
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
  { to: "/quartiers", title: "Quartiers", icon: MapPin },
  { to: "/utilisateurs", title: "Utilisateurs & rôles", icon: Users },
  // Consultation, pas paramétrage : d'où sa place en fin de rail.
  { to: "/consommation-ia", title: "Consommation IA", icon: Sparkles },
];

/**
 * ⚠️ RAIL VERT (`bg-primary`), et non le charbon-forêt des tokens
 * `--sidebar-*`. C'est le shell de la gamme : Iris et Clara peignent le leur
 * avec la primaire (`153 90% 32%`, identique dans les trois projets) et
 * réservent les tokens `--sidebar-*` à d'autres usages. Le rail est le repère
 * visuel qu'un agent retrouve d'une application à l'autre — le diviser serait
 * la seule chose que l'utilisateur remarquerait en changeant d'outil.
 *
 * Les états se déclinent donc sur `primary-foreground` (le blanc du texte sur
 * la primaire) et non sur `white/…` : sur un fond coloré, une opacité de blanc
 * en dur et le jeton de contraste ne sont plus la même chose.
 */
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
          "flex h-11 w-11 items-center justify-center rounded-lg text-primary-foreground/70 transition-colors",
          "hover:bg-primary-foreground/10 hover:text-primary-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary",
          isActive && "bg-primary-foreground/20 text-primary-foreground",
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
      className="flex w-[68px] shrink-0 flex-col items-center bg-primary py-4"
    >
      <Tile item={PINNED} />
      <div className="my-3 h-px w-8 bg-primary-foreground/20" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        {ITEMS.map((item) => (
          <Tile key={item.to} item={item} />
        ))}
      </div>
    </nav>
  );
}
