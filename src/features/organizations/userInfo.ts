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

export interface OrganizationUserInfo {
  /** Présentation de l'organisme à l'usager (Markdown). */
  description: string;
  /** Horaires d'accueil, décrits librement : jours, plages, fermetures (Markdown). */
  openingHours: string;
  /** FAQ usager de l'organisme — distincte de la FAQ usager de chaque démarche. */
  faq: FaqItem[];
}

/**
 * Bornes de saisie : de quoi tout dire sans faire d'une fiche un site. Elles
 * comptent aussi pour l'assistant du portail, qui lit tous les organismes à la
 * fois. La base porte un garde-fou plus large sur la ligne entière.
 */
export const MAX_USER_INFO_DESCRIPTION_LENGTH = 5_000;
export const MAX_USER_INFO_HOURS_LENGTH = 2_000;
export const MAX_USER_INFO_FAQ = 30;

/** Informations vierges. */
export function defaultUserInfo(): OrganizationUserInfo {
  return { description: "", openingHours: "", faq: [] };
}

function coerceString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Lecture tolérante d'un JSON stocké : ignore l'inconnu, corrige les types,
 * complète les champs manquants, écarte les questions entièrement vides.
 * Toujours une structure complète en sortie — et jamais un texte tronqué.
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
  info.openingHours = coerceString(stored.openingHours);
  info.faq = parseFaq(stored.faq);
  return info;
}

/** Normalise avant persistance : mêmes règles que la lecture. */
export function cleanUserInfo(info: OrganizationUserInfo): OrganizationUserInfo {
  return parseUserInfo(info);
}

/** Rien d'écrit ? Des blancs ne sont pas un texte. */
export function isUserInfoEmpty(info: OrganizationUserInfo): boolean {
  return info.description.trim() === "" && info.openingHours.trim() === "" && info.faq.length === 0;
}
