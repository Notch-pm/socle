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

// ---------------------------------------------------------------------------
// Le PARTAGE du plafond (2026-09-22) — la part réservée d'une application, et
// le reste aux autres.
//
// Une part se règle en jetons ou en POURCENTAGE VIVANT du plafond commun ;
// le serveur la résout (`ai_usage_share_effective`, une seule implémentation,
// rendue par la RPC `ai_usage_shares` dans `effectiveTokens`). Ce module ne
// recalcule la résolution que pour l'APERÇU d'un dialogue, avant
// enregistrement — `resolveShare`, jumeau plancher-entier du SQL, testé.
// ---------------------------------------------------------------------------

export type ShareMode = "tokens" | "percent";

/** Une part réservée telle que la sert `ai_usage_shares`. */
export interface AiShare {
  consumer: string;
  mode: ShareMode;
  configuredTokens: number | null;
  percent: number | null;
  /**
   * Résolue par le serveur contre le plafond commun ACTIF. `null` = sans
   * effet : part désactivée, ou pourcentage sans plafond à résoudre.
   */
  effectiveTokens: number | null;
  isActive: boolean;
  used: number;
  reserved: number;
  updatedAt: string | null;
}

export interface ShareSetting {
  mode: ShareMode;
  tokens: number | null;
  percent: number | null;
}

/**
 * Jumeau de `ai_usage_share_effective` : pourcentage ⇒ plancher entier du
 * plafond (sans plafond ⇒ `null`, sans effet) ; jetons ⇒ bornés au plafond.
 */
export function resolveShare(setting: ShareSetting, plafond: number | null): number | null {
  const base = plafond !== null && plafond > 0 ? plafond : null;
  if (setting.mode === "percent") {
    if (base === null || setting.percent === null) return null;
    return Math.floor((base * setting.percent) / 100);
  }
  if (setting.tokens === null || setting.tokens <= 0) return null;
  return base === null ? setting.tokens : Math.min(setting.tokens, base);
}

/**
 * Le plafond des applications SANS part : le commun moins les parts. Jumeau
 * de la RPC (`v_caller_limit`) et de `ai-api/_shared/quota.ts`.
 *
 * `max(part, engagé)` et non `part` : une part dépassée par un règlement
 * plus lourd que son estimation a bien consommé au-delà, et ce dépassement
 * est sorti du reste. Jamais négatif — n parts peuvent, ensemble, dépasser
 * le plafond.
 */
export function remainderLimit(plafond: number | null, shares: AiShare[]): number | null {
  if (plafond === null || plafond <= 0) return null;
  const taken = shares.reduce((sum, s) => {
    if (s.effectiveTokens === null) return sum;
    return sum + Math.max(s.effectiveTokens, s.used + s.reserved);
  }, 0);
  return Math.max(plafond - taken, 0);
}

export type SplitState =
  /** Aucune part active : tout le monde puise dans le plafond commun. */
  | "none"
  /** Part et plafond : chacun sa jauge, la somme fait le plafond. */
  | "split"
  /** Part en jetons sans plafond commun : l'assistant est borné, le reste est illimité. */
  | "share-without-quota"
  /** Part en pourcentage sans plafond commun : sans effet tant qu'il n'y a rien à partager. */
  | "percent-without-quota";

export interface SplitView {
  state: SplitState;
  share: AiShare | null;
  /** La jauge de la part (l'assistant du portail). */
  usagers: QuotaView | null;
  /** La jauge du reste (les agents) : le commun moins la part. */
  agents: QuotaView | null;
}

/**
 * Ce que la répartition donne à VOIR, à partir du plafond commun, de la
 * part concernée et des compteurs communs. L'engagé du reste est l'engagé
 * commun moins celui de la part — clampé : le sous-compteur ne compte que
 * sous une part active, le commun compte tout.
 */
export function splitView(input: {
  plafond: number | null;
  share: AiShare | null;
  totalUsed: number;
  totalReserved: number;
}): SplitView {
  const { plafond, share, totalUsed, totalReserved } = input;
  const active = share && share.isActive ? share : null;
  const hasQuota = plafond !== null && plafond > 0;

  if (!active) {
    return { state: "none", share: share ?? null, usagers: null, agents: null };
  }

  const restUsed = Math.max(totalUsed - active.used, 0);
  const restReserved = Math.max(totalReserved - active.reserved, 0);

  if (active.effectiveTokens === null) {
    // Pourcentage irrésoluble : le plafond commun, s'il existe, vaut pour tous.
    return {
      state: "percent-without-quota",
      share: active,
      usagers: null,
      agents: quotaView({ limit: hasQuota ? plafond : null, used: totalUsed, reserved: totalReserved }),
    };
  }

  const usagers = quotaView({ limit: active.effectiveTokens, used: active.used, reserved: active.reserved });
  if (!hasQuota) {
    return {
      state: "share-without-quota",
      share: active,
      usagers,
      agents: quotaView({ limit: null, used: restUsed, reserved: restReserved }),
    };
  }
  return {
    state: "split",
    share: active,
    usagers,
    agents: quotaView({ limit: remainderLimit(plafond, [active]), used: restUsed, reserved: restReserved }),
  };
}
