import type { Tables } from "@/types/database.types";
import { bearerByOrganization } from "@/features/superadmin/organizations/orgTree";

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

/** Ce qu'il faut d'une organisation pour savoir au nom de qui elle instruit. */
export interface BearerGroupOrganization {
  id: string;
  name: string;
  parent_id: string | null;
  is_internal_service: boolean;
}

/**
 * Les **autres** organisations qui instruisent au nom du même porteur : le
 * porteur lui-même et ses services internes, celle qu'on édite exceptée.
 *
 * C'est le groupe dans lequel une démarche ne peut être activée qu'une fois —
 * sinon, une demande déposée au nom du porteur n'aurait pas de destinataire
 * déterminé. La règle vaut dans les deux sens : un service interne ne peut pas
 * doubler son porteur, ni l'inverse.
 */
export function bearerGroupSiblings<T extends BearerGroupOrganization>(
  organizations: T[],
  organizationId: string,
): T[] {
  const bearers = bearerByOrganization(organizations);
  const own = bearers.get(organizationId);
  if (!own) return [];
  return organizations.filter(
    (org) => org.id !== organizationId && bearers.get(org.id)?.id === own.id,
  );
}

/**
 * Pour chaque démarche déjà portée dans le groupe, le nom de l'organisation
 * qui la porte — de quoi désactiver l'interrupteur et DIRE où elle est.
 *
 * ⚠️ Confort, pas garantie : un administrateur qui n'a pas le droit de lire le
 * service frère n'en recevra aucune liaison, et c'est le trigger
 * `enforce_single_offer_per_bearer` qui refusera l'écriture, avec son propre
 * message. La base reste la seule barrière (motif `document_types`).
 */
export function offersHeldBySiblings(
  bindings: Pick<OrganizationProcedure, "organization_id" | "procedure_id" | "is_enabled">[],
  siblings: BearerGroupOrganization[],
): Map<string, string> {
  const nameById = new Map(siblings.map((org) => [org.id, org.name]));
  const held = new Map<string, string>();
  for (const binding of bindings) {
    if (binding.is_enabled !== true || !binding.organization_id || !binding.procedure_id) continue;
    const name = nameById.get(binding.organization_id);
    if (!name || held.has(binding.procedure_id)) continue;
    held.set(binding.procedure_id, name);
  }
  return held;
}
