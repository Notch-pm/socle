import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Chargement…
    </div>
  );
}

/**
 * Compte suspendu (`users.status`, RPC `set_user_status`). Le serveur l'a déjà
 * banni : sa session ne se rafraîchira plus. Cet écran ne fait que le dire
 * pendant que le jeton en cours expire.
 */
function SuspendedScreen() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center text-sm">
      <p className="font-semibold">Votre compte est suspendu.</p>
      <p className="text-muted-foreground">Contactez l'administrateur de votre collectivité.</p>
      <button type="button" className="text-primary underline" onClick={() => void signOut()}>
        Se déconnecter
      </button>
    </div>
  );
}

/** Regular (per-organization) app routes — super admins are routed to /superadmin instead. */
export function ProtectedRoute() {
  const { session, loading, profile } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (profile?.status === "suspended") return <SuspendedScreen />;
  if (profile?.global_role === "super_admin") return <Navigate to="/superadmin" replace />;

  return <Outlet />;
}

/** /superadmin routes — only reachable by super_admin. */
export function SuperAdminRoute() {
  const { session, loading, profile } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.global_role !== "super_admin") return <Navigate to="/" replace />;

  return <Outlet />;
}
