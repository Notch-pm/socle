import type { Tables } from "@/types/database.types";

export type Organization = Tables<"organizations">;

export type OrgStatus = "active" | "obsolete";

/** Maximum hierarchy depth: a root organization plus 9 sub-levels. */
export const MAX_ORG_DEPTH = 10;

/** An organization enriched with its children and its 1-based depth in the visible forest. */
export interface OrgNode extends Organization {
  children: OrgNode[];
  depth: number;
}

/**
 * Build a forest from the flat list returned by RLS. An organization whose
 * parent is not part of the visible set (e.g. an admin who can see their own
 * subtree but not its ancestors) becomes a root of the displayed forest.
 */
export function buildOrgTree(orgs: Organization[]): OrgNode[] {
  const byId = new Map<string, OrgNode>();
  for (const org of orgs) byId.set(org.id, { ...org, children: [], depth: 1 });

  const roots: OrgNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const assignDepth = (node: OrgNode, depth: number) => {
    node.depth = depth;
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of node.children) assignDepth(child, depth + 1);
  };
  roots.sort((a, b) => a.name.localeCompare(b.name));
  for (const root of roots) assignDepth(root, 1);

  return roots;
}

/**
 * Organisations principales (racines strictes : `parent_id` null) triées par nom.
 * Contrairement à `buildOrgTree`, un orphelin dont le parent est hors périmètre
 * n'est PAS promu racine — seules les vraies racines (les « clients ») sont gardées.
 */
export function sortedRootOrganizations<T extends Pick<Organization, "name" | "parent_id">>(
  orgs: T[],
): T[] {
  return orgs
    .filter((o) => o.parent_id === null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Sommets de la forêt VISIBLE : les organisations dont le parent est `null`
 * **ou hors périmètre RLS**. C'est l'« organisation principale » du point de vue
 * de l'utilisateur courant — celle dont l'en-tête porte l'identité.
 *
 * ⚠️ Ne pas confondre avec `sortedRootOrganizations`, qui ne garde que les
 * racines STRICTES : un membre d'une sous-organisation ne voit pas sa racine
 * (le RLS `has_org_access` exige l'appartenance directe), et un en-tête qui
 * n'afficherait alors rien laisserait l'utilisateur sans repère. On montre le
 * plus haut ancêtre qu'il puisse voir, même exigence que `findRootAncestor`.
 */
export function visibleRootOrganizations<
  T extends Pick<Organization, "id" | "name" | "parent_id">,
>(orgs: T[]): T[] {
  const visible = new Set(orgs.map((o) => o.id));
  return orgs
    .filter((o) => o.parent_id === null || !visible.has(o.parent_id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** All ids strictly below `node` — used to forbid re-parenting an org under its own descendant. */
export function collectDescendantIds(node: OrgNode): string[] {
  const ids: string[] = [];
  const walk = (n: OrgNode) => {
    for (const child of n.children) {
      ids.push(child.id);
      walk(child);
    }
  };
  walk(node);
  return ids;
}

/**
 * Ids strictement sous `orgId`, calculés à partir de la liste plate (sans construire
 * l'arbre). Utile pour exclure une org et sa descendance d'un sélecteur de parent.
 */
export function collectDescendantIdsFlat(orgs: Organization[], orgId: string): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const o of orgs) {
    if (!o.parent_id) continue;
    const siblings = childrenByParent.get(o.parent_id) ?? [];
    siblings.push(o.id);
    childrenByParent.set(o.parent_id, siblings);
  }

  const ids: string[] = [];
  const stack = [...(childrenByParent.get(orgId) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    stack.push(...(childrenByParent.get(id) ?? []));
  }
  return ids;
}

/**
 * Ancêtre racine de `orgId` : on remonte `parent_id` jusqu'au sommet **visible**
 * (une org dont le parent est `null` ou hors périmètre RLS). Côté admin, c'est
 * l'« organisation principale » qui détient le catalogue de démarches. Renvoie
 * l'org elle-même si elle est déjà racine, ou `undefined` si `orgId` est absent.
 */
export function findRootAncestor(
  orgs: Organization[],
  orgId: string,
): Organization | undefined {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  let current = byId.get(orgId);
  if (!current) return undefined;

  const seen = new Set<string>();
  while (current.parent_id && byId.has(current.parent_id) && !seen.has(current.parent_id)) {
    seen.add(current.id);
    current = byId.get(current.parent_id)!;
  }
  return current;
}
