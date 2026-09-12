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
 *
 * Un organisme de cette liste n'est pas forcément celui qui a activé la
 * démarche : un **service interne** ne s'affiche jamais au portail, c'est son
 * porteur qui est nommé à sa place (`bearerByOrganization`). L'usager
 * s'adresse à sa mairie ; le service, lui, instruit.
 */
import { isPubliclyPublished } from "./publication.ts";

type Row = Record<string, unknown>;

/** Un organisme qui propose la démarche, tel que le portail l'affiche. */
export interface PortalOrganizationRef {
  id: string;
  name: string;
  /** Le logo propre du porteur, ou `null` — voir `TreeOrganization.logo_url`. */
  logoUrl: string | null;
  /**
   * L'identifiant lisible de l'organisme — ce qui lui donne une ADRESSE sur le
   * portail usagers (`/<slug>` ouvre sa page : ses démarches, ses couleurs, son
   * logo).
   *
   * ⚠️ C'est le slug du PORTEUR, jamais celui du service interne qui instruit :
   * comme le nom, il désigne l'organisme que la collectivité a choisi de
   * montrer. `null` quand personne ne lui en a donné — l'organisme reste alors
   * nommé sur les cartes, mais n'a pas de page.
   */
  slug: string | null;
  /**
   * Le **service interne** qui instruit réellement, quand ce n'est pas
   * l'organisme affiché — `null` sinon. Le portail ne le montre pas : la
   * collectivité a choisi de ne pas le montrer. Il voyage pour que l'aval
   * sache où router la demande, sans refaire la résolution.
   */
  handlingOrganizationId: string | null;
}

/** Une organisation de l'arbre du tenant, telle que lue en base. */
export interface TreeOrganization {
  id: string;
  name: string;
  /** Identifiant lisible, qui sert d'adresse au portail. `null` s'il manque. */
  slug: string | null;
  /**
   * Le logo PROPRE de l'organisation, tel qu'il est en colonne — jamais résolu
   * par héritage.
   *
   * ⚠️ C'est une différence assumée avec `GET /v1/organizations/{id}/branding`,
   * et elle vient de l'usage : dans une liste de communes, servir le logo
   * hérité donnerait à chaque ligne la même image, celle de
   * l'intercommunalité. Mieux vaut pas de logo qu'un logo qui ne distingue
   * rien.
   */
  logo_url: string | null;
  parent_id: string | null;
  status: string;
  is_internal_service: boolean;
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
 * L'organisme qui REPRÉSENTE chaque organisation au portail — son « porteur ».
 * Une organisation ordinaire est son propre porteur ; un **service interne**
 * (`is_internal_service`) s'efface derrière le premier ancêtre qui n'en est
 * pas un. Un usager s'adresse à sa mairie, pas à son service d'état civil.
 *
 * ⚠️ **La remontée ne sort jamais de la liste fournie** : une organisation dont
 * le parent n'y figure pas est son propre porteur, fût-elle marquée interne.
 * C'est ce qui protège le tenant — l'arbre servi descend de lui
 * (`org_subtree_ids`), son parent n'y est pas, et son nom est bien celui que
 * le portail doit porter.
 *
 * La remontée se termine toujours quand l'arbre part d'une racine : une racine
 * n'est jamais un service interne (trigger `enforce_internal_service_not_root`).
 *
 * ⚠️ Miroir volontaire de `bearerByOrganization` dans
 * `src/features/superadmin/organizations/orgTree.ts` — testé des deux côtés.
 */
export function bearerByOrganization<T extends TreeOrganization>(organizations: T[]): Map<string, T> {
  const byId = new Map(organizations.map((org) => [org.id, org]));
  const bearers = new Map<string, T>();
  for (const org of organizations) {
    let current = org;
    const seen = new Set<string>([org.id]);
    while (current.is_internal_service) {
      const parent = current.parent_id ? byId.get(current.parent_id) : undefined;
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
    }
    bearers.set(org.id, current);
  }
  return bearers;
}

/**
 * Qui propose quoi : pour chaque démarche, les organismes **affichés**, dans
 * l'ordre de l'arbre. Une liaison désactivée, ou portée par une organisation
 * hors de l'arbre, ne compte pas.
 *
 * L'organisation qui active n'est pas forcément celle qu'on nomme : un service
 * interne s'efface derrière son porteur, et c'est le porteur qui entre dans la
 * liste. Le service reste porté par `handlingOrganizationId`, pour l'aval.
 *
 * ⚠️ **Une organisation obsolète n'apparaît ni comme instructeur, ni comme
 * porteur** — mais elle reste dans la liste dont on part, parce qu'elle est un
 * maillon de la chaîne des parents. La retirer avant de résoudre ferait d'un
 * service interne son propre porteur, et le remettrait au portail sous son
 * propre nom.
 *
 * ⚠️ **Dédoublonnage** : deux organisations d'un même porteur ne le nomment
 * qu'une fois. Le paramétrage l'interdit déjà (une démarche, un instructeur
 * par porteur), mais un doublon rendrait deux cartes identiques.
 */
export function offersByProcedure(
  bindings: ProcedureBinding[],
  organizations: TreeOrganization[],
): Map<string, PortalOrganizationRef[]> {
  const bearers = bearerByOrganization(organizations);
  const active = new Set(
    organizations.filter((org) => org.status === "active").map((org) => org.id),
  );
  const ordered = orderTreeOrganizations(organizations);
  const enabledBy = new Map<string, Set<string>>();
  for (const binding of bindings) {
    if (binding.is_enabled !== true) continue;
    const set = enabledBy.get(binding.organization_id) ?? new Set<string>();
    set.add(binding.procedure_id);
    enabledBy.set(binding.organization_id, set);
  }
  const offers = new Map<string, PortalOrganizationRef[]>();
  for (const org of ordered) {
    if (!active.has(org.id)) continue;
    const bearer = bearers.get(org.id);
    if (!bearer || !active.has(bearer.id)) continue;
    const procedureIds = enabledBy.get(org.id);
    if (!procedureIds) continue;
    for (const procedureId of procedureIds) {
      const list = offers.get(procedureId) ?? [];
      if (list.some((entry) => entry.id === bearer.id)) continue;
      list.push({
        id: bearer.id,
        name: bearer.name,
        slug: bearer.slug,
        logoUrl: bearer.logo_url,
        handlingOrganizationId: bearer.id === org.id ? null : org.id,
      });
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
