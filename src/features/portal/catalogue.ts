/**
 * Le catalogue de démarches vu par l'éditeur du portail : ce qu'on peut
 * épingler, et ce que l'usager verra vraiment.
 *
 * Épingler ne publie pas. Une démarche `brouillon`, `interne`, retirée du
 * portail ou hors de sa période de publication peut être choisie dans
 * l'éditeur — et le portail ne l'affichera pas. Ce module met un mot sur chaque
 * cas pour que l'inspecteur et le canevas le DISENT (badge, atténuation) au
 * lieu de masquer la démarche : on surface, on ne cache pas — motif
 * `ProceduresListPanel`.
 *
 * Les règles sont celles du Socle, lues par ses propres parseurs
 * (`parseProcedureStatus`, `parseCommunicationConfig`), pas réécrites.
 */
import { parseCommunicationConfig } from "@/features/procedures/communication";
import { parseProcedureStatus } from "@/features/procedures/procedureStatus";
import type { Procedure } from "@/features/procedures/useProcedures";

/** Pourquoi une démarche épinglée n'apparaîtrait pas sur le portail — ou `visible`. */
export type CatalogueVisibility = "visible" | "brouillon" | "interne" | "masquee" | "hors-periode";

/** Libellé du badge ; `null` pour le cas ordinaire, qui n'en porte pas. */
export const CATALOGUE_VISIBILITY_LABELS: Record<CatalogueVisibility, string | null> = {
  visible: null,
  brouillon: "Brouillon",
  interne: "Interne",
  masquee: "Non visible portail",
  "hors-periode": "Hors période",
};

export interface PortalCatalogueEntry {
  id: string;
  name: string;
  shortDescription: string | null;
  visibility: CatalogueVisibility;
}

/** Jour civil « AAAA-MM-JJ » du navigateur — celui de l'administrateur. */
export function isoDay(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Dans l'ordre des règles du Socle : le paramétrage est-il fini, la démarche
 * a-t-elle un guichet en ligne, est-elle proposée sur le portail, sommes-nous
 * dans sa période. La première qui manque nomme le cas.
 *
 * La comparaison de dates est textuelle : sur « AAAA-MM-JJ », l'ordre
 * lexicographique EST l'ordre chronologique, sans décalage de fuseau.
 */
export function catalogueVisibility(procedure: Procedure, today: string): CatalogueVisibility {
  if (parseProcedureStatus(procedure.status) !== "production") return "brouillon";
  if (procedure.type !== "externe") return "interne";
  const { visibility } = parseCommunicationConfig(procedure.communication_config);
  if (!visibility.portalVisible) return "masquee";
  if (visibility.publicationPeriodEnabled) {
    if (visibility.publicationStart && today < visibility.publicationStart) return "hors-periode";
    if (visibility.publicationEnd && today > visibility.publicationEnd) return "hors-periode";
  }
  return "visible";
}

export function toCatalogueEntry(procedure: Procedure, today: string): PortalCatalogueEntry {
  return {
    id: procedure.id,
    name: procedure.name,
    shortDescription: procedure.short_description,
    visibility: catalogueVisibility(procedure, today),
  };
}
