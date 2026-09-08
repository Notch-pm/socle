/**
 * Le catalogue de démarches vu par l'éditeur du portail : ce qu'on peut
 * épingler, et ce que l'usager verra vraiment.
 *
 * Épingler ne publie pas. Une démarche `brouillon`, `interne`, retirée du
 * portail, hors de sa période de publication ou qu'aucun organisme n'active
 * peut être choisie dans l'éditeur — et le portail ne l'affichera pas. Ce
 * module met un mot sur chaque cas pour que l'inspecteur le DISE (badge) au
 * lieu de masquer la démarche : on surface, on ne cache pas — motif
 * `ProceduresListPanel`. Le canevas, lui, rend la liste réelle : ce que le
 * portail sert, avec les organismes qui proposent chaque démarche.
 *
 * Les règles sont celles du Socle, lues par ses propres parseurs
 * (`parseProcedureStatus`, `parseCommunicationConfig`), pas réécrites. La
 * règle d'activation est le **miroir volontaire** de
 * `public-api/_shared/portalCatalogue.ts` — une edge function n'importe rien
 * de `src/` ; les tests des deux côtés l'épinglent.
 */
import { parseCommunicationConfig } from "@/features/procedures/communication";
import { parseProcedureStatus } from "@/features/procedures/procedureStatus";
import { AUDIENCES, enabledAudiences, type Audience } from "@/features/procedures/requesterFields";
import type { Procedure } from "@/features/procedures/useProcedures";
import {
  buildOrgTree,
  collectDescendantIdsFlat,
  type Organization,
  type OrgNode,
} from "@/features/superadmin/organizations/orgTree";

/** Pourquoi une démarche épinglée n'apparaîtrait pas sur le portail — ou `visible`. */
export type CatalogueVisibility =
  | "visible"
  | "brouillon"
  | "interne"
  | "masquee"
  | "hors-periode"
  | "non-activee";

/** Libellé du badge ; `null` pour le cas ordinaire, qui n'en porte pas. */
export const CATALOGUE_VISIBILITY_LABELS: Record<CatalogueVisibility, string | null> = {
  visible: null,
  brouillon: "Brouillon",
  interne: "Interne",
  masquee: "Non visible portail",
  "hors-periode": "Hors période",
  "non-activee": "Non activée",
};

/**
 * Les publics, tels que le filtre « Je suis… » du portail les nomme : au
 * SINGULIER, parce qu'ils complètent une phrase à la première personne — un
 * usager est un citoyen, pas « des citoyens ». Le paramétrage, lui, les nomme
 * au pluriel (`AUDIENCES`) : il décrit une population, pas la personne devant
 * l'écran.
 */
export const AUDIENCE_FILTER_LABELS: Record<Audience, string> = {
  citoyen: "Citoyen",
  entreprise: "Entreprise",
  association: "Association",
};

/** Un organisme qui propose une démarche, tel que la carte le nomme. */
export interface CatalogueOrganization {
  id: string;
  name: string;
}

export interface PortalCatalogueEntry {
  id: string;
  name: string;
  shortDescription: string | null;
  visibility: CatalogueVisibility;
  /** Organismes de l'arbre qui proposent la démarche, dans l'ordre de l'arbre. */
  organizations: CatalogueOrganization[];
  /**
   * Publics auxquels la démarche est ouverte (étape « Informations
   * demandeur »), dans l'ordre d'`AUDIENCES`. ⚠️ Peut être **vide** : une
   * démarche dont l'étape n'a jamais été remplie ne déclare aucun public, et
   * ne répond donc à aucun choix du filtre.
   */
  audiences: Audience[];
}

/** Ce qu'il faut d'une liaison `organization_procedures` pour savoir qui propose quoi. */
export interface CatalogueBinding {
  organization_id: string | null;
  procedure_id: string | null;
  is_enabled: boolean | null;
}

/** Jour civil « AAAA-MM-JJ » du navigateur — celui de l'administrateur. */
export function isoDay(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * L'arbre que le portail sert : la racine et ses sous-organisations
 * **actives**, dans l'ordre de l'arbre (la racine, puis chaque niveau, frères
 * par nom — l'ordre de `buildOrgTree`). Une organisation obsolète ne propose
 * plus rien, elle n'y figure pas.
 */
export function portalTreeOrganizations(all: Organization[], rootId: string): Organization[] {
  const ids = new Set([rootId, ...collectDescendantIdsFlat(all, rootId)]);
  const subtree = all.filter((org) => ids.has(org.id) && org.status === "active");
  const flat: Organization[] = [];
  const walk = (nodes: OrgNode[]) => {
    for (const node of nodes) {
      flat.push(node);
      walk(node.children);
    }
  };
  walk(buildOrgTree(subtree));
  return flat;
}

/**
 * Qui propose quoi : pour chaque démarche, les organismes qui l'ont activée,
 * dans l'ordre reçu (celui de l'arbre). Une liaison désactivée ou portée par
 * une organisation hors de la liste ne compte pas.
 */
export function offersByProcedure(
  bindings: CatalogueBinding[],
  organizations: CatalogueOrganization[],
): Map<string, CatalogueOrganization[]> {
  const enabledBy = new Map<string, Set<string>>();
  for (const binding of bindings) {
    if (binding.is_enabled !== true || !binding.organization_id || !binding.procedure_id) continue;
    const set = enabledBy.get(binding.organization_id) ?? new Set<string>();
    set.add(binding.procedure_id);
    enabledBy.set(binding.organization_id, set);
  }
  const offers = new Map<string, CatalogueOrganization[]>();
  for (const org of organizations) {
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

/**
 * Dans l'ordre des règles du Socle : le paramétrage est-il fini, la démarche
 * a-t-elle un guichet en ligne, est-elle proposée sur le portail, sommes-nous
 * dans sa période, quelqu'un la propose-t-il. La première qui manque nomme le
 * cas.
 *
 * La comparaison de dates est textuelle : sur « AAAA-MM-JJ », l'ordre
 * lexicographique EST l'ordre chronologique, sans décalage de fuseau.
 */
export function catalogueVisibility(
  procedure: Procedure,
  today: string,
  organizations: CatalogueOrganization[],
): CatalogueVisibility {
  if (parseProcedureStatus(procedure.status) !== "production") return "brouillon";
  if (procedure.type !== "externe") return "interne";
  const { visibility } = parseCommunicationConfig(procedure.communication_config);
  if (!visibility.portalVisible) return "masquee";
  if (visibility.publicationPeriodEnabled) {
    if (visibility.publicationStart && today < visibility.publicationStart) return "hors-periode";
    if (visibility.publicationEnd && today > visibility.publicationEnd) return "hors-periode";
  }
  if (organizations.length === 0) return "non-activee";
  return "visible";
}

export function toCatalogueEntry(
  procedure: Procedure,
  today: string,
  organizations: CatalogueOrganization[] = [],
): PortalCatalogueEntry {
  return {
    id: procedure.id,
    name: procedure.name,
    shortDescription: procedure.short_description,
    visibility: catalogueVisibility(procedure, today, organizations),
    organizations,
    audiences: enabledAudiences(procedure.requester_config),
  };
}

/**
 * Le catalogue complet de l'éditeur : toutes les démarches de la racine, dans
 * l'ordre reçu, chacune avec sa visibilité et ses organismes. `organizations`
 * est l'arbre servi par le portail (`portalTreeOrganizations`).
 */
export function buildCatalogue(
  procedures: Procedure[],
  bindings: CatalogueBinding[],
  organizations: CatalogueOrganization[],
  today: string,
): PortalCatalogueEntry[] {
  const offers = offersByProcedure(bindings, organizations);
  return procedures.map((procedure) => toCatalogueEntry(procedure, today, offers.get(procedure.id) ?? []));
}

/**
 * Les publics représentés par au moins une des entrées, dans l'ordre
 * d'`AUDIENCES` — de quoi savoir si le filtre « Je suis… » a un sens. Proposer
 * « Entreprise » quand aucune démarche ne s'y adresse ne mènerait qu'à une
 * liste vide.
 */
export function catalogueAudiences(entries: PortalCatalogueEntry[]): Audience[] {
  const present = new Set(entries.flatMap((entry) => entry.audiences));
  return AUDIENCES.map((a) => a.key).filter((key) => present.has(key));
}

/**
 * Les organismes qui proposent au moins une des entrées, dédoublonnés, dans
 * l'ordre de première apparition — de quoi savoir si un filtre a un sens.
 */
export function catalogueOrganizations(entries: PortalCatalogueEntry[]): CatalogueOrganization[] {
  const seen = new Map<string, CatalogueOrganization>();
  for (const entry of entries) {
    for (const org of entry.organizations) {
      if (!seen.has(org.id)) seen.set(org.id, org);
    }
  }
  return [...seen.values()];
}
