import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database.types";

const APPLICATIONS_KEY = ["applications"] as const;
const ORG_APPLICATIONS_KEY = ["organization-applications"] as const;

export type Application = Tables<"applications">;
export type OrganizationApplication = Tables<"organization_applications">;

/** Le registre des applications de la gamme (`applications`), trié par nom. */
export function useApplications() {
  return useQuery({
    queryKey: APPLICATIONS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("applications").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

/** Applications souscrites par une organisation principale. */
export function useOrganizationApplications(organizationId: string | undefined) {
  return useQuery({
    queryKey: [...ORG_APPLICATIONS_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_applications")
        .select("*")
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Souscrire ou résilier une application pour une collectivité. C'est LE geste
 * d'onboarding côté clés : aucune clé n'est créée, aucun secret ne circule —
 * la clé de l'application, posée une fois dans son projet, voit désormais
 * cette collectivité (ou ne la voit plus). Réservé au super administrateur
 * (RLS INSERT/DELETE).
 */
export function useSetOrganizationApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organizationId: string;
      applicationId: string;
      enabled: boolean;
      createdBy: string | null | undefined;
    }) => {
      if (input.enabled) {
        const { error } = await supabase.from("organization_applications").insert({
          organization_id: input.organizationId,
          application_id: input.applicationId,
          created_by: input.createdBy ?? null,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("organization_applications")
          .delete()
          .eq("organization_id", input.organizationId)
          .eq("application_id", input.applicationId);
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [...ORG_APPLICATIONS_KEY, variables.organizationId],
      });
      void queryClient.invalidateQueries({ queryKey: ["root-onboarding-status"] });
    },
  });
}

/**
 * Rattache une clé plateforme d'avant le registre à son application. Une clé
 * plateforme sans application est refusée par les trois fonctions (403) :
 * c'est le geste qui la remet en service, une fois.
 */
export function useAssignApiKeyApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { keyId: string; applicationId: string }) => {
      const { error } = await supabase
        .from("api_keys")
        .update({ consumer: input.applicationId })
        .eq("id", input.keyId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });
}

/**
 * Ajoute une application au registre (scope `abonnement`). Le scope
 * `plateforme` ne se crée pas depuis l'écran : il est réservé au Socle.
 */
export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name: string }) => {
      const { error } = await supabase
        .from("applications")
        .insert({ id: input.id, name: input.name, scope: "abonnement" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY }),
  });
}
