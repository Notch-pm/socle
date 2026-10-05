import { getAdapter, presentKeys, readValues } from "./adapters";

/**
 * Statut d'une intégration — DÉRIVÉ, jamais stocké. La base ne tient que les
 * faits (offre proposée, paramètres, secrets présents, activation, dernier
 * test) ; ce qu'on affiche s'en déduit ici, en un seul endroit.
 */

export type IntegrationStatus =
  /** Au catalogue sans adaptateur : pas encore configurable. */
  | "soon"
  /** Retirée du catalogue (`is_available = false`) ; configurations conservées. */
  | "disabled"
  /** Proposée — vue catalogue. */
  | "available"
  /** Proposée, rien (ou pas assez) de saisi pour cette collectivité. */
  | "not_configured"
  /** Complète, pas activée. */
  | "configured"
  | "active"
  /** Dernier test de connexion en échec — prime sur « configurée » et « active ». */
  | "error";

export const STATUS_LABELS: Record<IntegrationStatus, string> = {
  soon: "Bientôt disponible",
  disabled: "Désactivée",
  available: "Disponible",
  not_configured: "Non configurée",
  configured: "Configurée",
  active: "Active",
  error: "En erreur",
};

export type StatusTone = "success" | "destructive" | "secondary" | "outline" | "muted";

export const STATUS_TONES: Record<IntegrationStatus, StatusTone> = {
  soon: "muted",
  disabled: "muted",
  available: "outline",
  not_configured: "outline",
  configured: "secondary",
  active: "success",
  error: "destructive",
};

interface CatalogueFacts {
  adapter: string | null;
  is_available: boolean;
}

interface ConfigFacts {
  settings: unknown;
  is_active: boolean;
  last_test_ok: boolean | null;
}

/** Statut au catalogue (ce que propose Edilumen). */
export function catalogueStatus(integration: CatalogueFacts): IntegrationStatus {
  if (!integration.is_available) return "disabled";
  if (!getAdapter(integration.adapter)) return "soon";
  return "available";
}

/** Statut pour une collectivité. */
export function organizationStatus(
  integration: CatalogueFacts,
  config: ConfigFacts | null | undefined,
  secretKeys: readonly string[] = [],
): IntegrationStatus {
  return overviewStatus(
    integration,
    config
      ? {
          is_active: config.is_active,
          last_test_ok: config.last_test_ok,
          present_keys: [...presentKeys(readValues(config.settings), secretKeys)],
        }
      : null,
  );
}

/**
 * Les faits d'état tels que les rend `organization_integration_overview` à
 * l'administrateur de la collectivité : les NOMS des champs renseignés, jamais
 * leur valeur. Même statut que la fiche du super admin, par la même règle.
 */
export interface OverviewFacts {
  is_active: boolean;
  last_test_ok: boolean | null;
  present_keys: readonly string[];
}

export function overviewStatus(
  integration: CatalogueFacts,
  facts: OverviewFacts | null | undefined,
): IntegrationStatus {
  const catalogue = catalogueStatus(integration);
  if (catalogue !== "available") return catalogue;
  if (!facts) return "not_configured";
  if (facts.last_test_ok === false) return "error";
  if (facts.is_active) return "active";
  const adapter = getAdapter(integration.adapter)!;
  return adapter.isComplete(new Set(facts.present_keys)) ? "configured" : "not_configured";
}
