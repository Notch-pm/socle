/**
 * La fiche d'un usager vue par SON compte du portail (scope `citizen`,
 * contacts-api 1.4.0) — logique pure, testée.
 *
 * Le scope `contacts` sert le référentiel entier aux applications des agents ;
 * celui-ci ne sert qu'UNE fiche, désignée par l'identifiant du compte (la
 * référence externe `portail_citoyen`), et seulement ce que l'usager peut lire
 * de lui-même : son identité, ses coordonnées, ses consentements. Jamais les
 * notes internes, les rôles, les relations, le quartier ni les références
 * d'autres applications.
 *
 * L'usager modifie ses COORDONNÉES (téléphones, adresse, nom d'usage). Son nom
 * de naissance, ses prénoms, sa date de naissance et sa civilité sont figés
 * une fois la fiche rattachée — ils fondent le rattachement — ; son adresse de
 * courriel suit celle de son compte. Une correction passe par la collectivité.
 */
import { CIVILITIES, normalizePhoneNumber } from "./validation.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export const CITIZEN_CONTACT_SELECT =
  "id, civility, first_name, last_name, usage_name, birth_date, email, mobile_phone, landline_phone, " +
  "address_line1, address_line2, postal_code, city, country, consent_traitement, consent_traitement_at, " +
  "consent_partage, consent_partage_at, status";

export interface CitizenContactDto {
  id: string;
  civility: string | null;
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  birth_date: string | null;
  email: string | null;
  mobile_phone: string | null;
  landline_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  consent_traitement: boolean | null;
  consent_traitement_at: string | null;
  consent_partage: boolean | null;
  consent_partage_at: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function serializeCitizenContact(row: Row): CitizenContactDto {
  return {
    id: String(row.id),
    civility: str(row.civility),
    first_name: str(row.first_name),
    last_name: str(row.last_name),
    usage_name: str(row.usage_name),
    birth_date: str(row.birth_date),
    email: str(row.email),
    mobile_phone: str(row.mobile_phone),
    landline_phone: str(row.landline_phone),
    address_line1: str(row.address_line1),
    address_line2: str(row.address_line2),
    postal_code: str(row.postal_code),
    city: str(row.city),
    country: str(row.country),
    consent_traitement: typeof row.consent_traitement === "boolean" ? row.consent_traitement : null,
    consent_traitement_at: str(row.consent_traitement_at),
    consent_partage: typeof row.consent_partage === "boolean" ? row.consent_partage : null,
    consent_partage_at: str(row.consent_partage_at),
  };
}

export type CitizenParse<T> = { ok: true; value: T } | { ok: false; message: string };

const MAX_TEXT = 200;

function text(body: Record<string, unknown>, key: string, required: boolean): CitizenParse<string | null> {
  const v = body[key];
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    return required ? { ok: false, message: `${key} : requis.` } : { ok: true, value: null };
  }
  if (typeof v !== "string" || v.trim().length > MAX_TEXT) return { ok: false, message: `${key} : texte attendu (${MAX_TEXT} caractères au plus).` };
  return { ok: true, value: v.trim() };
}

function phone(body: Record<string, unknown>, key: string): CitizenParse<string | null> {
  const t = text(body, key, false);
  if (!t.ok || t.value === null) return t;
  const digits = normalizePhoneNumber(t.value);
  return digits !== null && digits.length >= 6 && digits.length <= 15
    ? t
    : { ok: false, message: `${key} : numéro de téléphone invalide.` };
}

const EDITABLE_KEYS = ["usage_name", "mobile_phone", "landline_phone", "address_line1", "address_line2", "postal_code", "city"] as const;
const IDENTITY_KEYS = ["civility", "first_name", "last_name", "birth_date", "email", ...EDITABLE_KEYS] as const;

/**
 * L'identité déclarée à la création de l'espace (CCTP Sceaux 5.1) : civilité,
 * nom, prénom, adresse, code postal, ville obligatoires ; l'adresse de courriel
 * est celle du COMPTE, vérifiée par Nora. Toute autre clé est refusée.
 */
export function parseCitizenIdentity(body: unknown): CitizenParse<Record<string, string | null>> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, message: "Objet JSON attendu." };
  const input = body as Record<string, unknown>;
  const unknown = Object.keys(input).filter((k) => !(IDENTITY_KEYS as readonly string[]).includes(k));
  if (unknown.length > 0) return { ok: false, message: `Champ inconnu : ${unknown.join(", ")}.` };

  const out: Record<string, string | null> = {};
  if (typeof input.civility !== "string" || !(CIVILITIES as readonly string[]).includes(input.civility)) {
    return { ok: false, message: "civility : « madame » ou « monsieur »." };
  }
  out.civility = input.civility;
  for (const [key, required] of [
    ["first_name", true],
    ["last_name", true],
    ["usage_name", false],
    ["email", true],
    ["address_line1", true],
    ["address_line2", false],
    ["postal_code", true],
    ["city", true],
  ] as const) {
    const t = text(input, key, required);
    if (!t.ok) return t;
    out[key] = t.value;
  }
  if (!/^[^\s@<>,;"()]+@[^\s@<>,;"()]+\.[^\s@<>,;"()]+$/.test(out.email ?? "")) {
    return { ok: false, message: "email : adresse invalide." };
  }
  out.email = (out.email ?? "").toLowerCase();
  if (!/^[0-9]{5}$/.test(out.postal_code ?? "")) return { ok: false, message: "postal_code : 5 chiffres." };
  for (const key of ["mobile_phone", "landline_phone"] as const) {
    const p = phone(input, key);
    if (!p.ok) return p;
    out[key] = p.value;
  }
  const birth = text(input, "birth_date", false);
  if (!birth.ok) return birth;
  if (birth.value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(birth.value)) {
    return { ok: false, message: "birth_date : date AAAA-MM-JJ." };
  }
  out.birth_date = birth.value;
  return { ok: true, value: out };
}

/** Ce que l'usager modifie lui-même : ses coordonnées et son nom d'usage. */
export function parseCitizenUpdate(body: unknown): CitizenParse<Record<string, string | null>> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, message: "Objet JSON attendu." };
  const input = body as Record<string, unknown>;
  const unknown = Object.keys(input).filter((k) => !(EDITABLE_KEYS as readonly string[]).includes(k));
  if (unknown.length > 0) {
    return { ok: false, message: `Champ non modifiable ici : ${unknown.join(", ")}. Une correction d'identité passe par la collectivité.` };
  }
  const out: Record<string, string | null> = {};
  for (const key of EDITABLE_KEYS) {
    if (!(key in input)) continue;
    const required = key === "address_line1" || key === "postal_code" || key === "city";
    const parsed = key === "mobile_phone" || key === "landline_phone" ? phone(input, key) : text(input, key, required);
    if (!parsed.ok) return parsed;
    out[key] = parsed.value;
  }
  if ("postal_code" in out && !/^[0-9]{5}$/.test(out.postal_code ?? "")) return { ok: false, message: "postal_code : 5 chiffres." };
  if (Object.keys(out).length === 0) return { ok: false, message: "Aucun champ à modifier." };
  return { ok: true, value: out };
}
