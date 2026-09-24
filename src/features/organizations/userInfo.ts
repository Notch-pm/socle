/**
 * Informations à destination des usagers — ce qu'un ORGANISME dit au public :
 * un descriptif, ses horaires d'accueil, une FAQ. Logique pure (aucune
 * dépendance React/Supabase), consommée par `UserInfoSection` et persistée dans
 * `organization_user_info.info`, sur n'importe quelle organisation.
 *
 * Schéma **possédé**, contrat public consommé en aval
 * (`GET /v1/portal/organizations`) : le site de démarches (Nora) le montre, et
 * son assistant conversationnel s'en sert pour répondre — « à quelle heure
 * ouvre la mairie ? » trouve sa réponse ici.
 *
 * ⚠️ **PUBLIC, tout entier.** C'est le pendant usager des recommandations aux
 * agents (`agentGuidance.ts`, interne) : rien de ce qui sert à instruire n'y
 * entre, et les deux ne se fusionnent jamais.
 *
 * ⚠️ **Pas d'héritage** : un organisme qui n'a rien écrit n'affiche rien — il
 * n'emprunte pas les horaires de son parent, qui ne sont pas les siens.
 */
import { parseFaq, type FaqItem } from "@/features/procedures/knowledgeBase";

/** Jours de la semaine, dans l'ordre de lecture — contrat de nommage. */
export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

/**
 * Horaires d'un jour d'ouverture, en `HH:MM` (24 h, heure locale de
 * l'organisme). L'ouverture du matin et la fermeture de l'après-midi sont
 * obligatoires ; la pause de midi (fin de matinée → début d'après-midi) est
 * facultative, mais va **par paire** : sans elle, l'accueil est continu.
 * Les heures sont **strictement croissantes**.
 */
export interface DayOpeningHours {
  day: Weekday;
  /** Ouverture (matin). Obligatoire. */
  morningOpen: string;
  /** Fin de matinée — début de la pause. `null` = accueil continu. */
  morningClose: string | null;
  /** Début d'après-midi — fin de la pause. `null` = accueil continu. */
  afternoonOpen: string | null;
  /** Fermeture (fin d'après-midi). Obligatoire. */
  afternoonClose: string;
}

export interface OrganizationUserInfo {
  /** Présentation de l'organisme à l'usager (Markdown). */
  description: string;
  /**
   * Jours d'ouverture, dans l'ordre de la semaine, un au plus par jour. Un jour
   * absent est un jour **fermé** ; une liste vide = horaires non renseignés.
   */
  openingHours: DayOpeningHours[];
  /**
   * Remarques sur les horaires (Markdown) : fermetures exceptionnelles, jours
   * fériés, horaires d'été, permanences… — ce que la grille ne sait pas dire.
   */
  openingHoursNotes: string;
  /** FAQ usager de l'organisme — distincte de la FAQ usager de chaque démarche. */
  faq: FaqItem[];
}

/**
 * Bornes de saisie : de quoi tout dire sans faire d'une fiche un site. Elles
 * comptent aussi pour l'assistant du portail, qui lit tous les organismes à la
 * fois. La base porte un garde-fou plus large sur la ligne entière.
 */
export const MAX_USER_INFO_DESCRIPTION_LENGTH = 5_000;
export const MAX_USER_INFO_HOURS_NOTES_LENGTH = 2_000;
export const MAX_USER_INFO_FAQ = 30;

/** Informations vierges. */
export function defaultUserInfo(): OrganizationUserInfo {
  return { description: "", openingHours: [], openingHoursNotes: "", faq: [] };
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `HH:MM` valide (00:00 → 23:59) ? */
export function isTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

/**
 * Pourquoi ce jour n'est pas enregistrable — ou `null` s'il l'est. Les messages
 * s'affichent tels quels sous la ligne du jour.
 */
export function dayHoursError(hours: Omit<DayOpeningHours, "day">): string | null {
  if (!isTime(hours.morningOpen)) return "L'heure d'ouverture du matin est obligatoire.";
  if (!isTime(hours.afternoonClose)) return "L'heure de fermeture de l'après-midi est obligatoire.";
  const hasClose = hours.morningClose !== null && hours.morningClose !== "";
  const hasOpen = hours.afternoonOpen !== null && hours.afternoonOpen !== "";
  if (hasClose !== hasOpen) {
    return "La pause de midi se renseigne en entier : fin de matinée et début d'après-midi.";
  }
  if (hasClose && (!isTime(hours.morningClose) || !isTime(hours.afternoonOpen))) {
    return "Heure invalide (format HH:MM).";
  }
  const sequence = hasClose
    ? [hours.morningOpen, hours.morningClose!, hours.afternoonOpen!, hours.afternoonClose]
    : [hours.morningOpen, hours.afternoonClose];
  // `HH:MM` à deux chiffres : l'ordre lexical est l'ordre chronologique.
  for (let i = 1; i < sequence.length; i++) {
    if (sequence[i] <= sequence[i - 1]) return "Les heures doivent se suivre dans la journée.";
  }
  return null;
}

/** Borne de pause stockée : absente (`null`), une heure, ou `undefined` si illisible. */
function readPauseBound(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return isTime(value) ? value : undefined;
}

/**
 * Lecture tolérante des horaires :un jour inconnu, en double ou incohérent est
 * **écarté**, jamais « réparé » — deviner une heure d'ouverture serait pire que
 * ne rien dire. Toujours dans l'ordre de la semaine.
 */
export function parseOpeningHours(raw: unknown): DayOpeningHours[] {
  if (!Array.isArray(raw)) return [];
  const byDay = new Map<Weekday, DayOpeningHours>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const stored = item as Record<string, unknown>;
    const day = stored.day as Weekday;
    if (!WEEKDAYS.includes(day) || byDay.has(day)) continue;
    const pauseStart = readPauseBound(stored.morningClose);
    const pauseEnd = readPauseBound(stored.afternoonOpen);
    // Une borne de pause illisible ne s'efface pas : le jour entier est écarté.
    if (pauseStart === undefined || pauseEnd === undefined) continue;
    const entry: DayOpeningHours = {
      day,
      morningOpen: coerceString(stored.morningOpen),
      morningClose: pauseStart,
      afternoonOpen: pauseEnd,
      afternoonClose: coerceString(stored.afternoonClose),
    };
    // Pause à moitié renseignée, heures dans le désordre… : écarté aussi.
    if (dayHoursError(entry) !== null) continue;
    byDay.set(day, entry);
  }
  return WEEKDAYS.filter((day) => byDay.has(day)).map((day) => byDay.get(day)!);
}

/**
 * Lecture tolérante d'un JSON stocké : ignore l'inconnu, corrige les types,
 * complète les champs manquants, écarte les questions entièrement vides et les
 * jours incohérents. Toujours une structure complète en sortie — et jamais un
 * texte tronqué.
 *
 * ⚠️ Miroir de `supabase/functions/public-api/_shared/userInfo.ts` (une edge
 * function n'importe rien de `src/`) : mêmes clés, mêmes règles, testés des
 * deux côtés.
 */
export function parseUserInfo(raw: unknown): OrganizationUserInfo {
  const info = defaultUserInfo();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return info;
  const stored = raw as Record<string, unknown>;
  info.description = coerceString(stored.description);
  info.openingHours = parseOpeningHours(stored.openingHours);
  info.openingHoursNotes = coerceString(stored.openingHoursNotes);
  info.faq = parseFaq(stored.faq);
  return info;
}

/**
 * L'onglet « Informations usagers » existe-t-il pour cette organisation ? Pas
 * sur un service interne : le portail ne l'affiche pas, et la route ne le sert
 * pas — ce qu'on y écrirait ne serait lu par personne.
 */
export function hasUserInfoTab(organization: { is_internal_service: boolean | null }): boolean {
  return organization.is_internal_service !== true;
}

/** Normalise avant persistance : mêmes règles que la lecture. */
export function cleanUserInfo(info: OrganizationUserInfo): OrganizationUserInfo {
  return parseUserInfo(info);
}

/** Rien d'écrit ? Des blancs ne sont pas un texte. */
export function isUserInfoEmpty(info: OrganizationUserInfo): boolean {
  return (
    info.description.trim() === "" &&
    info.openingHours.length === 0 &&
    info.openingHoursNotes.trim() === "" &&
    info.faq.length === 0
  );
}

/**
 * Ligne de saisie d'un jour : l'écran garde des cases vides tant qu'on tape,
 * le contrat n'en connaît pas. `open = false` = jour fermé.
 */
export interface DayHoursDraft {
  day: Weekday;
  open: boolean;
  morningOpen: string;
  morningClose: string;
  afternoonOpen: string;
  afternoonClose: string;
}

/** Contrat → sept lignes de saisie (les jours absents sont fermés). */
export function toDayDrafts(hours: DayOpeningHours[]): DayHoursDraft[] {
  return WEEKDAYS.map((day) => {
    const stored = hours.find((entry) => entry.day === day);
    return {
      day,
      open: Boolean(stored),
      morningOpen: stored?.morningOpen ?? "",
      morningClose: stored?.morningClose ?? "",
      afternoonOpen: stored?.afternoonOpen ?? "",
      afternoonClose: stored?.afternoonClose ?? "",
    };
  });
}

/** Erreur de chaque ligne ouverte, par jour ; vide = tout est enregistrable. */
export function dayDraftErrors(drafts: DayHoursDraft[]): Partial<Record<Weekday, string>> {
  const errors: Partial<Record<Weekday, string>> = {};
  for (const draft of drafts) {
    if (!draft.open) continue;
    const error = dayHoursError(draft);
    if (error) errors[draft.day] = error;
  }
  return errors;
}

/** Lignes de saisie → contrat : seuls les jours ouverts, pause vide = `null`. */
export function fromDayDrafts(drafts: DayHoursDraft[]): DayOpeningHours[] {
  return drafts
    .filter((draft) => draft.open)
    .map((draft) => ({
      day: draft.day,
      morningOpen: draft.morningOpen,
      morningClose: draft.morningClose || null,
      afternoonOpen: draft.afternoonOpen || null,
      afternoonClose: draft.afternoonClose,
    }));
}
