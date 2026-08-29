/**
 * Mise en forme du plafond IA — la part qui se regarde.
 *
 * Pourquoi ici et non dans `supabase/functions/ai-api/_shared/` : le front du
 * Socle n'a pas d'alias vers les edge functions (seul `@` → `src` existe), et
 * ce module ne sert qu'à l'écran. Les APPLICATIONS consommatrices, elles,
 * n'ont rien à recalculer : `GET /v1/usage` leur renvoie déjà `period` et
 * `renews_at` composés par le Socle — c'était tout l'objet de la
 * centralisation, supprimer un jumeau plutôt qu'en créer un.
 *
 * Module PUR (aucune dépendance React ni Supabase), testé.
 */

export type QuotaTone = "ok" | "warn" | "critical";

export interface QuotaInput {
  /** `null` = aucun plafond configuré ⇒ consommation illimitée. */
  limit: number | null;
  used: number;
  reserved: number;
}

export interface QuotaView {
  unlimited: boolean;
  limit: number | null;
  used: number;
  reserved: number;
  /** Consommé + réservé : ce qui est réellement engagé sur le mois. */
  engaged: number;
  remaining: number | null;
  /** 0 à 100, borné — un dépassement ne fait pas déborder la jauge. */
  percent: number;
  tone: QuotaTone;
}

/** Seuil d'alerte : au-delà, la jauge change de ton. */
const WARN_AT = 80;

/**
 * ⚠️ Le RATIO est la vérité ; `percent` n'est qu'un affichage (arrondi et
 * borné). Le ton se décide donc sur le ratio, jamais sur `percent` — sinon
 * 799/1000 (79,9 %) s'arrondirait à 80 et déclencherait une alerte que
 * l'engagé réel ne justifie pas, et un dépassement à 150 % serait ramené à
 * 100 puis lu comme un simple avertissement.
 *
 * `reserved` compte dans l'engagé : un appel en cours a déjà mordu sur le
 * plafond, et l'ignorer ferait annoncer un reliquat qui n'existe pas.
 */
export function quotaView({ limit, used, reserved }: QuotaInput): QuotaView {
  const safeUsed = Math.max(used, 0);
  const safeReserved = Math.max(reserved, 0);
  const engaged = safeUsed + safeReserved;

  if (limit === null || limit <= 0) {
    return {
      unlimited: true, limit: null, used: safeUsed, reserved: safeReserved,
      engaged, remaining: null, percent: 0, tone: "ok",
    };
  }

  const ratio = engaged / limit;
  return {
    unlimited: false,
    limit,
    used: safeUsed,
    reserved: safeReserved,
    engaged,
    remaining: Math.max(limit - engaged, 0),
    percent: Math.min(100, Math.round(ratio * 100)),
    tone: ratio >= 1 ? "critical" : ratio * 100 >= WARN_AT ? "warn" : "ok",
  };
}

/**
 * « 1 250 000 » — espace fine insécable (U+202F), le séparateur français.
 * Composé à la main : `toLocaleString` change de séparateur selon la version
 * d'ICU, et le test se briserait sur un changement de runtime sans qu'aucun
 * comportement n'ait bougé.
 */
export function formatTokens(value: number): string {
  const rounded = Math.round(Math.max(value, 0));
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
] as const;

/**
 * « 1ᵉʳ septembre 2026 » à partir d'un ISO `YYYY-MM-DD`. Le renouvellement
 * tombe toujours un premier du mois, qui s'écrit « 1ᵉʳ » en français.
 * Jumeau d'affichage de `ai-api/_shared/quota.ts` — une dérive change un
 * libellé, jamais un comportement : la date, elle, vient du serveur.
 */
export function renewalLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  if (!match) return iso;
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return iso;
  return `1ᵉʳ ${MONTHS[month]} ${match[1]}`;
}

/** Période courante en UTC — jumeau du `CHECK` SQL et de la RPC. */
export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Premier jour de la période suivante, en UTC. */
export function nextRenewalIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}
