import { useAllOrganizations } from "@/features/superadmin/organizations/useOrganizationsAdmin";

/**
 * Organisations principales (racines) que l'utilisateur peut paramétrer.
 * `useAllOrganizations()` est déjà scopé par RLS (admin → son sous-arbre,
 * superadmin → tout) ; on ne garde que les racines actives.
 */
export function useWritableRootOrganizations() {
  const { data, isLoading, isError } = useAllOrganizations();
  const roots = (data ?? []).filter((o) => o.parent_id === null && o.status !== "obsolete");
  return { data: roots, isLoading, isError };
}
