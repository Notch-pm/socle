import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  ChevronRight,
  Database,
  FileCheck2,
  FileSignature,
  House,
  LayoutTemplate,
  ListChecks,
  MapPin,
  Network,
  Plug,
  Sparkles,
  Tags,
} from "lucide-react";
import { API_DOC_LINKS, apiDocLinkTitle, type ApiDocLink } from "@/features/public-api-docs/apiDocLinks";
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

export interface NavItem {
  to: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

export interface RailGroup {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Sous-rubriques de la bulle ; `label` vide = pas d'intertitre. */
  sections: { label?: string; items: NavItem[] }[];
}

export type RailEntry =
  | ({ kind: "link" } & NavItem)
  | ({ kind: "group" } & RailGroup)
  | { kind: "separator" };

/**
 * ⚠️ **UNE MAISON, PAS LE DAMIER** de quatre carrés qu'on attend d'un « tableau
 * de bord » : ce motif est celui du **lanceur d'applications**, posé juste
 * au-dessus dans l'en-tête, sur le même axe vertical. Deux damiers l'un sous
 * l'autre se liraient l'un pour l'autre. La maison dit ce qu'est cet écran
 * ici : le point de départ.
 */
const PINNED: NavItem = { to: "/", title: "Tableau de bord", icon: House, end: true };

/**
 * ⚠️ **QUELQUES LIENS, DES RUBRIQUES EN BULLES** (navigation v2, 2026-10-24).
 * Le rail portait onze entrées à plat : on ne s'y repérait plus. Restent en
 * liens directs ce qu'on ouvre tous les jours (le catalogue de démarches est
 * le cœur du paramétrage, il ne se range pas dans une bulle) ; le reste se
 * range par rubrique, une bulle s'ouvrant au clic à côté de la tuile.
 *
 * Utilisateurs et rôles n'y sont plus : c'est l'administration de
 * l'application, pas un contenu qu'on paramètre — l'icône « Paramètres » de
 * l'en-tête y mène, comme dans Clara et Iris.
 *
 * Les URL suivent les rubriques (`/referentiels/…`) : elles ont changé sans
 * redirection le 2026-10-24, le Socle ne servant alors que des démonstrations.
 */
export const RAIL: RailEntry[] = [
  { kind: "link", to: "/organisations", title: "Organisations", icon: Network },
  { kind: "link", to: "/demarches", title: "Démarches", icon: ListChecks },
  // La face publique des démarches : la page d'accueil que les usagers voient.
  { kind: "link", to: "/site-de-demarches", title: "Site de démarches", icon: LayoutTemplate },
  {
    kind: "group",
    id: "referentiels",
    title: "Référentiels",
    icon: Database,
    sections: [
      {
        items: [
          { to: "/referentiels/categories", title: "Catégories", icon: Tags },
          { to: "/referentiels/types-pieces", title: "Types de pièce justificative", icon: FileCheck2 },
          // « Modèles de », pour ne plus se confondre avec les documents des
          // bases de connaissances.
          { to: "/referentiels/modeles-documents", title: "Modèles de documents", icon: FileSignature },
          { to: "/referentiels/quartiers", title: "Quartiers", icon: MapPin },
        ],
      },
    ],
  },
  { kind: "separator" },
  // Consultation, pas paramétrage : d'où leur place en fin de rail, sous le
  // séparateur. Les intégrations se configurent chez le super admin ; ici, on
  // les voit.
  { kind: "link", to: "/integrations", title: "Intégrations", icon: Plug },
  { kind: "link", to: "/consommation-ia", title: "Consommation IA", icon: Sparkles },
];

/** Le chemin courant est-il celui de `to`, ou une page sous lui ? */
export function isUnder(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Une rubrique est active quand l'écran courant est l'une de ses pages. */
export function isGroupActive(group: RailGroup, pathname: string) {
  return group.sections.some((s) => s.items.some((item) => isUnder(pathname, item.to)));
}

/**
 * ⚠️ **LA COULEUR DU RAIL EST PROPRE À CHAQUE APPLICATION** : ce que la gamme
 * partage, c'est sa forme (largeur, tuiles, disposition), pas sa teinte. Au
 * 2026-09-11 : Socle en beurre (`#FFCC57`) à icônes bleu nuit, Clara en bleu
 * nuit (`#0B132B`), Iris et Ariane en primaire verte. Une couleur qui diffère
 * d'un produit à l'autre n'est pas un écart à réaligner.
 *
 * Fond et icônes passent par le jeton du rail, `--rail` / `--rail-foreground`
 * (`index.css`) : le fond est la secondaire beurre du design system, les
 * icônes sont bleu nuit `#0B132B`, **à pleine opacité dans tous les états** —
 * 12,3 : 1 au repos, 10 : 1 en survol, 8 : 1 sur la tuile active. ⚠️ Le brun
 * `secondary-foreground` à 80 %, essayé d'abord, ressortait mal sur le jaune.
 * C'est la tuile qui marque l'état, en assombrissant le fond au lieu de
 * l'éclaircir : sur un fond clair, c'est l'ombre qui se voit.
 *
 * Changer de couleur, c'est changer le jeton ET son jeton de contraste
 * (`bg-X` / `text-X-foreground`) : un `white/…` ou `black/…` en dur ne suit
 * plus le fond.
 */
const TILE_CLASS = cn(
  // 36 px : la tuile de la gamme (Iris, Clara, Ariane).
  "flex h-9 w-9 items-center justify-center rounded-lg text-rail-foreground transition-colors",
  "hover:bg-rail-foreground/10",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rail-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-rail",
);

function Tile({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.title}
      aria-label={item.title}
      className={({ isActive }) => cn(TILE_CLASS, isActive && "bg-rail-foreground/20")}
    >
      <Icon className="size-5" />
    </NavLink>
  );
}

/**
 * ⚠️ **UNE RUBRIQUE S'OUVRE EN BULLE, ELLE NE MÈNE NULLE PART.** Le bouton ne
 * navigue pas : il ouvre, à droite du rail, la liste des pages de la rubrique.
 * La tuile est marquée active quand on se trouve sur l'une d'elles — c'est ce
 * qui dit à l'agent où il est, une fois la bulle refermée. Le petit chevron
 * distingue, au repos, une rubrique d'un lien direct.
 *
 * Motif de disclosure (`aria-expanded`/`aria-controls`), comme le lanceur
 * d'applications : la bulle se ferme au clic dehors, sur Échap (le focus
 * revient alors au bouton) et dès qu'on choisit une page.
 */
function GroupTile({
  group,
  open,
  onToggle,
  onClose,
}: {
  group: RailGroup;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { pathname } = useLocation();
  const active = isGroupActive(group, pathname);
  const ref = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelId = `rail-bulle-${group.id}`;
  const Icon = group.icon;

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        title={group.title}
        aria-label={group.title}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // Pour les tests : l'état actif ne se lit autrement que dans la classe.
        data-active={active || undefined}
        className={cn(
          TILE_CLASS,
          "relative",
          open ? "bg-rail-foreground/10" : active && "bg-rail-foreground/20",
        )}
      >
        <Icon className="size-5" />
        {open ? null : (
          <ChevronRight aria-hidden="true" className="absolute right-0 top-1/2 size-2.5 -translate-y-1/2" />
        )}
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute left-full top-0 z-40 ml-3.5 w-64 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-socle-lg"
        >
          <p className="px-2 pb-1.5 pt-1 text-sm font-bold">{group.title}</p>
          {group.sections.map((section, i) => (
            <div key={section.label ?? i} className={cn(i > 0 && "mt-1 border-t border-border pt-1")}>
              {section.label ? (
                <p className="px-2 pb-1 pt-1.5 text-xs font-semibold text-muted-foreground">
                  {section.label}
                </p>
              ) : null}
              <ul>
                {section.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isActive
                              ? "bg-primary/10 font-semibold text-primary"
                              : "font-medium hover:bg-muted",
                          )
                        }
                      >
                        <ItemIcon className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{item.title}</span>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * ⚠️ **UN LIEN SORTANT, PAS UNE SECTION DE L'APPLICATION.** Une documentation
 * d'API s'ouvre dans un **nouvel onglet** — on ne quitte pas un paramétrage en
 * cours pour aller lire un contrat —, elle ne porte donc jamais d'état actif :
 * l'écran actif est resté derrière. D'où un `a` et non un `NavLink`, et le pied
 * du rail plutôt que le groupe centré, qui est la navigation de l'application.
 *
 * L'intitulé **annonce le nouvel onglet** (`apiDocLinkTitle`) : dans un rail
 * d'icônes, c'est le seul endroit où le prévenir.
 */
function DocTile({ link }: { link: ApiDocLink }) {
  const Icon = link.icon;
  const title = apiDocLinkTitle(link);
  return (
    <a
      href={link.path}
      target="_blank"
      rel="noreferrer"
      title={title}
      aria-label={title}
      className={TILE_CLASS}
    >
      <Icon className="size-5" />
    </a>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const [openGroup, setOpenGroup] = React.useState<string | null>(null);
  const closeGroup = React.useCallback(() => setOpenGroup(null), []);
  // Une page choisie ailleurs (lien, retour arrière) referme la bulle.
  React.useEffect(() => setOpenGroup(null), [pathname]);

  return (
    /*
      ⚠️ **DISPOSITION DE LA GAMME**, à l'identique d'Iris, de Clara et
      d'Ariane : le tableau de bord **épinglé tout en haut**, le reste
      **centré dans la hauteur du rail** — et centré sur le rail ENTIER
      (`absolute inset-0`), pas sur la place qui reste sous le tableau de bord,
      sans quoi le groupe tomberait plus bas que dans les autres applications.
      Aucune pastille de produit au-dessus (il se nomme dans l'en-tête), aucun
      trait de séparation, sauf celui qui isole la consultation (intégrations,
      consommation IA) du paramétrage. En pied de rail, hors de ce groupe : les
      documentations d'API, qui sortent de l'application (voir `DocTile`).
    */
    <nav
      aria-label="Navigation principale"
      className={cn(
        "relative flex h-full shrink-0 flex-col items-center bg-rail py-3",
        RAIL_WIDTH_CLASS,
      )}
    >
      <Tile item={PINNED} />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <div className="pointer-events-auto flex flex-col items-center gap-0.5">
          {RAIL.map((entry, i) =>
            entry.kind === "link" ? (
              <Tile key={entry.to} item={entry} />
            ) : entry.kind === "group" ? (
              <GroupTile
                key={entry.id}
                group={entry}
                open={openGroup === entry.id}
                onToggle={() => setOpenGroup((id) => (id === entry.id ? null : entry.id))}
                onClose={closeGroup}
              />
            ) : (
              <div key={`sep-${i}`} aria-hidden="true" className="my-1.5 h-px w-6 bg-rail-foreground/20" />
            ),
          )}
        </div>
      </div>
      {/*
        Les documentations d'API en pied de rail, comme le tableau de bord en
        tête : hors du groupe centré, qui reste la navigation de l'application.
      */}
      <div className="mt-auto flex flex-col items-center gap-0.5">
        {API_DOC_LINKS.map((link) => (
          <DocTile key={link.path} link={link} />
        ))}
      </div>
    </nav>
  );
}
