/**
 * Étape « Communication » : modèle des paramètres de communication d'une
 * démarche. Logique pure (aucune dépendance React/Supabase), consommée par
 * `CommunicationStep` et persistée dans `procedures.communication_config`.
 * Schéma « possédé » — contrat consommé en aval (portail usagers, Ariane, Clara).
 *
 * Le JSON est organisé en **blocs** (`visibility`, `documents`) : les réglages à
 * venir de l'étape s'ajoutent comme clés voisines, sans déplacer l'existant.
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

/**
 * Quand un document est proposé à l'agent. `toujours` par défaut ; les deux
 * autres valeurs suivent l'issue de la demande (`demande.etat_cloture` du
 * catalogue de variables).
 */
export const DOCUMENT_VISIBILITIES = ["toujours", "positive", "negative"] as const;

export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

/** Un document du catalogue rendu accessible à l'agent pour cette démarche. */
export interface CommunicationDocument {
  /** Identifiant dans `document_templates`. */
  id: string;
  /** Condition d'affichage — **ignorée** tant que `restrictVisibility` est faux. */
  visibility: DocumentVisibility;
}

/**
 * Bloc « Documents et courriers » : ce que l'agent peut produire depuis cette
 * démarche. Deux listes distinctes parce que l'agent les cherche séparément —
 * `documents` puise dans les types `interne`/`externe` du catalogue, `letters`
 * dans le type `courrier`.
 */
export interface DocumentsConfig {
  /**
   * La visibilité de chaque document suit l'issue de la demande.
   * ⚠️ Faux = tous visibles, **quelles que soient** les conditions stockées :
   * le commutateur gouverne l'usage, pas la donnée (même parti que la période
   * de publication). Le désactiver ne perd donc aucun réglage.
   */
  restrictVisibility: boolean;
  /** Documents (catalogue : types `interne` et `externe`), dans l'ordre choisi. */
  documents: CommunicationDocument[];
  /** Courriers (catalogue : type `courrier`), dans l'ordre choisi. */
  letters: CommunicationDocument[];
}

export interface CommunicationConfig {
  visibility: VisibilityConfig;
  documents: DocumentsConfig;
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
    // ⚠️ Contrairement à `visibility`, les défauts du bloc `documents` sont
    // **vides** : une démarche jamais passée par l'étape (colonne NULL) ne doit
    // proposer aucun document, pas tous ceux du catalogue.
    documents: {
      restrictVisibility: false,
      documents: [],
      letters: [],
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
function coerceVisibility(value: unknown): DocumentVisibility {
  // Une condition inconnue ne masque pas le document : il a été **explicitement**
  // choisi par l'administrateur, la condition ne fait que restreindre. En cas de
  // doute on retombe donc sur `toujours`, pas sur un document introuvable.
  return DOCUMENT_VISIBILITIES.includes(value as DocumentVisibility)
    ? (value as DocumentVisibility)
    : "toujours";
}

/**
 * Liste de documents : ignore les entrées sans identifiant exploitable et
 * **dédoublonne** (un même document deux fois n'a pas de sens, et l'UI le
 * proposerait deux fois à l'agent). L'ordre de première apparition est conservé.
 */
function parseDocumentList(raw: unknown): CommunicationDocument[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const docs: CommunicationDocument[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, visibility } = item as Record<string, unknown>;
    const key = typeof id === "string" ? id.trim() : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    docs.push({ id: key, visibility: coerceVisibility(visibility) });
  }
  return docs;
}

export function parseCommunicationConfig(raw: unknown): CommunicationConfig {
  const config = defaultCommunicationConfig();
  if (!raw || typeof raw !== "object") return config;

  const root = raw as Record<string, unknown>;

  const stored = root.visibility;
  if (stored && typeof stored === "object") {
    const visibility = stored as Record<string, unknown>;
    config.visibility = {
      portalVisible: coerceBool(visibility.portalVisible, true),
      publicationPeriodEnabled: coerceBool(visibility.publicationPeriodEnabled, true),
      publicationStart: coerceDate(visibility.publicationStart),
      publicationEnd: coerceDate(visibility.publicationEnd),
    };
  }

  const storedDocs = root.documents;
  if (storedDocs && typeof storedDocs === "object") {
    const documents = storedDocs as Record<string, unknown>;
    config.documents = {
      restrictVisibility: coerceBool(documents.restrictVisibility, false),
      documents: parseDocumentList(documents.documents),
      letters: parseDocumentList(documents.letters),
    };
  }

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

/** Libellé français d'une condition de visibilité. */
export function documentVisibilityLabel(visibility: DocumentVisibility): string {
  switch (visibility) {
    case "positive":
      return "Demandes traitées positivement";
    case "negative":
      return "Demandes traitées négativement";
    default:
      return "Toujours";
  }
}

/**
 * Les deux groupes de l'étape, définis par le **type** du document au catalogue.
 * `courrier` d'un côté, `interne`/`externe` de l'autre : un agent qui cherche un
 * courrier ne veut pas fouiller les notices, et inversement.
 */
export type DocumentGroup = "document" | "letter";

/** Forme minimale attendue d'un document du catalogue (évite d'importer la feature). */
interface CatalogEntry {
  id: string;
  type: string;
}

/** À quel groupe de l'étape appartient un document du catalogue. */
export function documentGroupOf(type: string): DocumentGroup {
  return type === "courrier" ? "letter" : "document";
}

/** Documents du catalogue appartenant à un groupe donné. */
export function templatesForGroup<T extends CatalogEntry>(
  templates: readonly T[],
  group: DocumentGroup,
): T[] {
  return templates.filter((t) => documentGroupOf(t.type) === group);
}

/**
 * Documents du groupe que l'on peut encore ajouter : ceux du catalogue qui ne
 * sont pas déjà sélectionnés. C'est ce qui gouverne l'activation du bouton
 * d'ajout — quand la liste est vide, il n'y a plus rien à proposer.
 */
export function availableTemplates<T extends CatalogEntry>(
  templates: readonly T[],
  group: DocumentGroup,
  selected: readonly CommunicationDocument[],
): T[] {
  const taken = new Set(selected.map((d) => d.id));
  return templatesForGroup(templates, group).filter((t) => !taken.has(t.id));
}

/**
 * Documents sélectionnés, résolus contre le catalogue et **dans l'ordre choisi**.
 * ⚠️ Une référence dont le document a été supprimé du catalogue est **écartée** :
 * le JSON ne porte pas de clé étrangère, une sélection peut donc survivre à son
 * document. Mieux vaut ne rien proposer qu'un document introuvable.
 */
export function resolveDocuments<T extends CatalogEntry>(
  selected: readonly CommunicationDocument[],
  templates: readonly T[],
): Array<{ template: T; visibility: DocumentVisibility }> {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const resolved: Array<{ template: T; visibility: DocumentVisibility }> = [];
  for (const doc of selected) {
    const template = byId.get(doc.id);
    if (!template) continue;
    resolved.push({ template, visibility: doc.visibility });
  }
  return resolved;
}
