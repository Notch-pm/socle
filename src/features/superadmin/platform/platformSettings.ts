/**
 * Réglages de plateforme — logique pure (ni React ni Supabase), testée.
 *
 * Trois valeurs, posées une fois par l'éditeur, qui gouvernent ce que le Socle
 * pose de lui-même à chaque nouvelle collectivité (`provision_root`) :
 * la zone des sous-domaines fournis, la cible CNAME des domaines
 * personnalisés, le plafond IA par défaut. Ce module met la saisie en forme
 * et dit ce qui ne passerait pas la base — les CHECK de `platform_settings`
 * restent l'arbitre.
 */

import { normalizeHostname, validateHostname } from "@/features/organizations/organizationDomains";

/** La ligne telle que la base la porte (colonnes utiles à l'écran). */
export interface PlatformSettingsRow {
  portal_domain_suffix: string | null;
  portal_cname_target: string | null;
  default_ai_monthly_tokens: number | null;
}

/** L'état du formulaire : des chaînes, vides quand rien n'est réglé. */
export interface PlatformSettingsInput {
  portalDomainSuffix: string;
  portalCnameTarget: string;
  defaultAiMonthlyTokens: string;
}

export type PlatformSettingsErrors = Partial<Record<keyof PlatformSettingsInput, string>>;

export function settingsInput(row: PlatformSettingsRow | null | undefined): PlatformSettingsInput {
  return {
    portalDomainSuffix: row?.portal_domain_suffix ?? "",
    portalCnameTarget: row?.portal_cname_target ?? "",
    defaultAiMonthlyTokens:
      row?.default_ai_monthly_tokens == null ? "" : String(row.default_ai_monthly_tokens),
  };
}

/**
 * « 2 000 000 », « 2000000 », « 2 000 000 » (espace fine) : un nombre de jetons
 * tel qu'on le tape. `null` pour une case vide, `NaN` pour ce qui n'est pas un
 * entier strictement positif.
 */
export function parseTokenCount(raw: string): number | null {
  const digits = raw.replace(/[\s  ]/g, "");
  if (digits === "") return null;
  if (!/^\d+$/.test(digits)) return Number.NaN;
  const value = Number.parseInt(digits, 10);
  return value > 0 ? value : Number.NaN;
}

/**
 * Ce que le formulaire enverrait, ou les messages qui l'en empêchent. Une case
 * vide vaut « pas de réglage » (NULL) — jamais une chaîne vide, que le
 * trigger `normalize_platform_settings` ramènerait de toute façon à NULL.
 */
export function validateSettings(
  input: PlatformSettingsInput,
): { errors: PlatformSettingsErrors; write: PlatformSettingsRow | null } {
  const errors: PlatformSettingsErrors = {};

  const suffixRaw = input.portalDomainSuffix.trim();
  const suffixError = suffixRaw === "" ? null : validateHostname(suffixRaw);
  if (suffixError) errors.portalDomainSuffix = suffixError;

  const cnameRaw = input.portalCnameTarget.trim();
  const cnameError = cnameRaw === "" ? null : validateHostname(cnameRaw);
  if (cnameError) errors.portalCnameTarget = cnameError;

  const tokens = parseTokenCount(input.defaultAiMonthlyTokens);
  if (Number.isNaN(tokens)) {
    errors.defaultAiMonthlyTokens =
      "Le plafond doit être un nombre de jetons strictement positif, ou rester vide.";
  }

  if (Object.keys(errors).length > 0) return { errors, write: null };

  return {
    errors,
    write: {
      portal_domain_suffix: suffixRaw === "" ? null : normalizeHostname(suffixRaw),
      portal_cname_target: cnameRaw === "" ? null : normalizeHostname(cnameRaw),
      default_ai_monthly_tokens: tokens,
    },
  };
}

/** Résultat de `provision_existing_roots`, tel que l'écran le raconte. */
export interface ProvisionReport {
  organizations: number;
  roles: number;
  quotas: number;
  domains: number;
}

export function parseProvisionReport(value: unknown): ProvisionReport {
  const record = (value ?? {}) as Record<string, unknown>;
  const count = (key: keyof ProvisionReport) => {
    const raw = record[key];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  };
  return {
    organizations: count("organizations"),
    roles: count("roles"),
    quotas: count("quotas"),
    domains: count("domains"),
  };
}

/** Une phrase, pas un tableau : le geste est ponctuel, on lit le résultat une fois. */
export function provisionReportLabel(report: ProvisionReport): string {
  const plural = (n: number, singular: string, pluralForm: string) =>
    `${n} ${n > 1 ? pluralForm : singular}`;
  const added = [
    plural(report.roles, "rôle de contact", "rôles de contact"),
    plural(report.quotas, "plafond IA", "plafonds IA"),
    plural(report.domains, "sous-domaine", "sous-domaines"),
  ];
  const orgs = plural(report.organizations, "organisation principale parcourue", "organisations principales parcourues");
  if (report.roles + report.quotas + report.domains === 0) {
    return `${orgs} : rien à ajouter, tout était déjà en place.`;
  }
  return `${orgs} : ${added.join(", ")} ajoutés.`;
}
