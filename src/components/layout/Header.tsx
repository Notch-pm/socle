import * as React from "react";
import { LogOut, ChevronsUpDown } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  useAllOrganizations,
  visibleRootOrganizations,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { AppLauncher } from "@/components/layout/AppLauncher";
import { RAIL_WIDTH_CLASS } from "@/components/layout/Sidebar";
import { CURRENT_APP, appInitial } from "@/components/layout/suiteApps";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo-edilumen.svg";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

/**
 * Logo de la collectivité, **à nu** : pas de pastille ni de cadre autour. Un
 * logo est déjà une identité graphique — l'enfermer dans une capsule de
 * couleur le met en concurrence avec elle et le rend illisible.
 *
 * `logo_url` est une URL libre saisie dans la fiche : elle peut pointer vers un
 * fichier disparu. On escamote alors l'image plutôt que de laisser l'icône de
 * vignette cassée du navigateur dans l'en-tête — le nom, à côté, suffit à
 * identifier.
 *
 * ⚠️ Hauteur fixe, largeur LIBRE (bornée). Les logos de collectivité sont le
 * plus souvent des bandeaux larges : les enfermer dans un carré de 24 px les
 * réduit à une tache illisible. On les traite comme un wordmark, à la hauteur
 * de celui d'Edilumen.
 */
function OrgLogo({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => setBroken(false), [url]);
  if (!url || broken) return null;
  return (
    <img
      src={url}
      alt={name}
      onError={() => setBroken(true)}
      className="h-7 w-auto max-w-[100px] shrink-0 object-contain sm:max-w-[140px]"
    />
  );
}

export function Header() {
  const { session, profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const email = session?.user.email ?? "";

  // Identité de la collectivité — les sommets de la forêt VISIBLE, donc rien
  // de plus que ce que le RLS laisse voir : un membre d'une sous-organisation
  // y lit la sienne, faute de voir sa racine.
  const { data: organizations } = useAllOrganizations();
  const roots = visibleRootOrganizations(organizations ?? []);
  const main = roots[0];
  // Le Socle n'a pas de bascule de tenant (chaque écran a son sélecteur) : on
  // nomme la première et on ANNONCE les autres plutôt que de les taire.
  const others = roots.length - 1;
  const allNames = roots.map((o) => o.name).join(" · ");

  return (
    /**
     * ⚠️ **QUI L'ON SERT À GAUCHE, AVEC QUOI À DROITE.** Le nom et le logo de
     * la collectivité suivent immédiatement le wordmark Edilumen : c'est le
     * contexte de tout ce que l'agent voit à l'écran, et il ne se lit pas dans
     * une capsule qui concurrencerait le logo. Le produit (« Socle ») se pose
     * à l'autre bout, contre le menu utilisateur — c'est un repère de
     * navigation entre applications, pas le sujet de la page.
     */
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card pr-4">
      {/*
        Colonne de la largeur du rail : le lanceur tombe ainsi exactement sur
        l'axe vertical des icônes de navigation, juste au-dessus d'elles.
      */}
      <div className={cn("flex shrink-0 justify-center", RAIL_WIDTH_CLASS)}>
        <AppLauncher organizationName={main?.name} />
      </div>

      <img src={logo} alt="Edilumen" className="h-6 shrink-0 object-contain" />

      {main ? (
        <>
          <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-2.5" title={allNames}>
            <OrgLogo url={main.logo_url} name={main.name} />
            <span className="truncate text-sm font-semibold">{main.name}</span>
            {others > 0 ? (
              <span
                title={allNames}
                className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
              >
                +{others}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="min-w-2 flex-1" />

      <div className="flex shrink-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary"
        >
          {appInitial(CURRENT_APP)}
        </span>
        <span className="text-base font-bold tracking-tight text-primary">
          {CURRENT_APP.name}
        </span>
      </div>

      <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials(email)}
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-2 w-56 rounded-lg border border-border bg-popover p-1 shadow-socle-md"
          >
            <div className="px-3 py-2">
              <div className="truncate text-sm font-medium">{email}</div>
              <div className="text-xs text-muted-foreground">
                {profile?.global_role ?? "…"}
              </div>
            </div>
            <div className="my-1 h-px bg-border" />
            <button
              role="menuitem"
              onClick={() => void signOut()}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-4" />
              Déconnexion
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
