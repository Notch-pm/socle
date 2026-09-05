/**
 * Composition d'une page du portail usagers — le « contrat public » de
 * l'éditeur CMS. Logique pure (types + validation zod + fabriques + parseur
 * robuste), sans dépendance UI. Persistée dans `portal_pages.draft` et
 * `portal_pages.published`, consommée en aval par le portail.
 *
 * Une page est une liste ordonnée de **sections** typées. Les `kind` sont en
 * français — c'est le vocabulaire métier que l'administrateur voit — et les
 * propriétés en anglais, comme dans les autres schémas possédés du Socle
 * (`portalVisible`, `maxFiles`).
 *
 * Les épinglages et raccourcis référencent des `procedures.id`, jamais des
 * libellés : une démarche renommée reste épinglée, une démarche supprimée est
 * écartée au rendu — pas au parse, qui n'a pas le catalogue sous la main.
 */
import { z } from "zod";

export const SECTION_KINDS = ["recherche", "demarches", "actus", "compte", "texte"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const SECTION_LABELS: Record<SectionKind, string> = {
  recherche: "Recherche de démarche",
  demarches: "Grille de démarches",
  actus: "Actualités",
  compte: "Espace usager",
  texte: "Bandeau texte",
};

/** Colonnes d'une grille de démarches — et nombre d'articles d'un bloc actualités. */
export const GRID_COLUMNS = [2, 3, 4] as const;
export type GridColumns = (typeof GRID_COLUMNS)[number];

export const ACTUS_LAYOUTS = ["grid", "list"] as const;
export type ActusLayout = (typeof ACTUS_LAYOUTS)[number];

export const TEXT_ALIGNS = ["left", "center"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

/** Raccourcis sous le champ de recherche : au-delà, la ligne déborde. */
export const MAX_SHORTCUTS = 4;

interface SectionCommon {
  id: string;
  /** « Titre affiché » — chaque section en a un. */
  title: string;
}

export interface RechercheSection extends SectionCommon {
  kind: "recherche";
  subtitle: string;
  /** Texte du champ vide. */
  placeholder: string;
  /** Afficher des raccourcis sous le champ. */
  showShortcuts: boolean;
  /** Démarches raccourcies (`procedures.id`), `MAX_SHORTCUTS` au plus. */
  shortcuts: string[];
}

export interface DemarchesSection extends SectionCommon {
  kind: "demarches";
  columns: GridColumns;
  /** Les démarches à la une remontent en tête de grille. */
  pinnedFirst: boolean;
  /** Démarches à la une (`procedures.id`). */
  pinned: string[];
}

export interface ActusSection extends SectionCommon {
  kind: "actus";
  layout: ActusLayout;
  /** Articles affichés. */
  count: GridColumns;
  showDates: boolean;
}

export interface CompteSection extends SectionCommon {
  kind: "compte";
  /** Accroche sous le titre. */
  subtitle: string;
}

export interface TexteSection extends SectionCommon {
  kind: "texte";
  body: string;
  align: TextAlign;
}

export type PortalSection =
  | RechercheSection
  | DemarchesSection
  | ActusSection
  | CompteSection
  | TexteSection;

export interface PortalPage {
  version: 1;
  sections: PortalSection[];
}

/**
 * Ce que la palette propose. « Contact et horaires » n'est pas un `kind` : c'est
 * un bandeau texte pré-rempli depuis l'organisation (`createContactSection`).
 *
 * `available: false` = présent dans la palette mais désactivé. Le bloc
 * Actualités n'a rien à afficher tant que les actualités n'existent pas ; il
 * reste visible pour que l'administrateur sache qu'il viendra, et le schéma
 * l'accepte pour qu'une composition importée plus tard ne soit pas amputée.
 */
export type PaletteKind = SectionKind | "contact";

export const PALETTE_ITEMS: { kind: PaletteKind; label: string; hint: string; available: boolean }[] = [
  { kind: "recherche", label: "Recherche de démarche", hint: "Champ + démarches fréquentes", available: true },
  { kind: "demarches", label: "Grille de démarches", hint: "2 à 4 colonnes, épinglage", available: true },
  { kind: "actus", label: "Actualités", hint: "Bientôt disponible", available: false },
  { kind: "compte", label: "Espace usager", hint: "Bandeau de connexion", available: true },
  { kind: "texte", label: "Bandeau texte", hint: "Titre + paragraphe", available: true },
  { kind: "contact", label: "Contact et horaires", hint: "Coordonnées de la mairie", available: true },
];

function genId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "id-" + Math.random().toString(36).slice(2, 10);
}

/** La section d'un `kind` donné — ce que `createSection("texte")` rend, sans élargir à l'union. */
export type SectionOf<K extends SectionKind> = Extract<PortalSection, { kind: K }>;

const BUILDERS: { [K in SectionKind]: (id: string) => SectionOf<K> } = {
  recherche: (id) => ({
    id,
    kind: "recherche",
    title: "Trouvez votre démarche",
    subtitle: "Un seul champ pour toutes vos demandes",
    placeholder: "Rechercher une démarche",
    showShortcuts: false,
    shortcuts: [],
  }),
  demarches: (id) => ({
    id,
    kind: "demarches",
    title: "Nos démarches",
    columns: 3,
    pinnedFirst: false,
    pinned: [],
  }),
  actus: (id) => ({
    id,
    kind: "actus",
    title: "Dernières actualités",
    layout: "list",
    count: 3,
    showDates: true,
  }),
  compte: (id) => ({
    id,
    kind: "compte",
    title: "Votre espace personnel",
    subtitle: "Connectez-vous pour suivre vos démarches",
  }),
  texte: (id) => ({
    id,
    kind: "texte",
    title: "Titre du bandeau",
    body: "Un paragraphe court à destination des usagers.",
    align: "left",
  }),
};

/**
 * Section vierge d'un type donné, avec les textes d'amorce de la maquette.
 * Générique sur le `kind` : appelée avec un littéral, elle rend le type précis,
 * ce qui permet d'écrire `{ ...createSection("texte"), align: "center" }`.
 */
export function createSection<K extends SectionKind>(kind: K): SectionOf<K> {
  return BUILDERS[kind](genId());
}

/** Ce qu'une fiche organisation apporte au bandeau de contact. */
export interface ContactSource {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Bandeau « Contact et horaires » : un bandeau texte ordinaire, pré-rempli
 * depuis la fiche de l'organisation. Les horaires n'existent pas au Socle —
 * l'administrateur les ajoute au paragraphe, où ils restent modifiables comme
 * le reste. Un champ vide est simplement omis, pas remplacé par un tiret.
 */
export function createContactSection(org: ContactSource): TexteSection {
  const parts = [org.address, org.phone, org.email]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v !== "");
  return {
    id: genId(),
    kind: "texte",
    title: org.name.trim() || "Nous contacter",
    body: parts.length > 0 ? parts.join(" · ") : "Coordonnées et horaires d'ouverture.",
    align: "left",
  };
}

/**
 * Composition d'une page qui n'a jamais été éditée : la maquette, sans le
 * bloc Actualités (indisponible) et sans démarche épinglée — le catalogue
 * n'est pas connu ici, et une page par défaut ne doit présumer de rien.
 */
export function defaultPortalPage(): PortalPage {
  return {
    version: 1,
    sections: [
      {
        ...createSection("recherche"),
        subtitle: "Vos démarches en ligne, 24 h/24",
        placeholder: "Ex. acte de naissance, urbanisme…",
      },
      { ...createSection("demarches"), title: "Démarches les plus demandées", pinnedFirst: true },
      {
        ...createSection("compte"),
        subtitle: "Suivez vos démarches et retrouvez vos documents",
      },
      {
        ...createSection("texte"),
        title: "Besoin d'aide ?",
        body: "Un agent vous accompagne du lundi au vendredi. Retrouvez nos coordonnées en bas de page.",
        align: "center",
      },
    ],
  };
}

// ---- Validation / parsing --------------------------------------------------

const common = { id: z.string().min(1), title: z.string().default("") };
const columns = z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3);

const rechercheSchema = z.object({
  ...common,
  kind: z.literal("recherche"),
  subtitle: z.string().default(""),
  placeholder: z.string().default(""),
  showShortcuts: z.boolean().default(false),
  shortcuts: z.array(z.string()).default([]),
});

const demarchesSchema = z.object({
  ...common,
  kind: z.literal("demarches"),
  columns,
  pinnedFirst: z.boolean().default(false),
  pinned: z.array(z.string()).default([]),
});

const actusSchema = z.object({
  ...common,
  kind: z.literal("actus"),
  layout: z.enum(ACTUS_LAYOUTS).default("list"),
  count: columns,
  showDates: z.boolean().default(true),
});

const compteSchema = z.object({
  ...common,
  kind: z.literal("compte"),
  subtitle: z.string().default(""),
});

const texteSchema = z.object({
  ...common,
  kind: z.literal("texte"),
  body: z.string().default(""),
  align: z.enum(TEXT_ALIGNS).default("left"),
});

const sectionSchema = z.discriminatedUnion("kind", [
  rechercheSchema,
  demarchesSchema,
  actusSchema,
  compteSchema,
  texteSchema,
]);

const pageShape = z.object({
  version: z.literal(1).default(1),
  sections: z.array(z.unknown()).default([]),
});

/**
 * Transforme un JSON stocké (arbitraire) en `PortalPage` valide.
 *
 * Tolérance **section par section** : une section illisible (kind inconnu,
 * id absent) est écartée, les autres sont conservées avec leurs champs
 * manquants complétés par défaut. C'est plus indulgent que `parseFormSchema`,
 * et délibérément : c'est la page d'accueil d'une collectivité — perdre toute
 * sa composition pour une section abîmée serait pire que d'en perdre une.
 * Une structure de page illisible retombe sur la composition par défaut.
 */
export function parsePortalPage(raw: unknown): PortalPage {
  if (!raw || typeof raw !== "object") return defaultPortalPage();
  const page = pageShape.safeParse(raw);
  if (!page.success) return defaultPortalPage();
  const sections: PortalSection[] = [];
  for (const candidate of page.data.sections) {
    const parsed = sectionSchema.safeParse(candidate);
    if (parsed.success) sections.push(parsed.data as PortalSection);
  }
  return { version: 1, sections };
}
