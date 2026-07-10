import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { UsersManagementPage } from "@/features/users/UsersManagementPage";

/**
 * SOCLE has no organization switcher yet (see UI_ARCHITECTURE.md open points),
 * so this resolves "the current organization" as the caller's own first
 * membership. Once a switcher exists, this should read the selected org instead.
 */
function useMyOrganizationId() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["my-first-organization", session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_organizations")
        .select("organization_id")
        .eq("user_id", session!.user.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.organization_id ?? null;
    },
  });
}

export function UtilisateursPage() {
  const { data: organizationId, isLoading } = useMyOrganizationId();

  return (
    <div className="p-6">
      <PageHeader
        title="Utilisateurs & rôles"
        subtitle="Gérez les membres et leurs rôles au sein de votre organisation."
      />
      {isLoading ? (
        <div className="h-12 animate-pulse rounded-lg bg-muted/40" />
      ) : !organizationId ? (
        <EmptyState message="Vous n'êtes rattaché à aucune organisation." />
      ) : (
        <UsersManagementPage organizationId={organizationId} />
      )}
    </div>
  );
}
