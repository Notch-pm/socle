/**
 * Portée (isolation multi-tenant) : helpers purs. L'ensemble des `organization_id`
 * autorisés (racine de la clé + descendance) est calculé côté base via la
 * fonction `org_subtree_ids` ; ici on ne garde que la validation d'UUID et la
 * construction de l'arbre imbriqué pour `?tree=true`. Miroir de
 * `src/features/superadmin/organizations/orgTree.ts` (buildOrgTree), sans `@/`.
 */
import type { OrganizationDto } from "./dto.ts";

export interface OrganizationTreeNode extends OrganizationDto {
  children: OrganizationTreeNode[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'identifiant a-t-il la forme d'un UUID ? (garde-fou avant requête/scope) */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Construit un arbre imbriqué à partir de la liste plate scopée. Une org dont le
 * parent n'est pas dans l'ensemble (typiquement la racine de la clé) devient une
 * racine de l'arbre affiché. Trié par nom à chaque niveau (rendu déterministe).
 */
export function buildOrganizationTree(orgs: OrganizationDto[]): OrganizationTreeNode[] {
  const byId = new Map<string, OrganizationTreeNode>();
  for (const org of orgs) byId.set(org.id, { ...org, children: [] });

  const roots: OrganizationTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRec = (nodes: OrganizationTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
