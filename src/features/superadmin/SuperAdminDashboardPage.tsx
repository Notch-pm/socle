import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, Users, Globe } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiKeys } from "@/features/superadmin/organizations/useApiKeys";
import { countActiveApiKeys } from "@/features/superadmin/organizations/apiKeys";

function useCount(table: "organizations" | "users") {
  return useQuery({
    queryKey: ["superadmin-count", table],
    queryFn: async () => {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function SuperAdminDashboardPage() {
  const { data: orgCount } = useCount("organizations");
  const { data: userCount } = useCount("users");
  // Clés plateforme (périmètre global) : visibles ici parce qu'elles n'apparaissent
  // sur la page d'aucune organisation.
  const { data: platformKeys } = useApiKeys(null);
  const activePlatformKeys = platformKeys ? countActiveApiKeys(platformKeys) : undefined;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administration</h1>
        <p className="text-muted-foreground">Vue d'ensemble de la plateforme Edilumen</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Organisations</CardTitle>
              <p className="text-2xl font-bold">{orgCount ?? "—"}</p>
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Users className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Utilisateurs</CardTitle>
              <p className="text-2xl font-bold">{userCount ?? "—"}</p>
            </div>
          </CardHeader>
        </Card>
        <Link
          to="/superadmin/cles-plateforme"
          className="rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Clés plateforme actives"
        >
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardHeader className="flex-row items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Globe className="size-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Clés plateforme actives</CardTitle>
                <p className="text-2xl font-bold">{activePlatformKeys ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Périmètre : toutes les organisations</p>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
