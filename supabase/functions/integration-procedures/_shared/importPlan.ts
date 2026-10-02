/**
 * Plan d'import des démarches d'un partenaire dans le catalogue d'une racine.
 * Pur : testé par vitest.
 *
 * Règles :
 *   • clé = code chez le partenaire (`external_reference`) ;
 *   • création : nom, description courte, configuration du partenaire ;
 *   • mise à jour : nom, description courte et configuration SEULEMENT — la
 *     catégorie, le statut et les activations appartiennent au Socle et ne sont
 *     jamais touchés par un nouvel import ;
 *   • une démarche disparue du partenaire n'est JAMAIS supprimée (des
 *     activations et des demandes y pointent) : elle est signalée.
 */
import type { ArpegeProcedure } from "./arpegeCatalogue.ts";

export interface ExistingPartnerProcedure {
  id: string;
  external_reference: string;
  name: string;
  short_description: string | null;
  partner_config: unknown;
}

export interface ImportPlan {
  toInsert: ArpegeProcedure[];
  toUpdate: { id: string; name: string; short_description: string | null; partner_config: unknown }[];
  unchanged: number;
  /** Présentes au Socle, absentes du partenaire : noms, pour le dire. */
  missing: string[];
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

export function planImport(existing: ExistingPartnerProcedure[], catalogue: ArpegeProcedure[]): ImportPlan {
  const byReference = new Map(existing.map((row) => [row.external_reference, row]));
  const plan: ImportPlan = { toInsert: [], toUpdate: [], unchanged: 0, missing: [] };
  const seen = new Set<string>();

  for (const procedure of catalogue) {
    seen.add(procedure.reference);
    const row = byReference.get(procedure.reference);
    if (!row) {
      plan.toInsert.push(procedure);
      continue;
    }
    const changed =
      row.name !== procedure.name ||
      (row.short_description ?? null) !== procedure.description ||
      stable(row.partner_config) !== stable(procedure.config);
    if (changed) {
      plan.toUpdate.push({
        id: row.id,
        name: procedure.name,
        short_description: procedure.description,
        partner_config: procedure.config,
      });
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

/** Nom de la catégorie où l'import range les démarches d'un partenaire. */
export function partnerCategoryName(partnerName: string): string {
  return `Démarches ${partnerName}`;
}
