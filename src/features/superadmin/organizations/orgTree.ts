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
