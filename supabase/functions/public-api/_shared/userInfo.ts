/**
 * Informations à destination des usagers — ce que `GET /v1/portal/organizations`
 * sert. Logique pure, testée.
 *
 * ⚠️ **Miroir volontaire** de `src/features/organizations/userInfo.ts` (motif
 * `agentGuidance.ts`) : une edge function ne peut rien importer de `src/`. Les
 * deux lisent le même JSON avec la même tolérance — mêmes clés, questions
 * entièrement vides écartées, jamais un texte tronqué — et les tests des deux
 * côtés l'épinglent.
 *
 * ⚠️ **Whitelist** : seules les quatre rubriques du contrat sortent du JSON
 * stocké, sous leurs noms exacts. Et seuls les organismes que le portail
 * AFFICHE sortent de la liste : ni service interne, ni organisation obsolète,
 * ni organisme qui n'a rien écrit.
 */
import type { DayOpeningHoursDto, PortalOrganizationInfoDto, UserInfoBody } from "./dto.ts";

type Row = Record<string, unknown>;

function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function objects(raw: unknown): Row[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

/** Miroir de `WEEKDAYS` : jours de la semaine, dans l'ordre de lecture. */
export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
type Weekday = (typeof WEEKDAYS)[number];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

/** Borne de pause stockée : absente (`null`), une heure, ou `undefined` si illisible. */
function readPauseBound(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return isTime(value) ? value : undefined;
}

/**
 * Miroir de `parseOpeningHours` : un jour inconnu, en double ou incohérent
 * (ouverture ou fermeture manquante, pause à moitié, heures dans le désordre)
 * est ÉCARTÉ, jamais réparé. Toujours dans l'ordre de la semaine.
 */
export function parseOpeningHours(raw: unknown): DayOpeningHoursDto[] {
  const byDay = new Map<Weekday, DayOpeningHoursDto>();
  for (const item of objects(raw)) {
    const day = item.day as Weekday;
    if (!WEEKDAYS.includes(day) || byDay.has(day)) continue;
    const morningClose = readPauseBound(item.morningClose);
    const afternoonOpen = readPauseBound(item.afternoonOpen);
    if (morningClose === undefined || afternoonOpen === undefined) continue;
    if ((morningClose === null) !== (afternoonOpen === null)) continue;
    if (!isTime(item.morningOpen) || !isTime(item.afternoonClose)) continue;
    const sequence = morningClose !== null
      ? [item.morningOpen, morningClose, afternoonOpen as string, item.afternoonClose]
      : [item.morningOpen, item.afternoonClose];
    if (sequence.some((time, i) => i > 0 && time <= sequence[i - 1])) continue;
    byDay.set(day, {
      day,
      morningOpen: item.morningOpen,
      morningClose,
      afternoonOpen,
      afternoonClose: item.afternoonClose,
    });
  }
  return WEEKDAYS.filter((day) => byDay.has(day)).map((day) => byDay.get(day)!);
}

/** Miroir de `parseUserInfo` (et, pour la FAQ, de `parseFaq`). */
export function parseUserInfo(raw: unknown): UserInfoBody {
  const stored: Row = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Row) : {};
  return {
    description: coerceString(stored.description),
    openingHours: parseOpeningHours(stored.openingHours),
    openingHoursNotes: coerceString(stored.openingHoursNotes),
    faq: objects(stored.faq)
      .map((item) => ({ question: coerceString(item.question), answer: coerceString(item.answer) }))
      .filter((item) => item.question.trim() !== "" || item.answer.trim() !== ""),
  };
}

/** Rien d'écrit ? Des blancs ne sont pas un texte. */
export function isUserInfoEmpty(info: UserInfoBody): boolean {
  return (
    info.description.trim() === "" &&
    info.openingHours.length === 0 &&
    info.openingHoursNotes.trim() === "" &&
    info.faq.length === 0
  );
}

/** Organisation de l'arbre du tenant, telle que la route la lit. */
export interface UserInfoOrganization {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  status: string | null;
  is_internal_service: boolean | null;
  phone: string | null;
  email: string | null;
}

/** Coordonnée de la fiche : du texte non vide, ou `null`. */
function contact(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Organismes du portail et leurs informations usagers. Ne sort qu'un organisme
 * **affiché** (actif, pas service interne) qui a **écrit** quelque chose ou qui
 * a un **téléphone ou un courriel** sur sa fiche (1.31.0). Le
 * tenant en tête, puis les autres par nom : c'est l'ordre dans lequel un
 * usager (ou un assistant) les lit.
 */
export function serializePortalOrganizationsInfo(
  tenantId: string,
  organizations: UserInfoOrganization[],
  rows: Array<{ organization_id: unknown; info: unknown; updated_at: unknown }>,
): PortalOrganizationInfoDto[] {
  const byOrg = new Map(rows.map((row) => [String(row.organization_id), row]));
  const out: PortalOrganizationInfoDto[] = [];
  for (const org of organizations) {
    if (org.status !== "active" || org.is_internal_service === true) continue;
    const row = byOrg.get(org.id);
    const info = parseUserInfo(row?.info);
    const phone = contact(org.phone);
    const email = contact(org.email);
    if (isUserInfoEmpty(info) && phone === null && email === null) continue;
    out.push({
      id: org.id,
      name: org.name,
      slug: typeof org.slug === "string" && org.slug !== "" ? org.slug : null,
      is_tenant: org.id === tenantId,
      phone,
      email,
      updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
      info,
    });
  }
  return out.sort((a, b) =>
    a.is_tenant !== b.is_tenant ? (a.is_tenant ? -1 : 1) : a.name.localeCompare(b.name, "fr"),
  );
}
