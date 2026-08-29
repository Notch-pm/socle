import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";

export interface AdminRootOrganization {
  id: string;
  name: string;
}

interface MembershipRow {
  organizations: { id: string; name: string; parent_id: string | null; status: string } | null;
}

/**
 * Organisations principales dont l'utilisateur est ADMINISTRATEUR DIRECT.
 *
 * Pourquoi pas `useWritableRootOrganizations` : celui-là part des organisations
 * VISIBLES (RLS `has_org_access` compris), donc il rend aussi les racines dont
 * l'utilisateur n'est qu'un membre ordinaire. Sur cet écran, ça peuplerait un
 * sélecteur d'organisations dont la consommation revient vide sous RLS —
 * l'utilisateur lirait « 0 jeton, aucun plafond » là où la vraie réponse est
 * « ce n'est pas à vous ». Un écran qui affiche un zéro faux est pire qu'un
 * écran qui ne s'affiche pas.
 *
 * Le prédicat reproduit celui des policies `ai_usage_*_select`
 * (`is_admin_of_self_or_ancestor`), qui coïncide avec « admin direct » sur des
 * lignes clés sur une racine — une racine n'a pas d'ancêtre.
 *
 * Pas de branche super admin : `ProtectedRoute` le renvoie vers `/superadmin`,
 * il ne voit jamais cette page. La sienne existe, et elle est inter-clients.
 */
export function useAdminRootOrganizations() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ["ai-usage-admin-roots", userId] as const,
    enabled: Boolean(userId),
    queryFn: async (): Promise<AdminRootOrganization[]> => {
      const { data, error } = await supabase
        .from("user_organizations")
        .select("organizations(id, name, parent_id, status)")
        .eq("user_id", userId!)
        .eq("role", "admin");
      if (error) throw error;

      return ((data ?? []) as MembershipRow[])
        .map((row) => row.organizations)
        .filter((org): org is NonNullable<MembershipRow["organizations"]> =>
          org !== null && org.parent_id === null && org.status !== "obsolete")
        .map((org) => ({ id: org.id, name: org.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
