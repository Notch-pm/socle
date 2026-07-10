import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";

export interface WritableOrganization {
  id: string;
  name: string;
}

/**
 * Organizations the current user can create/edit categories for.
 * A category write requires is_org_admin(organization_id) at the RLS layer
 * — super_admin bypasses that check entirely, so they can target any
 * organization; everyone else is limited to organizations where they hold
 * the 'admin' role in user_organizations.
 */
export function useWritableOrganizations() {
  const { session, profile } = useAuth();
  const isSuperAdmin = profile?.global_role === "super_admin";

  return useQuery({
    queryKey: ["writable-organizations", session?.user.id, isSuperAdmin],
    enabled: Boolean(session) && Boolean(profile),
    queryFn: async (): Promise<WritableOrganization[]> => {
      if (isSuperAdmin) {
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name")
          .order("name", { ascending: true });
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase
        .from("user_organizations")
        .select("organization_id, organizations(id, name)")
        .eq("user_id", session!.user.id)
        .eq("role", "admin");
      if (error) throw error;

      return data
        .map((row) => row.organizations)
        .filter((org): org is WritableOrganization => org !== null);
    },
  });
}
