/**
 * Ce qu'`audience-api` accepte — logique pure, sans dépendance Deno, donc
 * testée par vitest et déployée avec la fonction.
 *
 * ⚠️ WHITELIST STRICTE DES CLÉS, motif `contacts-api` : une clé inconnue est un
 * **400**, pas un champ ignoré. Cette API ne stocke rien d'autre que des
 * compteurs ; le jour où un appelant enverrait `visitor_id` ou `ip`, il doit
 * l'apprendre par un refus, pas par un silence qui laisserait croire que c'est
 * enregistré quelque part.
 *
 * ⚠️ CE QUE LE CORPS NE PORTE PAS, ET NE PORTERA PAS : aucun identifiant de
 * personne, aucune adresse, aucun User-Agent, aucun référent. `entry` est un
 * booléen — l'appelant a déjà décidé, dans le navigateur, si c'était une
 * arrivée ; ce que le Socle reçoit est un oui/non, jamais le référent qui l'a
 * produit. `device` est l'une de trois valeurs, jamais la chaîne qui l'a
 * donnée. Voir l'en-tête de la migration `portal_audience`.
 */

/** Les trois écrans du portail qui se comptent. */
export const PAGES = ["accueil", "demarche", "formulaire"] as const;
export type Page = (typeof PAGES)[number];

/** Les trois classes d'appareil — dérivées côté appelant, jamais le User-Agent. */
export const DEVICES = ["mobile", "tablette", "ordinateur"] as const;
export type Device = (typeof DEVICES)[number];

/** Même expression que `is_valid_language_set` en base : un code BCP 47. */
export const LANGUAGE_CODE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export interface PageViewPayload {
  tenantId: string;
  page: Page;
  procedureId: string | null;
  entry: boolean;
  lang: string | null;
  device: Device | null;
}

export interface DepositPayload {
  tenantId: string;
  procedureId: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Refuse toute clé hors de la liste — voir l'en-tête. */
function unknownKey(raw: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) return key;
  }
  return null;
}

const PAGE_VIEW_KEYS = ["tenant_id", "page", "procedure_id", "entry", "lang", "device"] as const;

export function parsePageViewPayload(raw: unknown): ParseResult<PageViewPayload> {
  if (!isRecord(raw)) {
    return { ok: false, message: "Corps JSON attendu." };
  }
  const extra = unknownKey(raw, PAGE_VIEW_KEYS);
  if (extra !== null) {
    return { ok: false, message: `Clé inconnue « ${extra} » : cette API ne reçoit que des compteurs.` };
  }

  if (!isUuid(raw.tenant_id)) {
    return { ok: false, message: "tenant_id : uuid de l'organisme du domaine attendu." };
  }
  const page = typeof raw.page === "string" ? raw.page.trim() : "";
  if (!(PAGES as readonly string[]).includes(page)) {
    return { ok: false, message: `page : l'une de ${PAGES.join(", ")}.` };
  }

  // ⚠️ La démarche est exigée SI ET SEULEMENT SI la page n'est pas l'accueil —
  // la même règle qu'en base (`portal_audience_pages_procedure_check`). Écrite
  // ici aussi pour que l'appelant l'apprenne par un 400 explicite plutôt que
  // par un `recorded: false` muet.
  const hasProcedure = raw.procedure_id !== undefined && raw.procedure_id !== null;
  if (page === "accueil") {
    if (hasProcedure) {
      return { ok: false, message: "procedure_id : l'accueil ne porte pas de démarche." };
    }
  } else if (!hasProcedure) {
    return { ok: false, message: `procedure_id : requis pour la page « ${page} ».` };
  }
  if (hasProcedure && !isUuid(raw.procedure_id)) {
    return { ok: false, message: "procedure_id : uuid attendu." };
  }

  if (raw.entry !== undefined && typeof raw.entry !== "boolean") {
    return { ok: false, message: "entry : booléen attendu." };
  }

  // Langue et appareil sont FACULTATIFS : une ventilation manquante ampute un
  // camembert, elle ne doit jamais faire perdre la vue de page elle-même.
  let lang: string | null = null;
  if (raw.lang !== undefined && raw.lang !== null) {
    if (typeof raw.lang !== "string" || !LANGUAGE_CODE_RE.test(raw.lang.trim().toLowerCase())) {
      return { ok: false, message: "lang : code de langue BCP 47 attendu (ex. « fr », « oc »)." };
    }
    lang = raw.lang.trim().toLowerCase();
  }

  let device: Device | null = null;
  if (raw.device !== undefined && raw.device !== null) {
    const candidate = typeof raw.device === "string" ? raw.device.trim() : "";
    if (!(DEVICES as readonly string[]).includes(candidate)) {
      return { ok: false, message: `device : l'une de ${DEVICES.join(", ")}.` };
    }
    device = candidate as Device;
  }

  return {
    ok: true,
    value: {
      tenantId: String(raw.tenant_id).trim(),
      page: page as Page,
      procedureId: hasProcedure ? String(raw.procedure_id).trim() : null,
      entry: raw.entry === true,
      lang,
      device,
    },
  };
}

const DEPOSIT_KEYS = ["tenant_id", "procedure_id"] as const;

export function parseDepositPayload(raw: unknown): ParseResult<DepositPayload> {
  if (!isRecord(raw)) {
    return { ok: false, message: "Corps JSON attendu." };
  }
  const extra = unknownKey(raw, DEPOSIT_KEYS);
  if (extra !== null) {
    return { ok: false, message: `Clé inconnue « ${extra} » : cette API ne reçoit que des compteurs.` };
  }
  if (!isUuid(raw.tenant_id)) {
    return { ok: false, message: "tenant_id : uuid de l'organisme du domaine attendu." };
  }
  if (!isUuid(raw.procedure_id)) {
    return { ok: false, message: "procedure_id : uuid de la démarche déposée attendu." };
  }
  return {
    ok: true,
    value: {
      tenantId: String(raw.tenant_id).trim(),
      procedureId: String(raw.procedure_id).trim(),
    },
  };
}

/**
 * ⚠️ PAS DE `resolveRootOrgId` ICI, contrairement à `contacts-api` et `ai-api`,
 * et l'absence est le point : ces deux-là remontent à la RACINE parce que leur
 * objet (un référentiel d'usagers, un budget) appartient à la collectivité
 * entière. La fréquentation, elle, se compte sur l'organisme DU DOMAINE — une
 * sous-organisation qui tient son guichet a son propre trafic. Le périmètre
 * (`org_subtree_ids` / `application_scope_ids`) porte déjà tout le sous-arbre :
 * une simple appartenance suffit, et remonter perdrait précisément ce qui
 * distingue les guichets les uns des autres.
 */
