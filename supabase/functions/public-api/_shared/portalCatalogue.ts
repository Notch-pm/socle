/**
 * Le catalogue PUBLIÉ d'une collectivité sur son portail — logique pure,
 * testée. C'est ce que `GET /v1/portal/procedures` sert, et ce sur quoi
 * `GET /v1/portal/page` résout ses références (`pinned`, `shortcuts`) : les
 * deux routes lisent la même liste, elles ne peuvent pas diverger.
 *
 * Une démarche est publiée sur le portail d'un tenant quand :
 *   1. son paramétrage la publie (`isPubliclyPublished` : `production`,
 *      `externe`, visible sur le portail, dans sa période) ;
 *   2. elle est **activée** (`organization_procedures.is_enabled`) pour au
 *      moins un organisme **actif** de l'arbre du tenant — lui-même compris.
 *
 * La seconde règle est ce qui fait qu'une démarche proposée par une seule
 * mairie de l'agglomération apparaît sur le portail de l'agglomération, même
 * si l'agglomération ne la propose pas en propre. Elle porte alors la liste
 * des organismes qui la proposent, dans l'**ordre de l'arbre** (le tenant,
 * puis chaque niveau, frères par nom) : c'est ce que la carte affiche et ce
 * sur quoi l'usager filtre. Une démarche que personne n'active n'est pas
 * servie — le catalogue de la racine est un référentiel, pas une offre.
 */
import { isPubliclyPublished } from "./publication.ts";

type Row = Record<string, unknown>;

/** Un organisme qui propose la démarche, tel que le portail l'affiche. */
export interface PortalOrganizationRef {
  id: string;
  name: string;
}

/** Une organisation de l'arbre du tenant, telle que lue en base. */
export interface TreeOrganization {
  id: string;
  name: string;
  parent_id: string | null;
  status: string;
}

/** Une ligne d'`organization_procedures`. */
export interface ProcedureBinding {
  procedure_id: string;
  organization_id: string;
  is_enabled: boolean;
}

/** Une démarche publiée, avec les organismes qui la proposent. */
export interface PublishedProcedure {
  row: Row;
  organizations: PortalOrganizationRef[];
}

const collator = new Intl.Collator("fr", { sensitivity: "base" });

/**
 * Les organisations dans l'ordre de l'arbre : les sommets d'abord (le tenant
 * — ou toute organisation dont le parent n'est pas dans la liste), puis en
 * profondeur, les frères classés par nom. Un ordre stable et lisible pour une
 * liste d'organismes sur une carte : la collectivité, puis ses communes.
 */
export function orderTreeOrganizations<T extends TreeOrganization>(organizations: T[]): T[] {
  const ids = new Set(organizations.map((org) => org.id));
  const childrenOf = new Map<string | null, T[]>();
  for (const org of organizations) {
    const key = org.parent_id !== null && ids.has(org.parent_id) ? org.parent_id : null;
    const siblings = childrenOf.get(key) ?? [];
    siblings.push(org);
    childrenOf.set(key, siblings);
  }
  const ordered: T[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null) => {
    const children = [...(childrenOf.get(parent) ?? [])].sort((a, b) => collator.compare(a.name, b.name));
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      ordered.push(child);
      walk(child.id);
    }
  };
  walk(null);
  return ordered;
}

/**
 * Qui propose quoi : pour chaque démarche, les organismes actifs de l'arbre
 * qui l'ont activée, dans l'ordre de l'arbre. Une liaison désactivée, ou
 * portée par une organisation obsolète ou hors de l'arbre, ne compte pas.
 */
export function offersByProcedure(
  bindings: ProcedureBinding[],
  organizations: TreeOrganization[],
): Map<string, PortalOrganizationRef[]> {
  const ordered = orderTreeOrganizations(organizations.filter((org) => org.status === "active"));
  const enabledBy = new Map<string, Set<string>>();
  for (const binding of bindings) {
    if (binding.is_enabled !== true) continue;
    const set = enabledBy.get(binding.organization_id) ?? new Set<string>();
    set.add(binding.procedure_id);
    enabledBy.set(binding.organization_id, set);
  }
  const offers = new Map<string, PortalOrganizationRef[]>();
  for (const org of ordered) {
    const procedureIds = enabledBy.get(org.id);
    if (!procedureIds) continue;
    for (const procedureId of procedureIds) {
      const list = offers.get(procedureId) ?? [];
      list.push({ id: org.id, name: org.name });
      offers.set(procedureId, list);
    }
  }
  return offers;
}

function orderIndex(row: Row): number {
  return typeof row.order_index === "number" ? row.order_index : Number.POSITIVE_INFINITY;
}

/**
 * Le catalogue publié : les démarches du référentiel qui passent les règles de
 * publication ET qu'au moins un organisme de l'arbre propose, dans l'ordre
 * d'affichage défini par la collectivité (`order_index`, puis le nom).
 */
export function publishedCatalogue(input: {
  procedures: Row[];
  bindings: ProcedureBinding[];
  organizations: TreeOrganization[];
  /** Jour civil « AAAA-MM-JJ » de référence (heure de Paris). */
  today: string;
}): PublishedProcedure[] {
  const offers = offersByProcedure(input.bindings, input.organizations);
  return input.procedures
    .filter((row) => isPubliclyPublished(row, input.today))
    .map((row) => ({ row, organizations: offers.get(String(row.id)) ?? [] }))
    .filter((entry) => entry.organizations.length > 0)
    .sort(
      (a, b) =>
        orderIndex(a.row) - orderIndex(b.row) ||
        collator.compare(String(a.row.name ?? ""), String(b.row.name ?? "")),
    );
}
