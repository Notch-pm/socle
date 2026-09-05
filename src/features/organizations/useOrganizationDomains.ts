import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database.types";

const ORGANIZATION_DOMAINS_KEY = ["organization-domains"] as const;

/** Code d'erreur Postgres pour une violation de contrainte d'unicité. */
export const UNIQUE_VIOLATION = "23505";

export type OrganizationDomain = Tables<"organization_domains">;

/**
 * Domaines d'une organisation. Le domaine canonique remonte en tête : c'est
 * celui qu'on écrit dans un lien, il doit se lire en premier.
 */
export function useOrganizationDomains(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: [...ORGANIZATION_DOMAINS_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_domains")
        .select("*")
        .eq("organization_id", organizationId!)
        .order("is_primary", { ascending: false })
        .order("hostname", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateOrganizationDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { organization_id: string; hostname: string; is_primary: boolean }) => {
      const { error } = await supabase.from("organization_domains").insert(input);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ORGANIZATION_DOMAINS_KEY }),
  });
}

export function useDeleteOrganizationDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organization_domains").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ORGANIZATION_DOMAINS_KEY }),
  });
}

/**
 * Désigne le domaine canonique de l'organisation.
 *
 * ⚠️ DEUX écritures, et leur ORDRE est la garde. Un index unique partiel
 * n'autorise qu'une ligne `is_primary` par organisation : poser le nouveau
 * drapeau avant de retirer l'ancien violerait la contrainte. On retire donc
 * d'abord, on pose ensuite.
 *
 * Conséquence assumée : si la seconde écriture échoue, l'organisation se
 * retrouve sans domaine canonique. C'est l'état dégradé le plus BÉNIN
 * disponible — tous les domaines continuent d'être servis à l'identique, seul
 * le choix du lien à écrire est perdu, et un clic le rétablit. L'ordre inverse
 * aurait échoué franchement, sans rien changer, à chaque fois.
 *
 * Le jour où cela ne suffira plus (deux administrateurs simultanés), la
 * réponse est une fonction en base, pas une troisième requête ici.
 */
export function useSetPrimaryOrganizationDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, organizationId }: { id: string; organizationId: string }) => {
      const { error: unsetError } = await supabase
        .from("organization_domains")
        .update({ is_primary: false })
        .eq("organization_id", organizationId)
        .neq("id", id);
      if (unsetError) throw unsetError;

      const { error } = await supabase
        .from("organization_domains")
        .update({ is_primary: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ORGANIZATION_DOMAINS_KEY }),
  });
}
