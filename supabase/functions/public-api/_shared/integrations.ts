/**
 * Intégrations partenaires — sérialisation pour `public-api` (contrat 1.34.0).
 *
 * Deux sorties, deux niveaux de garde :
 *   • `GET /v1/integrations` — le CATALOGUE (ce que propose Edilumen), scope
 *     `read`. Aucune donnée de collectivité, aucun secret.
 *   • `GET /v1/organizations/{id}/integrations/{slug}` — la CONFIGURATION d'une
 *     collectivité, **secrets compris**, scope `integrations` explicite. C'est,
 *     avec `/smtp`, la seule sortie sensible de l'API : les applications de la
 *     gamme (Clara pour Arpège) en ont besoin pour exécuter le métier, et le
 *     Socle est la source de vérité.
 *
 * ⚠️ WHITELIST STRICTE : seules les clés déclarées par l'adaptateur sortent,
 * chacune dans son bac (`settings` ou `secrets`). Une clé écrite en base hors
 * déclaration ne traverse pas. Les champs sont le MIROIR de
 * `integration-test/_shared/adapters.ts` (et du front) — `integrations.test.ts`
 * vérifie qu'ils disent la même chose. Pas de `_shared` de premier niveau : le
 * déploiement ne sait pas exprimer `../_shared/`.
 *
 * Pure, sans Deno : testée par vitest, déployée avec `index.ts`.
 */

type Row = Record<string, unknown>;

export interface IntegrationFieldSpec {
  key: string;
  secret: boolean;
}

/** Champs déclarés par adaptateur — clés = colonnes du connecteur de Clara. */
export const INTEGRATION_FIELDS: Record<string, IntegrationFieldSpec[]> = {
  arpege: [
    { key: "api_base_url", secret: false },
    { key: "api_url_ticketingapp", secret: false },
    { key: "client_id", secret: false },
    { key: "client_secret", secret: true },
    { key: "access_token", secret: true },
  ],
};

/** Complétude par adaptateur — règle de `resolveHawkCredentials` pour Arpège. */
const IS_COMPLETE: Record<string, (present: ReadonlySet<string>) => boolean> = {
  arpege: (present) =>
    present.has("api_base_url") &&
    (present.has("client_id") || present.has("access_token")) &&
    (present.has("client_secret") || present.has("access_token")),
};

// ── Démarches partenaires : qui les voit ────────────────────────────────────

/** Le catalogue des intégrations, réduit à ce que la visibilité demande. */
export interface PartnerDirectory {
  /** Slug par identifiant d'intégration. */
  slugs: Map<string, string>;
  /** Applications rattachées, par identifiant d'intégration. */
  applications: Map<string, string[]>;
}

/** Lignes `integrations` avec `integration_applications(application_id)`. */
export function partnerDirectory(rows: Row[]): PartnerDirectory {
  const slugs = new Map<string, string>();
  const applications = new Map<string, string[]>();
  for (const row of rows) {
    const id = str(row.id);
    if (!id) continue;
    slugs.set(id, String(row.slug));
    const links = Array.isArray(row.integration_applications) ? (row.integration_applications as Row[]) : [];
    applications.set(
      id,
      links.map((link) => str(link.application_id)).filter((v): v is string => v !== null),
    );
  }
  return { slugs, applications };
}

/**
 * Une démarche est-elle servie à cette clé ?
 *   • démarche du Socle (`integration_id` nul) : oui ;
 *   • démarche PARTENAIRE : seulement si l'application de la clé
 *     (`api_keys.consumer`) est rattachée à son intégration. Une clé sans
 *     application (partenaire, clé d'organisation) ne la voit jamais ; une
 *     intégration inconnue non plus.
 *
 * Pour les autres, la démarche N'EXISTE PAS : retirée des listes, 404 par
 * identifiant. C'est ce qui empêche Iris d'y déposer une demande et Nora de
 * l'afficher (le portail l'écarte de surcroît : `isPubliclyPublished`).
 */
export function procedureVisibleTo(row: Row, consumer: string | null, directory: PartnerDirectory): boolean {
  const integrationId = str(row.integration_id);
  if (!integrationId) return true;
  if (!consumer) return false;
  return directory.applications.get(integrationId)?.includes(consumer) ?? false;
}

export interface IntegrationTypeDto {
  id: string;
  name: string;
}

export interface IntegrationDto {
  slug: string;
  name: string;
  description: string;
  logo_url: string | null;
  type: IntegrationTypeDto;
  /** Applications de la gamme concernées (identifiants du registre : `clara`…). */
  applications: string[];
  /** Proposée par Edilumen. `false` : retirée, les configurations sont conservées. */
  available: boolean;
  /** Configurable au Socle (un adaptateur existe). `false` : « bientôt disponible ». */
  configurable: boolean;
}

export interface OrganizationIntegrationDto {
  /** Organisation demandée. */
  organization_id: string;
  /** Racine qui porte la configuration (une intégration se configure sur la racine). */
  source_organization_id: string;
  integration: string;
  type: string;
  /** Une configuration complète existe. `false` ⇒ `settings` et `secrets` vides. */
  configured: boolean;
  /**
   * EFFECTIF : activée par le super administrateur ET offre toujours proposée.
   * Une intégration inactive garde ses valeurs (le réglage gouverne l'usage,
   * pas la donnée) — c'est au consommateur de ne pas l'utiliser.
   */
  is_active: boolean;
  /** Paramètres non secrets, clés déclarées par l'adaptateur. */
  settings: Record<string, string>;
  /** ⚠️ Secrets en clair. Ne jamais journaliser, ne jamais renvoyer à un navigateur. */
  secrets: Record<string, string>;
  /** Résultat du dernier test de connexion fait au Socle (`null` : non testé depuis la dernière modification). */
  last_test_ok: boolean | null;
  last_tested_at: string | null;
  /** Dernière modification des paramètres ou des secrets. */
  updated_at: string | null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function strings(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Row)) {
      if (typeof value === "string" && value.trim() !== "") out[key] = value;
    }
  }
  return out;
}

/** Une ligne du catalogue (jointures `integration_types`, `integration_applications`). */
export function serializeIntegration(row: Row): IntegrationDto {
  const type = (row.integration_types ?? null) as Row | null;
  const links = Array.isArray(row.integration_applications) ? (row.integration_applications as Row[]) : [];
  return {
    slug: String(row.slug),
    name: String(row.name),
    description: str(row.description) ?? "",
    logo_url: str(row.logo_url),
    type: { id: String(type?.id ?? row.type_id), name: str(type?.name) ?? String(row.type_id) },
    applications: links
      .map((link) => str(link.application_id))
      .filter((id): id is string => id !== null)
      .sort(),
    available: row.is_available === true,
    configurable: typeof row.adapter === "string" && row.adapter in INTEGRATION_FIELDS,
  };
}

/**
 * Configuration d'une collectivité — whitelist par adaptateur, secrets compris.
 * `config` / `secrets` nuls ⇒ rien de configuré.
 */
export function serializeOrganizationIntegration(input: {
  organizationId: string;
  rootId: string;
  integration: Row;
  config: Row | null;
  secrets: Row | null;
}): OrganizationIntegrationDto {
  const { integration, config } = input;
  const adapter = str(integration.adapter);
  const fields = (adapter && INTEGRATION_FIELDS[adapter]) || [];
  const storedSettings = strings(config?.settings);
  const storedSecrets = strings(input.secrets?.secrets);

  const settings: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const field of fields) {
    const value = field.secret ? storedSecrets[field.key] : storedSettings[field.key];
    if (value === undefined) continue;
    // Un secret n'est jamais élagué (une espace peut en faire partie) ; un paramètre si.
    if (field.secret) secrets[field.key] = value;
    else settings[field.key] = value.trim();
  }

  const present = new Set([...Object.keys(settings), ...Object.keys(secrets)]);
  const complete = Boolean(config && adapter && IS_COMPLETE[adapter]?.(present));

  const base = {
    organization_id: input.organizationId,
    source_organization_id: input.rootId,
    integration: String(integration.slug),
    type: String(integration.type_id),
  };
  if (!complete) {
    return {
      ...base,
      configured: false,
      is_active: false,
      settings: {},
      secrets: {},
      last_test_ok: null,
      last_tested_at: null,
      updated_at: null,
    };
  }

  const updates = [str(config!.updated_at), str(input.secrets?.updated_at)].filter(
    (v): v is string => v !== null,
  );
  return {
    ...base,
    configured: true,
    is_active: config!.is_active === true && integration.is_available === true,
    settings,
    secrets,
    last_test_ok: typeof config!.last_test_ok === "boolean" ? (config!.last_test_ok as boolean) : null,
    last_tested_at: str(config!.last_tested_at),
    updated_at: updates.length > 0 ? updates.sort().at(-1)! : null,
  };
}
