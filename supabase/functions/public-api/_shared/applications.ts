/**
 * Applications souscrites par la collectivité dont relève une organisation
 * (champ `applications` de `Organization`, contrat 1.42.0). Logique pure et
 * testée — aucune dépendance Deno.
 *
 * L'abonnement est porté par la RACINE (`organization_applications`, trigger
 * « racine seulement ») : une sous-organisation hérite de celui de sa racine.
 * C'est ce qui permet à deux applications de la gamme de se reconnaître sans
 * configuration croisée : Clara voit qu'une collectivité a aussi souscrit
 * Iris, et inversement.
 */

/** Racine d'une organisation : on remonte les parents connus jusqu'au sommet. */
export function rootIdOf(id: string, parentById: Map<string, string | null>): string {
  let current = id;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(current)) return current; // cycle : ne devrait pas exister, on s'arrête
    seen.add(current);
    const parent = parentById.get(current);
    if (!parent || !parentById.has(parent)) return current;
    current = parent;
  }
}

/**
 * Pour chaque organisation demandée, la liste triée des applications souscrites
 * par sa racine (vide si aucune).
 */
export function applicationsByOrganization(
  organizationIds: string[],
  parentById: Map<string, string | null>,
  subscriptions: Array<{ organization_id: unknown; application_id: unknown }>,
): Map<string, string[]> {
  const byRoot = new Map<string, Set<string>>();
  for (const row of subscriptions) {
    if (typeof row.organization_id !== "string" || typeof row.application_id !== "string") continue;
    const set = byRoot.get(row.organization_id) ?? new Set<string>();
    set.add(row.application_id);
    byRoot.set(row.organization_id, set);
  }
  const out = new Map<string, string[]>();
  for (const id of organizationIds) {
    const apps = byRoot.get(rootIdOf(id, parentById));
    out.set(id, apps ? [...apps].sort() : []);
  }
  return out;
}
