/**
 * Adaptateurs d'intégration — côté écran : quels paramètres afficher (et
 * lesquels sont secrets), et quand une configuration est complète.
 *
 * ⚠️ MIROIR de `supabase/functions/integration-test/_shared/adapters.ts`, qui
 * porte en plus le test de connexion. Les deux disent la même chose des
 * champs et de la complétude — `adapters.mirror.test.ts` (côté edge) le
 * vérifie. Un partenaire configurable s'ajoute DES DEUX CÔTÉS.
 *
 * Une intégration du catalogue dont `adapter` est NULL n'a pas d'adaptateur :
 * elle s'affiche « Bientôt disponible », sans formulaire.
 */

export interface AdapterField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  advanced?: boolean;
  placeholder?: string;
  hint?: string;
}

export interface IntegrationAdapter {
  key: string;
  fields: AdapterField[];
  /** `present` = clés renseignées (paramètres non vides ET secrets présents). */
  isComplete(present: ReadonlySet<string>): boolean;
}

// ── Arpège ── paramètres du connecteur de Clara, clés = ses colonnes.
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
  isComplete(present) {
    return (
      present.has("api_base_url") &&
      (present.has("client_id") || present.has("access_token")) &&
      (present.has("client_secret") || present.has("access_token"))
    );
  },
};

const ADAPTERS: Record<string, IntegrationAdapter> = {
  [arpegeAdapter.key]: arpegeAdapter,
};

export function getAdapter(key: string | null | undefined): IntegrationAdapter | null {
  return key ? (ADAPTERS[key] ?? null) : null;
}

/** Ne garde, d'un objet JSON quelconque, que les chaînes. */
export function readValues(raw: unknown): Record<string, string> {
  const values: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") values[key] = value;
    }
  }
  return values;
}

/** Clés « renseignées » : paramètres non vides + secrets présents. */
export function presentKeys(
  settings: Record<string, string>,
  secretKeys: Iterable<string>,
): Set<string> {
  const present = new Set<string>();
  for (const [key, value] of Object.entries(settings)) {
    if (value.trim() !== "") present.add(key);
  }
  for (const key of secretKeys) present.add(key);
  return present;
}
