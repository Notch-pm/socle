import * as React from "react";
import { LogOut, ChevronsUpDown } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  useAllOrganizations,
  visibleRootOrganizations,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import logo from "@/assets/logo-edilumen.svg";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
}

/**
 * Logo de la collectivité. `logo_url` est une URL libre saisie dans la fiche :
 * elle peut pointer vers un fichier disparu. On escamote alors l'image plutôt
 * que de laisser l'icône de vignette cassée du navigateur dans l'en-tête — le
 * nom, lui, suffit à identifier.
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
      className="h-6 w-auto max-w-[120px] shrink-0 object-contain"
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

  // Identité de la collectivité, à droite du produit — motif du shell de la
  // gamme (Iris, Clara) : wordmark, séparateur, tenant. Les sommets de la forêt
  // VISIBLE, donc rien de plus que ce que le RLS laisse voir : un membre d'une
  // sous-organisation y lit la sienne, faute de voir sa racine.
  const { data: organizations } = useAllOrganizations();
  const roots = visibleRootOrganizations(organizations ?? []);
  const main = roots[0];
  // Le Socle n'a pas de bascule de tenant (chaque écran a son sélecteur) : on
  // nomme la première et on ANNONCE les autres plutôt que de les taire.
  const others = roots.length - 1;
  const allNames = roots.map((o) => o.name).join(" · ");

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4">
      <div className="flex min-w-0 items-center gap-3">
        <img src={logo} alt="Edilumen" className="h-5 shrink-0" />
        <span className="shrink-0 text-sm font-semibold tracking-tight">Socle</span>
        {main ? (
          <>
            <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
            <OrgLogo url={main.logo_url} name={main.name} />
            <span className="truncate text-sm font-medium text-muted-foreground" title={allNames}>
              {main.name}
            </span>
            {others > 0 ? (
              <span
                title={allNames}
                className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              >
                +{others}
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
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
