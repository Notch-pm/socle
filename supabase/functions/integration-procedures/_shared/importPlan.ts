/**
 * Plan d'import des démarches — et de leurs catégories — d'un partenaire dans le
 * catalogue d'une racine. Pur : testé par vitest.
 *
 * Catégories (`planCategories`) :
 *   • une catégorie par catégorie du partenaire EMPLOYÉE par au moins une
 *     démarche, nommée « <Libellé> (<Partenaire>) », clé = son code ;
 *   • un libellé changé chez le partenaire renomme la catégorie ;
 *   • une catégorie qui n'est plus employée n'est pas supprimée (elle peut
 *     encore ranger une démarche déplacée à la main).
 *
 * Démarches (`planImport`) :
 *   • clé = code chez le partenaire (`external_reference`) ;
 *   • création : nom, description courte, configuration, catégorie du partenaire ;
 *   • mise à jour : nom, description courte, configuration — et la catégorie,
 *     SEULEMENT si la démarche est encore dans une catégorie « gérée » (une
 *     catégorie du partenaire, l'ancienne catégorie fourre-tout, ou aucune).
 *     Une démarche déplacée à la main dans une catégorie du Socle y reste ;
 *   • statut et activations ne sont jamais touchés ;
 *   • une démarche disparue du partenaire n'est JAMAIS supprimée : signalée.
 */
import type { ArpegeCategory, ArpegeProcedure } from "./arpegeCatalogue.ts";

export interface ExistingPartnerProcedure {
  id: string;
  external_reference: string;
  name: string;
  short_description: string | null;
  partner_config: unknown;
  category_id: string | null;
}

export interface ExistingPartnerCategory {
  id: string;
  external_reference: string;
  name: string;
}

export interface CategoryPlan {
  toInsert: { reference: string; name: string }[];
  toRename: { id: string; name: string }[];
  unchanged: number;
}

export interface ImportPlan {
  toInsert: (ArpegeProcedure & { category_id: string | null })[];
  toUpdate: {
    id: string;
    name: string;
    short_description: string | null;
    partner_config: unknown;
    category_id: string | null;
  }[];
  unchanged: number;
  /** Démarches rangées dans (ou déplacées vers) la catégorie de leur partenaire. */
  recategorized: number;
  /** Présentes au Socle, absentes du partenaire : noms, pour le dire. */
  missing: string[];
}

/** Nom d'une catégorie importée : « Actes d'état civil (Arpège) ». */
export function partnerCategoryLabel(label: string, partnerName: string): string {
  return `${label} (${partnerName})`;
}

/** Ancienne catégorie fourre-tout (import du 2026-10-02), et repli sans catégorie. */
export function partnerCategoryName(partnerName: string): string {
  return `Démarches ${partnerName}`;
}

export function planCategories(
  existing: ExistingPartnerCategory[],
  catalogue: ArpegeCategory[],
  partnerName: string,
): CategoryPlan {
  const byReference = new Map(existing.map((row) => [row.external_reference, row]));
  const plan: CategoryPlan = { toInsert: [], toRename: [], unchanged: 0 };
  for (const category of catalogue) {
    const name = partnerCategoryLabel(category.name, partnerName);
    const row = byReference.get(category.reference);
    if (!row) plan.toInsert.push({ reference: category.reference, name });
    else if (row.name !== name) plan.toRename.push({ id: row.id, name });
    else plan.unchanged++;
  }
  return plan;
}

/** Égalité structurelle, indépendante de l'ordre des clés (jsonb ne garde pas l'ordre). */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function planImport(
  existing: ExistingPartnerProcedure[],
  catalogue: ArpegeProcedure[],
  categories: {
    /** Catégorie du Socle par code de catégorie du partenaire. */
    idByReference: Map<string, string>;
    /** Catégories que l'import a le droit de réattribuer (partenaire + fourre-tout). */
    managedIds: Set<string>;
    /** Repli d'une démarche sans catégorie chez le partenaire. */
    fallbackId: string | null;
  },
): ImportPlan {
  const byReference = new Map(existing.map((row) => [row.external_reference, row]));
  const plan: ImportPlan = { toInsert: [], toUpdate: [], unchanged: 0, recategorized: 0, missing: [] };
  const seen = new Set<string>();

  const targetOf = (procedure: ArpegeProcedure): string | null =>
    (procedure.categoryReference && categories.idByReference.get(procedure.categoryReference)) || null;

  for (const procedure of catalogue) {
    seen.add(procedure.reference);
    const row = byReference.get(procedure.reference);
    const target = targetOf(procedure);
    if (!row) {
      plan.toInsert.push({ ...procedure, category_id: target ?? categories.fallbackId });
      continue;
    }
    const managed = row.category_id === null || categories.managedIds.has(row.category_id);
    const category_id = managed && target ? target : row.category_id;
    const moved = category_id !== row.category_id;
    const changed =
      moved ||
      row.name !== procedure.name ||
      (row.short_description ?? null) !== procedure.description ||
      stable(row.partner_config) !== stable(procedure.config);
    if (changed) {
      plan.toUpdate.push({
        id: row.id,
        name: procedure.name,
        short_description: procedure.description,
        partner_config: procedure.config,
        category_id,
      });
      if (moved) plan.recategorized++;
    } else {
      plan.unchanged++;
    }
  }

  for (const row of existing) {
    if (!seen.has(row.external_reference)) plan.missing.push(row.name);
  }
  plan.missing.sort((a, b) => a.localeCompare(b, "fr"));
  return plan;
}
