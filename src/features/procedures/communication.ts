/**
 * Étape « Communication » : modèle des paramètres de communication d'une
 * démarche. Logique pure (aucune dépendance React/Supabase), consommée par
 * `CommunicationStep` et persistée dans `procedures.communication_config`.
 * Schéma « possédé » — contrat consommé en aval (portail usagers, Ariane, Clara).
 *
 * Le JSON est organisé en **blocs** (`visibility` aujourd'hui) : les réglages à
 * venir de l'étape s'ajouteront comme clés voisines, sans déplacer l'existant.
 */

/** Date de publication : jour civil, `AAAA-MM-JJ`. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Bloc « Visibilité » : si la démarche est proposée au public, et quand. */
export interface VisibilityConfig {
  /** La démarche est proposée sur le portail usagers. */
  portalVisible: boolean;
  /** La publication est bornée à une période. */
  publicationPeriodEnabled: boolean;
  /** Premier jour de publication (`AAAA-MM-JJ`, **inclus**) ; `null` = pas de borne basse. */
  publicationStart: string | null;
  /** Dernier jour de publication (`AAAA-MM-JJ`, **inclus**) ; `null` = pas de borne haute. */
  publicationEnd: string | null;
}

export interface CommunicationConfig {
  visibility: VisibilityConfig;
}

/**
 * Paramètres par défaut : démarche **visible** et publication **bornée**, sans
 * dates. Une démarche que l'on vient de paramétrer est donc proposée au public ;
 * les deux commutateurs sont actifs, à l'administrateur de restreindre.
 */
export function defaultCommunicationConfig(): CommunicationConfig {
  return {
    visibility: {
      portalVisible: true,
      publicationPeriodEnabled: true,
      publicationStart: null,
      publicationEnd: null,
    },
  };
}

/** Booléen strict : tout ce qui n'en est pas un retombe sur le défaut du champ. */
function coerceBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Date `AAAA-MM-JJ` réelle, `null` sinon (chaîne vide, format libre, 31 février…). */
function coerceDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) return null;
  // Postgres accepterait « 2026-02-31 » comme texte : on vérifie le jour civil.
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}

/**
 * Fusionne des paramètres stockés (JSON arbitraire de la base) avec les valeurs
 * par défaut : ignore l'inconnu, corrige les types, complète les champs
 * manquants. Toujours une structure complète en sortie.
 *
 * ⚠️ Les dates sont **conservées** quand la période est désactivée (le
 * commutateur gouverne l'usage, pas la donnée) — même parti que le nom
 * d'expéditeur d'une organisation : un retour en arrière ne perd rien.
 */
export function parseCommunicationConfig(raw: unknown): CommunicationConfig {
  const config = defaultCommunicationConfig();
  if (!raw || typeof raw !== "object") return config;

  const stored = (raw as Record<string, unknown>).visibility;
  if (!stored || typeof stored !== "object") return config;

  const visibility = stored as Record<string, unknown>;
  config.visibility = {
    portalVisible: coerceBool(visibility.portalVisible, true),
    publicationPeriodEnabled: coerceBool(visibility.publicationPeriodEnabled, true),
    publicationStart: coerceDate(visibility.publicationStart),
    publicationEnd: coerceDate(visibility.publicationEnd),
  };
  return config;
}

/** Normalise des paramètres en mémoire avant persistance (mêmes règles qu'à la lecture). */
export function cleanCommunicationConfig(config: CommunicationConfig): CommunicationConfig {
  return parseCommunicationConfig(config);
}

/**
 * Message d'erreur de la période de publication, `null` si elle est cohérente.
 * Une période dont la fin précède le début ne publierait **jamais** la démarche :
 * on la refuse à la saisie plutôt que de la laisser filer en aval.
 */
export function publicationPeriodError(visibility: VisibilityConfig): string | null {
  if (!visibility.publicationPeriodEnabled) return null;
  const { publicationStart, publicationEnd } = visibility;
  if (!publicationStart || !publicationEnd) return null;
  return publicationEnd < publicationStart
    ? "La date de fin de publication doit suivre la date de début."
    : null;
}
