import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Chargement…
    </div>
  );
}

/** Regular (per-organization) app routes — super admins are routed to /superadmin instead. */
export function ProtectedRoute() {
  const { session, loading, profile } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
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
