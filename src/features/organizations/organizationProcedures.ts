import type { Tables } from "@/types/database.types";

/** Liaison démarche ↔ organisation (activation par organisation). */
export type OrganizationProcedure = Tables<"organization_procedures">;

/**
 * Ids des démarches **activées** pour une organisation. Une démarche est active
 * lorsqu'une liaison existe avec `is_enabled === true` ; l'absence de liaison
 * (ou `is_enabled` faux/nul) vaut « non activée » (activation en opt-in).
 */
export function buildEnabledProcedureIds(bindings: OrganizationProcedure[]): Set<string> {
  const enabled = new Set<string>();
  for (const binding of bindings) {
    if (binding.is_enabled && binding.procedure_id) enabled.add(binding.procedure_id);
  }
  return enabled;
}
