import * as React from "react";
import { LogOut, ChevronsUpDown } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import logo from "@/assets/logo-edilumen.svg";

function initials(email: string) {
  return email.slice(0, 2).toUpperCase();
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

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <img src={logo} alt="Edilumen" className="h-5" />
      </div>

      <div ref={menuRef} className="relative">
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
