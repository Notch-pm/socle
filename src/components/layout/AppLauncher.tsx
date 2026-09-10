import * as React from "react";
import { Check, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUITE_APPS, CURRENT_APP, appUrl, appInitial, type SuiteApp } from "./suiteApps";

const CARD = "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors";

function AppBody({ app, current }: { app: SuiteApp; current: boolean }) {
  return (
    <>
      <span className="flex w-full items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md text-sm font-bold",
            current ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
          )}
        >
          {appInitial(app)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{app.name}</span>
        {current ? <Check className="size-4 shrink-0 text-primary" /> : null}
      </span>
      <span className="text-xs text-muted-foreground">{app.tagline}</span>
    </>
  );
}

/**
 * ⚠️ L'application **courante** n'est pas un lien : s'y « rendre » rechargerait
 * la page pour aboutir là où l'on est déjà. Elle se coche, elle ne se clique
 * pas — d'où le `div` plutôt qu'un `a` désactivé, qui resterait tabulable.
 */
function AppCard({ app }: { app: SuiteApp }) {
  const current = app.key === CURRENT_APP.key;
  if (current) {
    return (
      <div aria-current="page" className={cn(CARD, "border-primary bg-primary/5")}>
        <AppBody app={app} current />
      </div>
    );
  }
  return (
    <a
      role="menuitem"
      href={appUrl(app)}
      className={cn(
        CARD,
        "border-border bg-card hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <AppBody app={app} current={false} />
    </a>
  );
}

/**
 * Lanceur d'applications de l'en-tête : le motif « quatre carrés », dans le
 * coin gauche, ouvre la grille des produits de la gamme.
 *
 * ⚠️ **Le motif des quatre carrés est RÉSERVÉ à ce bouton** — c'est pour cela
 * que le tableau de bord du rail porte désormais une maison : les deux tombent
 * sur le même axe vertical, deux damiers l'un sous l'autre se liraient l'un
 * pour l'autre.
 *
 * ⚠️ **Même gabarit qu'une tuile du rail** (36 px, `rounded-lg`, sans bordure —
 * la mesure de la gamme) : le bouton se lit comme la tête de la colonne de
 * navigation, pas comme un bouton d'en-tête posé là par hasard. Changer la
 * taille des tuiles du rail demande de changer celle-ci.
 *
 * ⚠️ **On quitte le Socle, on ne change pas de collectivité** : le pied du
 * panneau le dit, parce que rien d'autre à l'écran ne le dirait. L'agent
 * arrive chez le voisin sur la même organisation.
 */
export function AppLauncher({ organizationName }: { organizationName?: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Changer d'application"
        title="Changer d'application"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LayoutGrid className="size-5" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Applications de la gamme"
          className="absolute left-0 top-full z-40 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-3 shadow-socle-lg"
        >
          <p className="px-1 pb-2 text-xs font-semibold text-muted-foreground">
            Changer d'application
          </p>

          <div className="grid grid-cols-2 gap-2">
            {SUITE_APPS.map((app) => (
              <AppCard key={app.key} app={app} />
            ))}
          </div>

          {organizationName ? (
            <p className="mt-2.5 border-t border-border pt-2.5 text-xs text-muted-foreground">
              Vous restez sur l'organisation {organizationName}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
