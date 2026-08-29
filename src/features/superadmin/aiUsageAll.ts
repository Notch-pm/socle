/**
 * Consommation IA de TOUTES les collectivités — la vue de l'éditeur.
 *
 * C'est le seul écran qui répond à « quel client me coûte quoi ce mois-ci ».
 * La fiche d'une organisation (Organisations › Assistant IA) répond à
 * « combien a dépensé CELLE-CI, et par quelle application » : les deux
 * questions sont différentes, et c'est pourquoi les deux écrans existent.
 *
 * ⚠️ LE PLAFOND VIT SUR UNE RACINE. Un budget est une affaire de collectivité,
 * pas de service — le trigger `enforce_ai_usage_quota_root_org` le garde en
 * base. Cette table ne liste donc que les organisations principales : afficher
 * une sous-organisation y ferait croire qu'on peut lui poser un plafond.
 *
 * ⚠️ UN PLAFOND DÉSACTIVÉ COMPTE COMME ABSENT — c'est ce que fait
 * `reserve_ai_usage`, et un écran qui dirait autre chose que le serveur
 * mentirait sur ce qui va réellement se passer au prochain appel.
 *
 * Module PUR, testé.
 */

import { quotaView, type QuotaView } from "@/features/superadmin/organizations/aiQuota";

/** Sentinelle du plafond « tous fournisseurs confondus » (jumeau du SQL). */
export const GLOBAL_PROVIDER = "__global__";

export interface OrgRow {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface QuotaRow {
  organization_id: string;
  provider: string;
  monthly_limit_tokens: number;
  is_active: boolean;
  updated_at: string | null;
}

export interface CounterRow {
  organization_id: string;
  provider: string;
  used_tokens: number;
  reserved_tokens: number;
}

export interface OrgUsage {
  organizationId: string;
  name: string;
  view: QuotaView;
  /** `false` quand un plafond existe mais a été désactivé — nuance utile. */
  isActive: boolean;
  updatedAt: string | null;
}

export interface UsageTotals {
  /** Collectivités ayant consommé au moins un jeton ce mois. */
  active: number;
  engaged: number;
  /** Collectivités sans plafond : celles qui peuvent dépenser sans borne. */
  unlimited: number;
  /** Collectivités au-delà de 80 % de leur plafond. */
  atRisk: number;
}

/**
 * Rapproche organisations, plafonds et compteurs. Les racines SANS ligne de
 * plafond ni de compteur apparaissent quand même, en « illimité, 0 jeton » :
 * une collectivité absente du tableau serait lue comme une collectivité qui ne
 * consomme pas, alors qu'elle est surtout celle qu'on a oublié de border.
 */
export function buildUsageRows(
  orgs: OrgRow[],
  quotas: QuotaRow[],
  counters: CounterRow[],
): OrgUsage[] {
  const quotaByOrg = new Map(
    quotas.filter((q) => q.provider === GLOBAL_PROVIDER).map((q) => [q.organization_id, q]),
  );
  const counterByOrg = new Map(
    counters.filter((c) => c.provider === GLOBAL_PROVIDER).map((c) => [c.organization_id, c]),
  );

  return orgs
    .filter((o) => o.parent_id === null)
    .map((org) => {
      const quota = quotaByOrg.get(org.id) ?? null;
      const counter = counterByOrg.get(org.id) ?? null;
      const active = quota?.is_active ?? false;
      return {
        organizationId: org.id,
        name: org.name,
        isActive: active,
        updatedAt: quota?.updated_at ?? null,
        view: quotaView({
          limit: quota && active ? quota.monthly_limit_tokens : null,
          used: counter?.used_tokens ?? 0,
          reserved: counter?.reserved_tokens ?? 0,
        }),
      };
    })
    .sort((a, b) => b.view.engaged - a.view.engaged || a.name.localeCompare(b.name));
}

/**
 * Ce que l'éditeur veut voir en haut de page. `engaged` est la somme de ce qui
 * est réellement engagé — le total des PLAFONDS ne veut rien dire : personne ne
 * consomme son plafond, et l'additionner donnerait un chiffre qui n'est ni une
 * dépense ni un engagement.
 */
export function usageTotals(rows: OrgUsage[]): UsageTotals {
  return {
    active: rows.filter((r) => r.view.engaged > 0).length,
    engaged: rows.reduce((sum, r) => sum + r.view.engaged, 0),
    unlimited: rows.filter((r) => r.view.unlimited).length,
    atRisk: rows.filter((r) => !r.view.unlimited && r.view.tone !== "ok").length,
  };
}
