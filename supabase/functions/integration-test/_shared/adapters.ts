/**
 * Adaptateurs d'intégration — côté edge.
 *
 * Un adaptateur n'est PAS un framework : c'est la liste des paramètres d'un
 * partenaire (lesquels sont secrets, lesquels sont requis), la règle « la
 * configuration est complète », et un test de connexion. Le métier (créer une
 * demande, synchroniser…) reste dans l'application qui l'exécute — Clara pour
 * Arpège. Le Socle configure, l'application exécute.
 *
 * ⚠️ MIROIR : `src/features/integrations/adapters.ts` porte les mêmes champs et
 * la même règle de complétude (le formulaire et le statut). Une edge function
 * n'importe rien de `src/` ; `src/features/integrations/adapters.test.ts`
 * vérifie que les deux côtés disent la même chose.
 *
 * Pure (aucune API Deno) : testée par vitest, déployée avec `index.ts`.
 */
import { buildHawkHeader, resolveArpegeUrl, resolveHawkCredentials } from "./hawk.ts";

export interface AdapterField {
  /** Clé dans `settings` (non secret) ou dans la table des secrets. */
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  /** Replié sous « Paramètres avancés ». */
  advanced?: boolean;
  placeholder?: string;
  hint?: string;
}

export type Values = Record<string, string | undefined>;

export interface TestResult {
  ok: boolean;
  /** Message court en français — jamais de secret, jamais d'en-tête. */
  message: string;
}

export interface IntegrationAdapter {
  key: string;
  fields: AdapterField[];
  /** `present` = clés renseignées (paramètres non vides ET secrets présents). */
  isComplete(present: ReadonlySet<string>): boolean;
  test(settings: Values, secrets: Values, fetchImpl?: typeof fetch): Promise<TestResult>;
}

/** Délai du test de connexion : borné, pour ne jamais suspendre l'écran. */
export const TEST_TIMEOUT_MS = 15_000;

const MAX_DETAIL = 200;

function short(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL)}…` : flat;
}

// ── Arpège ──────────────────────────────────────────────────────────────────
// Paramètres = ceux du connecteur de Clara (`OrgIntegrations.tsx`), clés
// = ses colonnes, pour que la bascule (lot 2) soit une recopie, pas une
// traduction. Rien d'inventé.

export const ARPEGE_FIELDS: AdapterField[] = [
  {
    key: "api_base_url",
    label: "URL de l'API",
    secret: false,
    required: true,
    placeholder: "https://api.espace-citoyens.net",
    hint: "Adresse de l'API Interop d'Arpège (Espace Citoyens).",
  },
  {
    key: "api_url_ticketingapp",
    label: "URL de l'espace agent",
    secret: false,
    required: false,
    placeholder: "https://…",
    hint: "Lien vers l'espace agent Arpège, proposé aux agents dans Clara.",
  },
  { key: "client_id", label: "Identifiant client", secret: false, required: true },
  { key: "client_secret", label: "Secret client", secret: true, required: true },
  {
    key: "access_token",
    label: "Jeton d'accès (ancien mode)",
    secret: true,
    required: false,
    advanced: true,
    hint: "Ancien mode d'authentification : remplace l'identifiant et le secret client s'ils manquent.",
  },
];

export const arpegeAdapter: IntegrationAdapter = {
  key: "arpege",
  fields: ARPEGE_FIELDS,
  // Règle de `resolveHawkCredentials` : le jeton supplée l'un ou l'autre.
  isComplete(present) {
    return (
      present.has("api_base_url") &&
      (present.has("client_id") || present.has("access_token")) &&
      (present.has("client_secret") || present.has("access_token"))
    );
  },
  async test(settings, secrets, fetchImpl = fetch) {
    const apiBaseUrl = (settings.api_base_url ?? "").trim();
    if (!apiBaseUrl) return { ok: false, message: "URL de l'API manquante." };

    const { hawkId, hawkKey } = resolveHawkCredentials({
      client_id: settings.client_id,
      client_secret: secrets.client_secret,
      access_token: secrets.access_token,
    });
    if (!hawkId || !hawkKey) {
      return {
        ok: false,
        message: "Identifiants manquants : identifiant et secret client, ou jeton d'accès.",
      };
    }

    const base = resolveArpegeUrl(apiBaseUrl);
    if (!base.startsWith("https://")) {
      return { ok: false, message: "L'URL de l'API doit commencer par https://." };
    }
    let url: string;
    try {
      url = new URL(`${base}/v2/Hello`).toString();
    } catch {
      return { ok: false, message: "URL de l'API invalide." };
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Authorization: await buildHawkHeader(url, "GET", hawkId, hawkKey),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      return {
        ok: false,
        message: timedOut
          ? "Arpège n'a pas répondu dans le délai imparti."
          : "Arpège injoignable à cette adresse.",
      };
    }

    const body = await response.text().catch(() => "");
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: `Identifiants refusés par Arpège (HTTP ${response.status}).` };
      }
      return { ok: false, message: short(`HTTP ${response.status} ${body}`) };
    }

    let data: { IsSuccess?: boolean; CodErreur?: unknown; LibErreur?: unknown } = {};
    try {
      data = JSON.parse(body);
    } catch {
      // Clara tolère un corps non JSON sur une réponse 2xx : on fait de même.
    }
    if (data?.IsSuccess === false) {
      return { ok: false, message: short(`${data.CodErreur ?? "Erreur"} : ${data.LibErreur ?? ""}`) };
    }
    return { ok: true, message: "Connexion réussie avec l'API Arpège." };
  },
};

const ADAPTERS: Record<string, IntegrationAdapter> = {
  [arpegeAdapter.key]: arpegeAdapter,
};

export function getAdapter(key: string | null | undefined): IntegrationAdapter | null {
  return key ? (ADAPTERS[key] ?? null) : null;
}

/** Clés « renseignées » : paramètres non vides + secrets présents. */
export function presentKeys(settings: Values, secretKeys: Iterable<string>): Set<string> {
  const present = new Set<string>();
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === "string" && value.trim() !== "") present.add(key);
  }
  for (const key of secretKeys) present.add(key);
  return present;
}

/** Ne garde, d'un objet JSON quelconque, que les chaînes. */
export function readValues(raw: unknown): Values {
  const values: Values = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") values[key] = value;
    }
  }
  return values;
}
