import { NavLink } from "react-router-dom";
import { House, Network, ListChecks, LayoutTemplate, Tags, FileCheck2, FileSignature, MapPin, Users, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ⚠️ **52 px — LA MESURE DE LA GAMME**, pas un choix de Socle. Iris, Clara et
 * Ariane peignent tous un rail de `w-[52px] py-3` à tuiles de 36 px : le rail
 * est le repère qu'un agent retrouve d'une application à l'autre, une largeur
 * qui diverge est précisément ce qu'il remarque en changeant d'outil. Socle a
 * vécu jusqu'au 2026-09-10 sur 68 px à tuiles de 44 px — c'était le seul écart.
 *
 * Exportée parce que l'**en-tête s'en sert** : le lanceur d'applications occupe
 * une colonne de cette largeur pour tomber exactement sur l'axe vertical des
 * icônes de navigation. Une classe littérale, et non un calcul : Tailwind ne
 * voit que ce qui est écrit tel quel dans le source.
 */
export const RAIL_WIDTH_CLASS = "w-[52px]";

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
          // 36 px : la tuile de la gamme (Iris, Clara, Ariane).
          "flex h-9 w-9 items-center justify-center rounded-lg text-primary-foreground/70 transition-colors",
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
      ⚠️ **DISPOSITION DE LA GAMME**, à l'identique d'Iris, de Clara et
      d'Ariane : le tableau de bord **épinglé tout en haut**, le reste
      **centré dans la hauteur du rail** — et centré sur le rail ENTIER
      (`absolute inset-0`), pas sur la place qui reste sous le tableau de bord,
      sans quoi le groupe tomberait plus bas que dans les autres applications.
      Aucune pastille de produit au-dessus (il se nomme dans l'en-tête), aucun
      trait de séparation.
    */
    <nav
      aria-label="Navigation principale"
      className={cn(
        "relative flex h-full shrink-0 flex-col items-center bg-primary py-3",
        RAIL_WIDTH_CLASS,
      )}
    >
      <Tile item={PINNED} />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <div className="pointer-events-auto flex flex-col items-center gap-0.5">
          {ITEMS.map((item) => (
            <Tile key={item.to} item={item} />
          ))}
        </div>
      </div>
    </nav>
  );
}
