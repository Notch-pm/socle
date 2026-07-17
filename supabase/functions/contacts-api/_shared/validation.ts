/**
 * Validation des payloads d'écriture de l'API usagers — logique **pure**
 * (aucune dépendance Deno/DB), testée par vitest. Les règles miroitent les
 * contraintes `CHECK` de la table `contacts` pour renvoyer des messages
 * français exploitables (la base reste le garde-fou final).
 *
 * Principes :
 * - **whitelist stricte** des clés acceptées (une clé inconnue → 400, attrape
 *   les fautes de frappe au lieu de les ignorer silencieusement) ;
 * - chaînes normalisées (trim, `""` → `null`) ;
 * - `contact_type` uniquement à la création (immuable ensuite) ;
 * - `status` jamais accepté ici (endpoints dédiés `/archive` et `/restore`).
 */

export const CONTACT_TYPES = ["personne", "entreprise", "association", "administration"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const CIVILITIES = ["madame", "monsieur"] as const;
export const PREFERRED_CHANNELS = ["email", "telephone", "courrier"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** L'identifiant a-t-il la forme d'un UUID ? (garde-fou avant requête) */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** La clé API a-t-elle accès au référentiel usagers ? */
export function hasContactsScope(scopes: unknown): boolean {
  return Array.isArray(scopes) && scopes.includes("contacts");
}

/** Champs texte de `contacts` acceptés en écriture (normalisés trim/null). */
const TEXT_FIELDS = [
  "civility",
  "first_name",
  "last_name",
  "usage_name",
  "legal_name",
  "siret",
  "email",
  "mobile_phone",
  "landline_phone",
  "address_line1",
  "address_line2",
  "postal_code",
  "city",
  "country",
  "preferred_channel",
  "internal_notes",
] as const;

const ALLOWED_KEYS = new Set<string>([
  "contact_type",
  ...TEXT_FIELDS,
  "birth_date",
  "consent_email",
  "consent_sms",
  "address_lat",
  "address_lon",
  "quartier_id",
  "role_ids",
  "external_references",
  "relations",
]);

export interface ExternalRefInput {
  source: string;
  external_id: string;
}

/** Relation sortante : le contact porteur est <role_id> de <related_contact_id>. */
export interface RelationInput {
  related_contact_id: string;
  role_id: string;
}

export interface ParsedContactInput {
  /** Colonnes de `contacts` à écrire (uniquement celles présentes dans le payload). */
  fields: Record<string, string | number | boolean | null>;
  /** `undefined` = ne pas toucher aux rôles ; `[]` = tout retirer. */
  roleIds: string[] | undefined;
  /** `undefined` = ne pas toucher aux références ; `[]` = tout retirer. */
  externalRefs: ExternalRefInput[] | undefined;
  /** `undefined` = ne pas toucher aux relations ; `[]` = tout retirer. */
  relations: RelationInput[] | undefined;
}

export type ParseOutcome =
  | { ok: true; value: ParsedContactInput }
  | { ok: false; message: string };

function fail(message: string): ParseOutcome {
  return { ok: false, message };
}

/** Chaîne normalisée : trim, vide → null. Refuse les non-chaînes. */
function normalizeText(value: unknown, key: string): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, message: `Le champ ${key} doit être une chaîne de caractères.` };
  }
  const trimmed = value.trim();
  return { ok: true, value: trimmed === "" ? null : trimmed };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const time = new Date(`${value}T00:00:00Z`).getTime();
  return Number.isFinite(time);
}

/**
 * Analyse et normalise un payload de création (`mode: "create"`) ou de
 * modification partielle (`mode: "update"`). Ne vérifie pas les invariants
 * par type (voir `contactInvariantError`, appliqué sur l'objet fusionné).
 */
export function parseContactPayload(body: unknown, mode: "create" | "update"): ParseOutcome {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail("Le corps de la requête doit être un objet JSON.");
  }
  const input = body as Record<string, unknown>;

  for (const key of Object.keys(input)) {
    if (key === "status") {
      return fail("Le statut ne se modifie pas ici : utilisez /archive ou /restore.");
    }
    if (!ALLOWED_KEYS.has(key)) {
      return fail(`Champ inconnu : ${key}.`);
    }
  }

  const fields: Record<string, string | number | boolean | null> = {};

  // --- contact_type : requis à la création, immuable ensuite ---
  if (mode === "create") {
    const type = input.contact_type;
    if (typeof type !== "string" || !(CONTACT_TYPES as readonly string[]).includes(type)) {
      return fail(`contact_type est obligatoire (valeurs : ${CONTACT_TYPES.join(", ")}).`);
    }
    fields.contact_type = type;
  } else if ("contact_type" in input) {
    return fail("contact_type est immuable après la création.");
  }

  // --- Champs texte ---
  for (const key of TEXT_FIELDS) {
    if (!(key in input)) continue;
    const normalized = normalizeText(input[key], key);
    if (!normalized.ok) return fail(normalized.message);
    fields[key] = normalized.value;
  }

  if (fields.civility != null && !(CIVILITIES as readonly string[]).includes(fields.civility as string)) {
    return fail(`civility invalide (valeurs : ${CIVILITIES.join(", ")}).`);
  }
  if (
    fields.preferred_channel != null &&
    !(PREFERRED_CHANNELS as readonly string[]).includes(fields.preferred_channel as string)
  ) {
    return fail(`preferred_channel invalide (valeurs : ${PREFERRED_CHANNELS.join(", ")}).`);
  }
  if (fields.siret != null) {
    const compact = (fields.siret as string).replace(/\s+/g, "");
    if (!/^\d{14}$/.test(compact)) {
      return fail("siret invalide : 14 chiffres attendus.");
    }
    fields.siret = compact;
  }
  if ("country" in fields && fields.country === null) {
    if (mode === "update") return fail("country ne peut pas être vide.");
    delete fields.country; // création : on laisse le défaut (France)
  }

  // --- Date de naissance ---
  if ("birth_date" in input) {
    const value = input.birth_date;
    if (value === null) {
      fields.birth_date = null;
    } else if (typeof value === "string" && isValidIsoDate(value)) {
      fields.birth_date = value;
    } else {
      return fail("birth_date invalide : format AAAA-MM-JJ attendu.");
    }
  }

  // --- Consentements ---
  for (const key of ["consent_email", "consent_sms"] as const) {
    if (!(key in input)) continue;
    if (typeof input[key] !== "boolean") {
      return fail(`${key} doit être un booléen.`);
    }
    fields[key] = input[key] as boolean;
  }

  // --- Coordonnées géographiques (WGS 84) ---
  // Fournies par un consommateur qui géocode lui-même (ex. autocomplétion
  // d'adresse BAN) ; sinon l'API géocode côté serveur quand l'adresse change.
  const COORD_BOUNDS = { address_lat: 90, address_lon: 180 } as const;
  for (const key of ["address_lat", "address_lon"] as const) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === null) {
      fields[key] = null;
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > COORD_BOUNDS[key]) {
      return fail(`${key} invalide : nombre entre -${COORD_BOUNDS[key]} et ${COORD_BOUNDS[key]} attendu.`);
    }
    fields[key] = value;
  }

  // --- Quartier ---
  // `quartier_id` non nul = assignation **manuelle** (protégée du recalcul :
  // quartier_auto passe à false) ; `null` = retour à l'assignation
  // **automatique** d'après les coordonnées (recalcul immédiat par trigger).
  if ("quartier_id" in input) {
    const value = input.quartier_id;
    if (value === null) {
      fields.quartier_id = null;
      fields.quartier_auto = true;
    } else if (typeof value === "string" && isUuid(value)) {
      fields.quartier_id = value;
      fields.quartier_auto = false;
    } else {
      return fail("quartier_id invalide : UUID de quartier, ou null pour l'assignation automatique.");
    }
  }

  // --- Rôles ---
  let roleIds: string[] | undefined;
  if ("role_ids" in input) {
    const value = input.role_ids;
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !isUuid(v))) {
      return fail("role_ids doit être un tableau d'identifiants (UUID) de rôles.");
    }
    roleIds = Array.from(new Set(value as string[]));
  }

  // --- Références externes ---
  let externalRefs: ExternalRefInput[] | undefined;
  if ("external_references" in input) {
    const value = input.external_references;
    if (!Array.isArray(value)) {
      return fail("external_references doit être un tableau de { source, external_id }.");
    }
    const parsed: ExternalRefInput[] = [];
    const seenSources = new Set<string>();
    for (const item of value) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        return fail("Chaque référence externe doit être un objet { source, external_id }.");
      }
      const ref = item as Record<string, unknown>;
      for (const key of Object.keys(ref)) {
        if (key !== "source" && key !== "external_id") {
          return fail(`Champ inconnu dans une référence externe : ${key}.`);
        }
      }
      const source = typeof ref.source === "string" ? ref.source.trim() : "";
      const externalId = typeof ref.external_id === "string" ? ref.external_id.trim() : "";
      if (source === "" || externalId === "") {
        return fail("Chaque référence externe doit avoir source et external_id non vides.");
      }
      if (seenSources.has(source)) {
        return fail(`Références externes en double pour la source « ${source} » (une seule par source).`);
      }
      seenSources.add(source);
      parsed.push({ source, external_id: externalId });
    }
    externalRefs = parsed;
  }

  // --- Relations entre contacts ---
  let relations: RelationInput[] | undefined;
  if ("relations" in input) {
    const value = input.relations;
    if (!Array.isArray(value)) {
      return fail("relations doit être un tableau de { related_contact_id, role_id }.");
    }
    const parsed: RelationInput[] = [];
    const seenPairs = new Set<string>();
    for (const item of value) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        return fail("Chaque relation doit être un objet { related_contact_id, role_id }.");
      }
      const rel = item as Record<string, unknown>;
      for (const key of Object.keys(rel)) {
        if (key !== "related_contact_id" && key !== "role_id") {
          return fail(`Champ inconnu dans une relation : ${key}.`);
        }
      }
      const relatedId = typeof rel.related_contact_id === "string" ? rel.related_contact_id : "";
      const roleId = typeof rel.role_id === "string" ? rel.role_id : "";
      if (!isUuid(relatedId) || !isUuid(roleId)) {
        return fail("Chaque relation doit avoir related_contact_id et role_id (UUID).");
      }
      const pair = `${relatedId}:${roleId}`;
      if (!seenPairs.has(pair)) {
        seenPairs.add(pair);
        parsed.push({ related_contact_id: relatedId, role_id: roleId });
      }
    }
    relations = parsed;
  }

  return { ok: true, value: { fields, roleIds, externalRefs, relations } };
}

/** Sous-ensemble des colonnes concernées par les invariants par type. */
export interface ContactShape {
  contact_type: string;
  civility: string | null;
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  birth_date: string | null;
  legal_name: string | null;
  siret: string | null;
}

const SHAPE_KEYS: ReadonlyArray<keyof ContactShape> = [
  "contact_type",
  "civility",
  "first_name",
  "last_name",
  "usage_name",
  "birth_date",
  "legal_name",
  "siret",
];

/**
 * Fusionne la fiche courante et le patch pour évaluer les invariants sur
 * l'état **résultant** (un PATCH partiel ne connaît pas les autres champs).
 */
export function mergeContactShape(
  current: Record<string, unknown>,
  patch: Record<string, string | boolean | null>,
): ContactShape {
  const merged: Record<string, unknown> = {};
  for (const key of SHAPE_KEYS) {
    merged[key] = key in patch ? patch[key] : (current[key] ?? null);
  }
  return merged as unknown as ContactShape;
}

/**
 * Invariants par type (miroir des contraintes CHECK de la table) : renvoie un
 * message d'erreur français, ou `null` si la fiche est cohérente.
 */
export function contactInvariantError(shape: ContactShape): string | null {
  if (shape.contact_type === "personne") {
    if (shape.civility == null) {
      return "La civilité est obligatoire pour une personne physique.";
    }
    if (shape.legal_name != null) {
      return "La raison sociale est réservée aux entreprises, associations et administrations.";
    }
    if (shape.siret != null) {
      return "Le SIRET est réservé aux entreprises, associations et administrations.";
    }
    return null;
  }
  if (shape.legal_name == null) {
    return "La raison sociale est obligatoire pour une entreprise, association ou administration.";
  }
  if (shape.civility != null) {
    return "La civilité est réservée aux personnes physiques.";
  }
  if (
    shape.first_name != null ||
    shape.last_name != null ||
    shape.usage_name != null ||
    shape.birth_date != null
  ) {
    return "Les champs d'identité (prénom, nom, nom d'usage, date de naissance) sont réservés aux personnes physiques.";
  }
  return null;
}

/**
 * Cohérence des coordonnées sur l'état **fusionné** : les deux, ou aucune —
 * une latitude seule ne peut rattacher aucun quartier et signale une erreur
 * d'intégration chez le consommateur.
 */
export function coordinatesPairError(lat: unknown, lon: unknown): string | null {
  if ((lat == null) !== (lon == null)) {
    return "address_lat et address_lon vont ensemble (fournir les deux, ou les deux à null).";
  }
  return null;
}

/** Bornes de pagination de la liste (défaut 100, maximum 500). */
export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

export type PaginationOutcome =
  | { ok: true; limit: number; offset: number }
  | { ok: false; message: string };

export function parsePagination(limitRaw: string | null, offsetRaw: string | null): PaginationOutcome {
  let limit = DEFAULT_LIMIT;
  let offset = 0;
  if (limitRaw !== null) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return { ok: false, message: `limit invalide (entier entre 1 et ${MAX_LIMIT}).` };
    }
  }
  if (offsetRaw !== null) {
    offset = Number(offsetRaw);
    if (!Number.isInteger(offset) || offset < 0) {
      return { ok: false, message: "offset invalide (entier positif ou nul)." };
    }
  }
  return { ok: true, limit, offset };
}

/** Échappe `%`, `_` et `\` pour un motif `ilike` sûr. */
export function escapeIlikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Numéro de téléphone réduit à ses chiffres significatifs — **miroir exact**
 * de la fonction SQL `normalize_phone` (colonnes générées
 * `mobile_phone_normalized` / `landline_phone_normalized`) : chiffres seuls,
 * indicatif France (`+33` / `0033`) et `0` initial retirés. « +33 6 12 34 56 78 »,
 * « 0033612345678 » et « 06 12 34 56 78 » donnent tous « 612345678 ».
 */
export function normalizePhoneNumber(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("0033")) {
    digits = digits.slice(4);
  } else if (digits.length === 11 && digits.startsWith("33")) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits === "" ? null : digits;
}

/** Bornes du rapprochement d'identités (POST /v1/contacts/match). */
export const MATCH_DEFAULT_LIMIT = 5;
export const MATCH_MAX_LIMIT = 20;
export const MATCH_MAX_PHONES = 10;

/** Motifs de rapprochement possibles (vocabulaire du contrat, documenté OpenAPI). */
export const MATCH_REASONS = [
  "email",
  "phone",
  "siret",
  "name_exact",
  "name_similar",
  "birth_date",
] as const;

/** Identité partielle normalisée, prête pour la RPC `match_contacts`. */
export interface MatchInput {
  contact_type: string | null;
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  legal_name: string | null;
  /** Chiffres seuls (la RPC compare sur les chiffres). */
  siret: string | null;
  birth_date: string | null;
  email: string | null;
  /** Numéros normalisés (chiffres significatifs), dédoublonnés. */
  phones: string[];
  /** `"active"` (défaut) | `"archived"` | `null` = tous les statuts. */
  status: string | null;
  exclude_ids: string[];
  limit: number;
}

export type MatchParseOutcome =
  | { ok: true; value: MatchInput }
  | { ok: false; message: string };

const MATCH_TEXT_FIELDS = [
  "first_name",
  "last_name",
  "usage_name",
  "legal_name",
  "email",
] as const;

const MATCH_ALLOWED_KEYS = new Set<string>([
  "contact_type",
  ...MATCH_TEXT_FIELDS,
  "siret",
  "birth_date",
  "phones",
  "status",
  "exclude_ids",
  "limit",
]);

/**
 * Analyse et normalise le payload de `POST /v1/contacts/match` : identité
 * partielle, tous champs optionnels, mais **au moins un critère exploitable**
 * (email, téléphone, SIRET, nom de famille/d'usage, raison sociale ou date de
 * naissance — un prénom seul ne rapproche rien). Whitelist stricte des clés,
 * comme `parseContactPayload`.
 */
export function parseMatchPayload(body: unknown): MatchParseOutcome {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Le corps de la requête doit être un objet JSON." };
  }
  const input = body as Record<string, unknown>;

  for (const key of Object.keys(input)) {
    if (!MATCH_ALLOWED_KEYS.has(key)) {
      return { ok: false, message: `Champ inconnu : ${key}.` };
    }
  }

  const value: MatchInput = {
    contact_type: null,
    first_name: null,
    last_name: null,
    usage_name: null,
    legal_name: null,
    siret: null,
    birth_date: null,
    email: null,
    phones: [],
    status: "active",
    exclude_ids: [],
    limit: MATCH_DEFAULT_LIMIT,
  };

  if (input.contact_type != null) {
    if (
      typeof input.contact_type !== "string" ||
      !(CONTACT_TYPES as readonly string[]).includes(input.contact_type)
    ) {
      return { ok: false, message: `contact_type invalide (valeurs : ${CONTACT_TYPES.join(", ")}).` };
    }
    value.contact_type = input.contact_type;
  }

  for (const key of MATCH_TEXT_FIELDS) {
    if (!(key in input)) continue;
    const normalized = normalizeText(input[key], key);
    if (!normalized.ok) return { ok: false, message: normalized.message };
    value[key] = normalized.value;
  }

  if (input.siret != null) {
    if (typeof input.siret !== "string") {
      return { ok: false, message: "Le champ siret doit être une chaîne de caractères." };
    }
    value.siret = input.siret.replace(/\D/g, "") || null;
  }

  if (input.birth_date != null) {
    if (typeof input.birth_date !== "string" || !isValidIsoDate(input.birth_date)) {
      return { ok: false, message: "birth_date invalide : format AAAA-MM-JJ attendu." };
    }
    value.birth_date = input.birth_date;
  }

  if (input.phones != null) {
    if (!Array.isArray(input.phones) || input.phones.some((p) => typeof p !== "string")) {
      return { ok: false, message: "phones doit être un tableau de numéros (chaînes, formats libres)." };
    }
    if (input.phones.length > MATCH_MAX_PHONES) {
      return { ok: false, message: `phones : ${MATCH_MAX_PHONES} numéros maximum.` };
    }
    const normalized = (input.phones as string[])
      .map(normalizePhoneNumber)
      .filter((p): p is string => p !== null);
    value.phones = Array.from(new Set(normalized));
  }

  if ("status" in input) {
    const status = input.status;
    if (status === null) {
      value.status = null; // explicite : tous les statuts, archivés compris
    } else if (status === "active" || status === "archived") {
      value.status = status;
    } else {
      return { ok: false, message: "status invalide (active | archived, ou null pour tous)." };
    }
  }

  if (input.exclude_ids != null) {
    const ids = input.exclude_ids;
    if (!Array.isArray(ids) || ids.some((v) => typeof v !== "string" || !isUuid(v))) {
      return { ok: false, message: "exclude_ids doit être un tableau d'identifiants (UUID)." };
    }
    value.exclude_ids = Array.from(new Set(ids as string[]));
  }

  if (input.limit != null) {
    if (
      typeof input.limit !== "number" ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > MATCH_MAX_LIMIT
    ) {
      return { ok: false, message: `limit invalide (entier entre 1 et ${MATCH_MAX_LIMIT}).` };
    }
    value.limit = input.limit;
  }

  const hasCriterion =
    value.email !== null ||
    value.phones.length > 0 ||
    value.siret !== null ||
    value.last_name !== null ||
    value.usage_name !== null ||
    value.legal_name !== null ||
    value.birth_date !== null;
  if (!hasCriterion) {
    return {
      ok: false,
      message:
        "Au moins un critère d'identité est requis : email, phones, siret, last_name, " +
        "usage_name, legal_name ou birth_date (un prénom seul ne suffit pas).",
    };
  }

  return { ok: true, value };
}

// ── Clé plateforme : résolution de la racine d'une organisation ─────────────

/** Ligne minimale d'organisation pour la remontée à la racine. */
export interface OrgParentRow {
  id: string;
  parent_id: string | null;
}

/**
 * Racine (organisation principale) d'une organisation, par remontée des
 * parent_id. Les contacts vivent au niveau racine : c'est elle qui borne le
 * référentiel servi à une clé **plateforme** (`api_keys.organization_id`
 * NULL), l'organisation visée arrivant dans l'en-tête `X-Organization-Id`.
 * Protégé contre les cycles ; null si l'organisation est absente.
 */
export function resolveRootOrgId(rows: OrgParentRow[], orgId: string): string | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let current = byId.get(orgId);
  if (!current) return null;
  const seen = new Set<string>([current.id]);
  while (current.parent_id) {
    const parent = byId.get(current.parent_id);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current.id;
}
