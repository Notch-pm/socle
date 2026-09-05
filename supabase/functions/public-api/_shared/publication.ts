/**
 * Publication d'une démarche sur le portail usagers — lecture du contrat
 * `communication_config`, logique pure.
 *
 * ⚠️ **Miroir volontaire** de `src/features/procedures/communication.ts` (même
 * motif que `readDocumentIds` dans `serializers.ts`) : le code d'une edge
 * function est déployé séparément et ne peut rien importer de `src/`. Les deux
 * doivent rester d'accord ; les tests des deux côtés les épinglent.
 *
 * Le Socle décide DEUX choses distinctes, à ne jamais confondre :
 *   - `status` : le PARAMÉTRAGE est-il fini ? `brouillon` = en cours
 *     d'écriture, `production` = déclarée prête. Une démarche en brouillon
 *     n'est proposée nulle part, quelle que soit sa visibilité.
 *   - `communication_config.visibility` : OÙ et QUAND proposer une démarche
 *     déjà prête (portail usagers, période de publication).
 *
 * Deux règles du contrat sont appliquées ici, une fois pour toutes :
 *   1. `communication_config` absent ou `null` = « jamais paramétrée » et se lit
 *      comme les valeurs par DÉFAUT : visible sur le portail, publication non
 *      bornée. Surtout pas « invisible ».
 *   2. les dates sont CONSERVÉES quand `publicationPeriodEnabled` est faux (« le
 *      commutateur gouverne l'usage, pas la donnée ») : dans ce cas elles ne
 *      s'appliquent pas, la fenêtre EFFECTIVE est donc vide.
 */

/** Publication effective : où, et entre quelles bornes (incluses, AAAA-MM-JJ). */
export interface ProcedurePublication {
  /** La démarche est proposée aux usagers sur le portail en ligne. */
  portalVisible: boolean;
  /** Premier jour de publication (inclus), `null` si pas de borne. */
  publicationStart: string | null;
  /** Dernier jour de publication (inclus), `null` si pas de borne. */
  publicationEnd: string | null;
}

/** Valeurs par défaut du contrat : proposée sur le portail, sans période. */
export const DEFAULT_PUBLICATION: ProcedurePublication = {
  portalVisible: true,
  publicationStart: null,
  publicationEnd: null,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(raw: unknown): string | null {
  return typeof raw === "string" && ISO_DATE.test(raw) ? raw : null;
}

/**
 * Publication effective depuis le `communication_config` brut.
 * Tolérante aux blocs inconnus (ignorés) et aux types inattendus.
 */
export function parsePublication(communicationConfig: unknown): ProcedurePublication {
  if (typeof communicationConfig !== "object" || communicationConfig === null) {
    return { ...DEFAULT_PUBLICATION };
  }
  const visibility = (communicationConfig as Record<string, unknown>).visibility;
  if (typeof visibility !== "object" || visibility === null) {
    return { ...DEFAULT_PUBLICATION };
  }
  const v = visibility as Record<string, unknown>;
  const periodEnabled = v.publicationPeriodEnabled === true;
  return {
    // Seul `false` explicite retire la démarche du portail : une clé absente
    // reste la valeur par défaut du contrat.
    portalVisible: v.portalVisible !== false,
    publicationStart: periodEnabled ? parseDate(v.publicationStart) : null,
    publicationEnd: periodEnabled ? parseDate(v.publicationEnd) : null,
  };
}

/**
 * Fuseau des collectivités servies. La fonction tourne en UTC : sans lui, entre
 * minuit et 2 h du matin heure française, une période qui s'ouvre AUJOURD'HUI
 * serait encore jugée à venir — et la démarche resterait invisible sur le
 * portail le jour même de sa publication.
 */
export const FRANCE_TIME_ZONE = "Europe/Paris";

/** Jour civil « AAAA-MM-JJ » dans le fuseau demandé. */
export function isoDay(date: Date, timeZone: string = FRANCE_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/**
 * La démarche est-elle dans sa période de publication le jour `day` ?
 *
 * Les deux bornes sont **incluses** et indépendantes : une borne absente ne
 * borne rien. Une démarche sans période est donc publiée tous les jours — c'est
 * le cas ordinaire, et le défaut du contrat.
 *
 * La comparaison est TEXTUELLE : sur « AAAA-MM-JJ », l'ordre lexicographique
 * EST l'ordre chronologique. Passer par `new Date(...)` n'apporterait qu'un
 * décalage de fuseau (« 2027-01-01 » y vaut minuit UTC).
 */
export function isPublishedOn(publication: ProcedurePublication, day: string): boolean {
  const { publicationStart: start, publicationEnd: end } = publication;
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

/**
 * La démarche est-elle proposée au public, ce jour-là, sur le portail usagers ?
 * C'est la définition COMPLÈTE de « publiée », et le seul point où elle
 * s'écrit : paramétrage fini, destinée au public, visible sur le portail, dans
 * sa période.
 *
 * `type` : `interne` = instruite par les agents sans guichet en ligne. Le
 * portail n'a rien à en montrer.
 */
export function isPubliclyPublished(row: Record<string, unknown>, day: string): boolean {
  if (row.status !== "production") return false;
  if (row.type !== "externe") return false;
  const publication = parsePublication(row.communication_config);
  return publication.portalVisible && isPublishedOn(publication, day);
}
