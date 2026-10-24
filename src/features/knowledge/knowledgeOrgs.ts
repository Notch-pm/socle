import { buildOrgTree, type Organization, type OrgNode } from "@/features/superadmin/organizations/orgTree";

export interface KnowledgeOrgEntry {
  organization: Organization;
  /** Profondeur dans la forêt visible, 1 pour un sommet : sert au retrait. */
  depth: number;
}

/**
 * Organismes de la forêt visible, **dans l'ordre de l'arbre** (chaque sommet
 * suivi de ses descendants, frères triés par nom) : la liste des pages
 * Connaissances se lit comme l'écran Organisations, retrait compris.
 */
export function knowledgeOrgEntries(orgs: Organization[]): KnowledgeOrgEntry[] {
  const out: KnowledgeOrgEntry[] = [];
  const walk = (node: OrgNode) => {
    const { children, depth, ...organization } = node;
    out.push({ organization, depth });
    children.forEach(walk);
  };
  buildOrgTree(orgs).forEach(walk);
  return out;
}

/**
 * Organisme affiché : celui que demande l'URL (`?org=`) s'il est dans la liste,
 * sinon le premier. Un identifiant périmé ou hors périmètre ne mène donc jamais
 * à un panneau vide.
 */
export function selectedKnowledgeOrg(
  entries: KnowledgeOrgEntry[],
  requestedId: string | null,
): Organization | null {
  const requested = requestedId ? entries.find((e) => e.organization.id === requestedId) : undefined;
  return (requested ?? entries[0])?.organization ?? null;
}
