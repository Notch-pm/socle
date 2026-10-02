import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database.types";

const CATALOGUE_KEY = ["integrations-catalogue"] as const;
const ORG_INTEGRATIONS_KEY = ["organization-integrations"] as const;

export type IntegrationType = Tables<"integration_types">;

/** Une intégration du catalogue, avec son type et ses applications. */
export type CatalogueIntegration = Tables<"integrations"> & {
  integration_types: Pick<IntegrationType, "id" | "name" | "position"> | null;
  integration_applications: { application_id: string; applications: { name: string } | null }[];
};

/** La configuration d'une collectivité — sans aucun secret (table à part). */
export type OrganizationIntegration = Tables<"organization_integrations">;

/** Types d'intégration, dans l'ordre d'affichage. */
export function useIntegrationTypes() {
  return useQuery({
    queryKey: ["integration-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("integration_types").select("*").order("position");
      if (error) throw error;
      return data;
    },
  });
}

/** Le catalogue (ce que propose Edilumen) — aucune donnée de collectivité. */
export function useIntegrationsCatalogue() {
  return useQuery({
    queryKey: CATALOGUE_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations")
        .select(
          "*, integration_types(id, name, position), integration_applications(application_id, applications(name))",
        )
        .order("name");
      if (error) throw error;
      return data as unknown as CatalogueIntegration[];
    },
  });
}

/** Mise à jour d'une fiche du catalogue (présentation, disponibilité). Super admin. */
export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      description: string;
      logo_url: string | null;
      is_available: boolean;
    }) => {
      const { error } = await supabase
        .from("integrations")
        .update({
          description: input.description,
          logo_url: input.logo_url,
          is_available: input.is_available,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CATALOGUE_KEY }),
  });
}

/**
 * Les configurations d'une collectivité, et la PRÉSENCE de leurs secrets
 * (`organization_integration_secret_keys`) — jamais leur valeur : la table des
 * secrets est illisible depuis un navigateur, super administrateur compris.
 */
export function useOrganizationIntegrations(organizationId: string | undefined) {
  return useQuery({
    queryKey: [...ORG_INTEGRATIONS_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const [configs, secrets] = await Promise.all([
        supabase.from("organization_integrations").select("*").eq("organization_id", organizationId!),
        supabase.rpc("organization_integration_secret_keys", { p_organization_id: organizationId! }),
      ]);
      if (configs.error) throw configs.error;
      if (secrets.error) throw secrets.error;
      const secretKeys = new Map<string, string[]>(
        (secrets.data ?? []).map((row) => [row.organization_integration_id, row.secret_keys ?? []]),
      );
      return configs.data.map((config) => ({
        config,
        secretKeys: secretKeys.get(config.id) ?? [],
      }));
    },
  });
}

/**
 * Enregistre une configuration : les paramètres sur la ligne, les secrets par
 * la RPC (chaîne vide = conserver, `null` = effacer). Renvoie l'id de la
 * configuration, créée au premier enregistrement.
 */
export function useSaveOrganizationIntegration(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      integrationId: string;
      configId: string | null;
      settings: Record<string, string>;
      secrets: Record<string, string | null>;
    }): Promise<string> => {
      let configId = input.configId;
      if (configId) {
        const { error } = await supabase
          .from("organization_integrations")
          .update({ settings: input.settings })
          .eq("id", configId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("organization_integrations")
          .insert({
            organization_id: organizationId,
            integration_id: input.integrationId,
            settings: input.settings,
          })
          .select("id")
          .single();
        if (error) throw error;
        configId = data.id;
      }
      if (Object.keys(input.secrets).length > 0) {
        const { error } = await supabase.rpc("set_organization_integration_secrets", {
          p_organization_integration_id: configId,
          p_patch: input.secrets,
        });
        if (error) throw error;
      }
      return configId;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...ORG_INTEGRATIONS_KEY, organizationId] }),
  });
}

/** Active ou suspend une configuration. La base exige un test réussi pour activer. */
export function useSetOrganizationIntegrationActive(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { configId: string; active: boolean }) => {
      const { error } = await supabase
        .from("organization_integrations")
        .update({ is_active: input.active })
        .eq("id", input.configId);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...ORG_INTEGRATIONS_KEY, organizationId] }),
  });
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/** Test de connexion, côté serveur (`integration-test`) : seul lecteur des secrets. */
export function useTestOrganizationIntegration(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (configId: string): Promise<ConnectionTestResult> => {
      const { data, error } = await supabase.functions.invoke<ConnectionTestResult>(
        "integration-test",
        { body: { organization_integration_id: configId } },
      );
      if (error) {
        // Une réponse non-2xx arrive en `FunctionsHttpError` : le message de
        // la fonction est dans le corps, pas dans `error.message`.
        let message = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.error && typeof body.error.message === "string") message = body.error.message;
        } catch {
          // corps illisible : on garde le message générique
        }
        throw new Error(message);
      }
      if (!data || typeof data.ok !== "boolean") throw new Error("Réponse invalide du serveur");
      return data;
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [...ORG_INTEGRATIONS_KEY, organizationId] }),
  });
}
