import { NavLink } from "react-router-dom";
import { House, Network, ListChecks, LayoutTemplate, Tags, FileCheck2, FileSignature, MapPin, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Largeur du rail, **partagée avec l'en-tête** : le lanceur d'applications
 * occupe une colonne de cette largeur pour tomber exactement sur l'axe
 * vertical des icônes de navigation. Une classe littérale, et non un calcul :
 * Tailwind ne voit que ce qui est écrit tel quel dans le source.
 */
export const RAIL_WIDTH_CLASS = "w-[68px]";

interface NavItem {
  to: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

/**
 * ⚠️ **UNE MAISON, PAS LE DAMIER** de quatre carrés qu'on attend d'un « tableau
 * de bord » : ce motif est celui du **lanceur d'applications**, posé juste
 * au-dessus dans l'en-tête, sur le même axe vertical. Deux damiers l'un sous
 * l'autre se liraient l'un pour l'autre. La maison dit ce qu'est cet écran
 * ici : le point de départ.
 */
const PINNED: NavItem = { to: "/", title: "Tableau de bord", icon: House, end: true };

const ITEMS: NavItem[] = [
  { to: "/organisations", title: "Organisations", icon: Network },
  { to: "/demarches", title: "Démarches", icon: ListChecks },
  // La face publique des démarches : la page d'accueil que les usagers voient.
  { to: "/site-de-demarches", title: "Site de démarches", icon: LayoutTemplate },
  { to: "/categories", title: "Catégories", icon: Tags },
  { to: "/types-pieces", title: "Types de pièce justificative", icon: FileCheck2 },
  { to: "/documents", title: "Documents", icon: FileSignature },
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
    /*
      ⚠️ Le rail **commence** par le tableau de bord, et tout coule depuis le
      haut : aucune pastille de produit au-dessus (l'application se nomme dans
      l'en-tête, à droite), aucun trait de séparation. C'est aussi ce qui rend
      les positions **stables** — centrer les entrées dans la hauteur
      disponible les faisait glisser à chaque redimensionnement, alors qu'un
      agent les vise de mémoire.
    */
    <nav
      aria-label="Navigation principale"
      className={cn(
        "flex shrink-0 flex-col items-center gap-2 overflow-y-auto bg-primary py-4",
        RAIL_WIDTH_CLASS,
      )}
    >
      <Tile item={PINNED} />
      {ITEMS.map((item) => (
        <Tile key={item.to} item={item} />
      ))}
    </nav>
  );
}
