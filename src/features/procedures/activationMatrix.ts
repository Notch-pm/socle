import { bearerByOrganization, buildOrgTree, type Organization, type OrgNode } from "@/features/superadmin/organizations/orgTree";

/**
 * Tableau « Activation par organisme » (2026-10-25) : les démarches d'une
 * racine en lignes, les organismes de son arbre en colonnes, une case par
 * activation (`organization_procedures.is_enabled`). Logique pure, testée.
 *
 * ⚠️ **UN SEUL INSTRUCTEUR PAR PORTEUR** : un organisme et ses services
 * internes forment un groupe où une démarche ne s'active qu'une fois (trigger
 * `enforce_single_offer_per_bearer`, voir feature « Services internes »). Les
 * lots « Tous » écartent d'avance ce que le groupe tient déjà — un seul refus
 * ferait échouer tout l'upsert.
 */

/** Une colonne : un organisme de l'arbre de la racine, dans l'ordre de l'arbre. */
export interface ActivationColumn {
  organization: Organization;
  /** 1 pour la racine : sert au retrait. */
  depth: number;
}

/** Activations : pour chaque organisme, les démarches qu'il propose. */
export type EnabledMatrix = Map<string, Set<string>>;

export interface ActivationChange {
  organizationId: string;
  procedureId: string;
  enabled: boolean;
}

export const cellKey = (organizationId: string, procedureId: string) => `${organizationId}:${procedureId}`;

/** Les organismes de l'arbre de `rootId` — la racine, puis ses descendants, frères triés par nom. */
export function activationColumns(orgs: Organization[], rootId: string): ActivationColumn[] {
  const out: ActivationColumn[] = [];
  const walk = (node: OrgNode) => {
    const { children, depth, ...organization } = node;
    out.push({ organization, depth });
    children.forEach(walk);
  };
  const find = (nodes: OrgNode[]): OrgNode | undefined => {
    for (const node of nodes) {
      if (node.id === rootId) return node;
      const found = find(node.children);
      if (found) return found;
    }
    return undefined;
  };
  const root = find(buildOrgTree(orgs));
  if (root) walk(root);
  return out;
}

/** Les liaisons actives, rangées par organisme. */
export function buildEnabledMatrix(
  bindings: { organization_id: string | null; procedure_id: string | null; is_enabled: boolean | null }[],
): EnabledMatrix {
  const matrix: EnabledMatrix = new Map();
  for (const b of bindings) {
    if (b.is_enabled !== true || !b.organization_id || !b.procedure_id) continue;
    let set = matrix.get(b.organization_id);
    if (!set) matrix.set(b.organization_id, (set = new Set()));
    set.add(b.procedure_id);
  }
  return matrix;
}

/** La matrice telle que l'écran la montre : écritures en cours appliquées par-dessus. */
export function withPendingChanges(matrix: EnabledMatrix, pending: Map<string, ActivationChange>): EnabledMatrix {
  if (pending.size === 0) return matrix;
  const out: EnabledMatrix = new Map([...matrix].map(([org, set]) => [org, new Set(set)]));
  for (const change of pending.values()) {
    let set = out.get(change.organizationId);
    if (!set) out.set(change.organizationId, (set = new Set()));
    if (change.enabled) set.add(change.procedureId);
    else set.delete(change.procedureId);
  }
  return out;
}

export const isEnabled = (matrix: EnabledMatrix, organizationId: string, procedureId: string) =>
  matrix.get(organizationId)?.has(procedureId) ?? false;

/**
 * Lecture du groupe de chaque organisme (son porteur et les services internes
 * de celui-ci) : de quoi dire qui, dans le groupe, tient déjà une démarche.
 */
export function bearerGroups(columns: ActivationColumn[]) {
  const orgs = columns.map((c) => c.organization);
  const bearers = bearerByOrganization(orgs);
  const groupOf = (id: string) => bearers.get(id)?.id ?? id;
  return {
    /** L'AUTRE organisme du groupe qui propose déjà la démarche, s'il y en a un. */
    heldBy(matrix: EnabledMatrix, organizationId: string, procedureId: string): Organization | undefined {
      const group = groupOf(organizationId);
      return orgs.find(
        (o) => o.id !== organizationId && groupOf(o.id) === group && isEnabled(matrix, o.id, procedureId),
      );
    },
    groupOf,
  };
}

type Groups = ReturnType<typeof bearerGroups>;

/**
 * « Tous » sur une colonne : les démarches que cet organisme ne propose pas
 * encore et que personne de son groupe ne tient.
 */
export function enableColumn(
  organizationId: string,
  procedureIds: string[],
  matrix: EnabledMatrix,
  groups: Groups,
): ActivationChange[] {
  return procedureIds
    .filter((p) => !isEnabled(matrix, organizationId, p) && !groups.heldBy(matrix, organizationId, p))
    .map((procedureId) => ({ organizationId, procedureId, enabled: true }));
}

/** « Aucun » sur une colonne : tout ce que l'organisme propose. */
export function disableColumn(organizationId: string, procedureIds: string[], matrix: EnabledMatrix): ActivationChange[] {
  return procedureIds
    .filter((p) => isEnabled(matrix, organizationId, p))
    .map((procedureId) => ({ organizationId, procedureId, enabled: false }));
}

/**
 * « Tous » sur une ligne : la démarche chez chaque **porteur** dont le groupe
 * ne la propose pas encore.
 *
 * ⚠️ **Jamais chez un service interne** : dans un groupe, il faut choisir qui
 * instruit, et un lot ne sait pas choisir. Il coche le porteur — l'organisme
 * que l'usager voit —, et l'on déplace la case à la main vers le service qui
 * instruit vraiment. Un organisme obsolète n'est pas coché non plus.
 */
export function enableRow(
  procedureId: string,
  columns: ActivationColumn[],
  matrix: EnabledMatrix,
  groups: Groups,
): ActivationChange[] {
  return columns
    .map((c) => c.organization)
    .filter(
      (o) =>
        !o.is_internal_service &&
        o.status !== "obsolete" &&
        !isEnabled(matrix, o.id, procedureId) &&
        !groups.heldBy(matrix, o.id, procedureId),
    )
    .map((o) => ({ organizationId: o.id, procedureId, enabled: true }));
}

/** « Aucun » sur une ligne : la démarche, partout où elle est proposée. */
export function disableRow(procedureId: string, columns: ActivationColumn[], matrix: EnabledMatrix): ActivationChange[] {
  return columns
    .filter((c) => isEnabled(matrix, c.organization.id, procedureId))
    .map((c) => ({ organizationId: c.organization.id, procedureId, enabled: false }));
}
