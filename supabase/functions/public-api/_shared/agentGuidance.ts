/**
 * Recommandations aux agents — ce que `GET /v1/organizations/{id}/agent-guidance`
 * sert. Logique pure, testée.
 *
 * ⚠️ **Miroir volontaire** de `src/features/organizations/agentGuidance.ts`
 * (motif `portalContent.ts`) : une edge function ne peut rien importer de
 * `src/`. Les deux lisent le même JSON avec la même tolérance — mêmes clés,
 * entrées de liste entièrement vides écartées, jamais un texte tronqué — et les
 * tests des deux côtés l'épinglent.
 *
 * ⚠️ **Whitelist** : seules les cinq rubriques du contrat sortent du JSON
 * stocké, sous leurs noms exacts. Un consommateur qui re-parse la réponse avec
 * les mêmes règles retrouve la même chose (idempotence).
 */
import type { AgentGuidanceBody, AgentGuidanceDto } from "./dto.ts";

type Row = Record<string, unknown>;

function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function objects(raw: unknown): Row[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

/** Miroir de `parseAgentGuidance` (et, pour la FAQ et les liens, de `parseFaq` / `parseLinks`). */
export function parseAgentGuidance(raw: unknown): AgentGuidanceBody {
  const stored: Row = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Row) : {};
  return {
    roleDescription: coerceString(stored.roleDescription),
    physicalReception: coerceString(stored.physicalReception),
    guidelines: objects(stored.guidelines)
      .map((item) => ({ title: coerceString(item.title), text: coerceString(item.text) }))
      .filter((item) => item.title.trim() !== "" || item.text.trim() !== ""),
    faq: objects(stored.faq)
      .map((item) => ({ question: coerceString(item.question), answer: coerceString(item.answer) }))
      .filter((item) => item.question.trim() !== "" || item.answer.trim() !== ""),
    recommendedSources: objects(stored.recommendedSources)
      .map((item) => ({ url: coerceString(item.url).trim(), description: coerceString(item.description) }))
      .filter((item) => item.url !== "" || item.description.trim() !== ""),
  };
}

/** Rien d'écrit ? Des blancs ne sont pas un texte. */
export function isAgentGuidanceEmpty(guidance: AgentGuidanceBody): boolean {
  return (
    guidance.roleDescription.trim() === "" &&
    guidance.physicalReception.trim() === "" &&
    guidance.guidelines.length === 0 &&
    guidance.faq.length === 0 &&
    guidance.recommendedSources.length === 0
  );
}

/**
 * Ligne de `resolve_agent_guidance` (ou son absence) → DTO. Toujours un 200 :
 * une collectivité qui n'a rien écrit rend `configured: false` et des rubriques
 * vides, que le consommateur n'affiche pas.
 */
export function serializeAgentGuidance(organizationId: string, row: Row | null): AgentGuidanceDto {
  const guidance = parseAgentGuidance(row?.guidance);
  const configured = !isAgentGuidanceEmpty(guidance);
  const sourceId = typeof row?.source_organization_id === "string" ? row.source_organization_id : null;
  const updatedAt = typeof row?.updated_at === "string" ? row.updated_at : null;
  return {
    organization_id: organizationId,
    // Une ligne vide n'est pas une source : c'est l'absence de recommandations.
    source_organization_id: configured ? sourceId : null,
    configured,
    updated_at: configured ? updatedAt : null,
    guidance,
  };
}
