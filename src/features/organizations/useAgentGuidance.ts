import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database.types";
import {
  cleanAgentGuidance,
  parseAgentGuidance,
  type AgentGuidance,
} from "@/features/organizations/agentGuidance";

const AGENT_GUIDANCE_KEY = "organization-agent-guidance";

export interface StoredAgentGuidance {
  guidance: AgentGuidance;
  /** Dernier enregistrement ; `null` tant que rien n'a été écrit. */
  updatedAt: string | null;
}

/**
 * Recommandations aux agents d'une **organisation principale**. Aucune ligne =
 * rien d'écrit : des recommandations vierges, pas une erreur.
 */
export function useAgentGuidance(organizationId: string | undefined) {
  return useQuery({
    queryKey: [AGENT_GUIDANCE_KEY, organizationId] as const,
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<StoredAgentGuidance> => {
      const { data, error } = await supabase
        .from("organization_agent_guidance")
        .select("guidance, updated_at")
        .eq("organization_id", organizationId!)
        .maybeSingle();
      if (error) throw error;
      return {
        guidance: parseAgentGuidance(data?.guidance),
        updatedAt: data?.updated_at ?? null,
      };
    },
  });
}

/**
 * Enregistre les recommandations (upsert sur la clé `organization_id`). RLS :
 * `is_org_admin` ; le trigger `enforce_agent_guidance_root_org` refuse une
 * sous-organisation.
 */
export function useSaveAgentGuidance(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (guidance: AgentGuidance) => {
      const { error } = await supabase
        .from("organization_agent_guidance")
        .upsert(
          { organization_id: organizationId, guidance: cleanAgentGuidance(guidance) as unknown as Json },
          { onConflict: "organization_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AGENT_GUIDANCE_KEY, organizationId] });
    },
  });
}
