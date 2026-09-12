/**
 * La fréquentation du site de démarches — lecture tolérante de la RPC
 * `portal_audience`, et la mise en forme que les graphiques demandent.
 *
 * Module PUR (aucune dépendance React ni Supabase), testé.
 *
 * ⚠️ TOUT SE CALE SUR L'HEURE DE PARIS, comme les compteurs eux-mêmes : le
 * serveur date en `Europe/Paris`, et un navigateur qui bornerait la période
 * dans SON fuseau demanderait un jour de trop ou de moins — le dernier jour
 * manquerait pour un agent aux Antilles, et la veille apparaîtrait vide.
 */

import { languageLabel } from "@/features/languages/languages";

// --------------------------------------------------------------------------
// La période
// --------------------------------------------------------------------------

/** Les trois périodes, celles de Clara et d'Iris — même geste d'un produit à l'autre. */
export const AUDIENCE_PERIODS = ["7d", "30d", "1y"] as const;
export type AudiencePeriod = (typeof AUDIENCE_PERIODS)[number];

export const DEFAULT_PERIOD: AudiencePeriod = "30d";

export const PERIOD_LABELS: Record<AudiencePeriod, string> = {
  "7d": "7 jours",
  "30d": "30 jours",
  "1y": "1 an",
};

const PERIOD_DAYS: Record<AudiencePeriod, number> = { "7d": 7, "30d": 30, "1y": 365 };

/** `AAAA-MM-JJ` d'une date, en heure de Paris. */
export function parisDay(at: Date): string {
  // `en-CA` rend précisément `AAAA-MM-JJ` — la seule locale qui le fasse sans
  // recomposer les morceaux à la main.
  return at.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

export interface DayRange {
  from: string;
  to: string;
}

/**
 * Les bornes d'une période, **incluses des deux côtés** : « 7 jours » est
 * aujourd'hui plus les six précédents, pas huit jours.
 */
export function periodRange(period: AudiencePeriod, now: Date = new Date()): DayRange {
  const to = parisDay(now);
  const start = new Date(`${to}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (PERIOD_DAYS[period] - 1));
  // Midi UTC : assez loin des bascules de jour pour qu'aucun décalage
  // saisonnier ne fasse reculer la date d'un cran.
  return { from: start.toISOString().slice(0, 10), to };
}

// --------------------------------------------------------------------------
// La lecture
// --------------------------------------------------------------------------

export interface AudienceDay {
  day: string;
  views: number;
  visits: number;
  deposits: number;
}

export interface AudienceTotals {
  views: number;
  visits: number;
  deposits: number;
  /** Combien de fois un formulaire a été ouvert — le dénominateur du taux. */
  formViews: number;
}

export type AudiencePageKind = "accueil" | "demarche" | "formulaire";

export interface AudiencePage {
  page: AudiencePageKind;
  procedureId: string | null;
  /** `null` quand la démarche a été supprimée depuis (pas de clé étrangère). */
  procedureName: string | null;
  views: number;
}

export type AudienceDimension = "langue" | "appareil";

export interface AudienceBreakdown {
  dimension: AudienceDimension;
  value: string;
  views: number;
  visits: number;
}

export interface Audience {
  days: AudienceDay[];
  totals: AudienceTotals;
  pages: AudiencePage[];
  breakdown: AudienceBreakdown[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(source: Record<string, unknown>, key: string): number {
  const raw = source[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(Math.trunc(raw), 0);
  if (typeof raw === "string") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0;
  }
  return 0;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_KINDS: AudiencePageKind[] = ["accueil", "demarche", "formulaire"];
const DIMENSIONS: AudienceDimension[] = ["langue", "appareil"];

/** Lecteur tolérant — motif `parseDashboardStats`. */
export function parseAudience(value: unknown): Audience {
  const root = record(value);
  const totals = record(root.totals);

  return {
    days: (Array.isArray(root.days) ? root.days : []).flatMap((raw) => {
      const entry = record(raw);
      const day = typeof entry.day === "string" ? entry.day.slice(0, 10) : "";
      if (!DAY_RE.test(day)) return [];
      return [{
        day,
        views: count(entry, "views"),
        visits: count(entry, "visits"),
        deposits: count(entry, "deposits"),
      }];
    }),
    totals: {
      views: count(totals, "views"),
      visits: count(totals, "visits"),
      deposits: count(totals, "deposits"),
      formViews: count(totals, "form_views"),
    },
    pages: (Array.isArray(root.pages) ? root.pages : []).flatMap((raw) => {
      const entry = record(raw);
      const page = typeof entry.page === "string" ? entry.page : "";
      if (!PAGE_KINDS.includes(page as AudiencePageKind)) return [];
      return [{
        page: page as AudiencePageKind,
        procedureId: typeof entry.procedure_id === "string" ? entry.procedure_id : null,
        procedureName:
          typeof entry.procedure_name === "string" && entry.procedure_name.trim() !== ""
            ? entry.procedure_name.trim()
            : null,
        views: count(entry, "views"),
      }];
    }),
    breakdown: (Array.isArray(root.breakdown) ? root.breakdown : []).flatMap((raw) => {
      const entry = record(raw);
      const dimension = typeof entry.dimension === "string" ? entry.dimension : "";
      const value = typeof entry.value === "string" ? entry.value.trim() : "";
      if (!DIMENSIONS.includes(dimension as AudienceDimension) || value === "") return [];
      return [{
        dimension: dimension as AudienceDimension,
        value,
        views: count(entry, "views"),
        visits: count(entry, "visits"),
      }];
    }),
  };
}

export function emptyAudience(): Audience {
  return { days: [], totals: { views: 0, visits: 0, deposits: 0, formViews: 0 }, pages: [], breakdown: [] };
}

// --------------------------------------------------------------------------
// La série du graphique
// --------------------------------------------------------------------------

export interface SeriesPoint {
  /** Clé technique (`AAAA-MM-JJ` ou `AAAA-MM`), pour l'axe et les tests. */
  key: string;
  label: string;
  views: number;
  visits: number;
}

const MONTHS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

function dayLabel(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""}`.trim();
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${year.slice(2)}`.trim();
}

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Les points du graphique, sur toute la période demandée.
 *
 * ⚠️ LES JOURS SANS DONNÉES SONT COMPLÉTÉS PAR DES ZÉROS — la RPC ne les
 * renvoie pas (transmettre 365 lignes vides n'apprendrait rien), mais un
 * graphique qui les saute relierait le 3 au 9 comme s'ils se suivaient, et un
 * creux se lirait comme un plateau.
 *
 * ⚠️ SUR UN AN, ON REGROUPE PAR MOIS : 365 points sur une largeur d'écran ne
 * se lisent pas, et ce n'est pas la question qu'on pose à cette échelle.
 */
export function seriesFor(audience: Audience, period: AudiencePeriod, range: DayRange): SeriesPoint[] {
  const byDay = new Map(audience.days.map((d) => [d.day, d]));
  const points: SeriesPoint[] = [];

  if (period === "1y") {
    const byMonth = new Map<string, SeriesPoint>();
    for (let day = range.from; day <= range.to; day = nextDay(day)) {
      const key = day.slice(0, 7);
      if (!byMonth.has(key)) {
        const point = { key, label: monthLabel(key), views: 0, visits: 0 };
        byMonth.set(key, point);
        points.push(point);
      }
      const found = byDay.get(day);
      if (found) {
        const point = byMonth.get(key)!;
        point.views += found.views;
        point.visits += found.visits;
      }
    }
    return points;
  }

  for (let day = range.from; day <= range.to; day = nextDay(day)) {
    const found = byDay.get(day);
    points.push({
      key: day,
      label: dayLabel(day),
      views: found?.views ?? 0,
      visits: found?.visits ?? 0,
    });
  }
  return points;
}

// --------------------------------------------------------------------------
// Les libellés
// --------------------------------------------------------------------------

export const DEVICE_LABELS: Record<string, string> = {
  mobile: "Mobile",
  tablette: "Tablette",
  ordinateur: "Ordinateur",
};

/**
 * Le libellé d'une page vue.
 *
 * ⚠️ « Démarche supprimée » plutôt que l'identifiant nu : la ligne est
 * conservée (les compteurs n'ont pas de clé étrangère, exprès — un historique
 * ne s'efface pas quand un paramétrage change), donc elle doit se lire. Un
 * uuid dans une liste de pages ne dit rien à personne.
 */
export function pageLabel(page: AudiencePage): string {
  if (page.page === "accueil") return "Accueil";
  const name = page.procedureName ?? "Démarche supprimée";
  return page.page === "formulaire" ? `${name} — formulaire` : name;
}

export function breakdownLabel(entry: AudienceBreakdown): string {
  return entry.dimension === "langue"
    ? languageLabel(entry.value)
    : DEVICE_LABELS[entry.value] ?? entry.value;
}

/** Les lignes d'une ventilation, les plus vues d'abord. */
export function breakdownOf(audience: Audience, dimension: AudienceDimension): AudienceBreakdown[] {
  return audience.breakdown
    .filter((entry) => entry.dimension === dimension && entry.views > 0)
    .sort((a, b) => b.views - a.views || a.value.localeCompare(b.value, "fr"));
}

/**
 * Le taux de dépôt : des demandes déposées rapportées aux formulaires ouverts.
 *
 * ⚠️ « — » QUAND AUCUN FORMULAIRE N'A ÉTÉ OUVERT, jamais « 0 % » : un taux
 * sans dénominateur n'est pas nul, il n'existe pas. Afficher zéro ferait lire
 * un échec là où il n'y a eu aucune tentative.
 *
 * ⚠️ Il peut dépasser 100 % et on ne le borne pas : un usager qui ouvre le
 * formulaire un jour et dépose le lendemain met sa vue d'un côté de la période
 * et son dépôt de l'autre. Borner masquerait ce décalage au lieu de le
 * montrer ; c'est une mesure, pas une promesse.
 */
export function depositRate(totals: AudienceTotals): string {
  if (totals.formViews === 0) return "—";
  const rate = (totals.deposits / totals.formViews) * 100;
  return `${rate.toLocaleString("fr-FR", { maximumFractionDigits: rate < 10 ? 1 : 0 })} %`;
}

/** La sous-ligne de la tuile « Demandes déposées ». */
export function depositSubtitle(totals: AudienceTotals): string {
  return totals.formViews === 0
    ? "Aucun formulaire ouvert"
    : `soit ${depositRate(totals)} des formulaires ouverts`;
}
