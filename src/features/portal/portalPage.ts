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
import {
  PORTAL_SECTION_FIELDS,
  translationsForWrite,
  type PortalSectionField,
  type TranslationMap,
} from "@/features/languages/translations";

export const SECTION_KINDS = ["recherche", "demarches", "actus", "compte", "texte", "footer"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const SECTION_LABELS: Record<SectionKind, string> = {
  recherche: "Recherche de démarche",
  demarches: "Grille de démarches",
  actus: "Actualités",
  compte: "Espace usager",
  texte: "Bandeau texte",
  footer: "Pied de page",
};

/** Colonnes d'une grille de démarches — et nombre d'articles d'un bloc actualités. */
export const GRID_COLUMNS = [2, 3, 4] as const;
export type GridColumns = (typeof GRID_COLUMNS)[number];

/** Colonnes d'un pied de page. */
export const FOOTER_COLUMNS = [1, 2, 3] as const;
export type FooterColumns = (typeof FOOTER_COLUMNS)[number];

export const ACTUS_LAYOUTS = ["grid", "list"] as const;
export type ActusLayout = (typeof ACTUS_LAYOUTS)[number];

export const TEXT_ALIGNS = ["left", "center"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

/** Raccourcis sous le champ de recherche : au-delà, la ligne déborde. */
export const MAX_SHORTCUTS = 4;

/** Une couleur est une valeur CSS injectée dans la page : `#rrggbb`, rien d'autre. */
export const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** Le sombre classique d'un pied de page — l'encre forêt de la gamme. */
export const DEFAULT_FOOTER_BACKGROUND = "#0f1f18";

interface SectionCommon {
  id: string;
  /** « Titre affiché » — chaque section en a un. */
  title: string;
  /**
   * Les textes de cette section dans les autres langues de la collectivité —
   * `{ "<code>": { "title": "…", "body": "…" } }`, exactement la forme de
   * `procedures.translations`.
   *
   * ⚠️ ELLE VIT SUR LA SECTION, et pas dans une couche par langue au niveau de
   * la page : une traduction VOYAGE alors avec son bloc. Déplacer, dupliquer ou
   * supprimer une section n'a rien à resynchroniser, et les sous-blocs du pied
   * de page en héritent sans une ligne — ce sont des sections.
   *
   * Mêmes trois règles que partout : jamais de clé `fr` (le français est le
   * champ de même nom), un texte vide est une **absence**, et le repli se fait
   * **champ par champ**.
   */
  translations: SectionTranslations;
}

/**
 * Les textes d'une section qui se traduisent. Le jeu est déclaré dans
 * `src/features/languages/translations.ts`, avec celui des démarches : les
 * trois règles n'y sont écrites qu'une fois.
 */
export type SectionTranslations = TranslationMap<PortalSectionField>;

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

/**
 * Pied de page : un bandeau pleine largeur, à la couleur de fond choisie, qui
 * répartit des sous-blocs sur une à trois colonnes. Les sous-blocs sont des
 * bandeaux texte — « Contact et horaires » en est un — dans l'ordre choisi ;
 * la colonne de chacun découle de son rang.
 */
export interface FooterSection extends SectionCommon {
  kind: "footer";
  /** Couleur de fond, `#rrggbb` minuscule. */
  background: string;
  columns: FooterColumns;
  children: TexteSection[];
}

export type PortalSection =
  | RechercheSection
  | DemarchesSection
  | ActusSection
  | CompteSection
  | TexteSection
  | FooterSection;

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
  { kind: "footer", label: "Pied de page", hint: "Pleine largeur, 1 à 3 colonnes", available: true },
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
    translations: {},
    title: "Trouvez votre démarche",
    subtitle: "Un seul champ pour toutes vos demandes",
    placeholder: "Rechercher une démarche",
    showShortcuts: false,
    shortcuts: [],
  }),
  demarches: (id) => ({
    id,
    kind: "demarches",
    translations: {},
    title: "Nos démarches",
    columns: 3,
    pinnedFirst: false,
    pinned: [],
  }),
  actus: (id) => ({
    id,
    kind: "actus",
    translations: {},
    title: "Dernières actualités",
    layout: "list",
    count: 3,
    showDates: true,
  }),
  compte: (id) => ({
    id,
    kind: "compte",
    translations: {},
    title: "Votre espace personnel",
    subtitle: "Connectez-vous pour suivre vos démarches",
  }),
  texte: (id) => ({
    id,
    kind: "texte",
    translations: {},
    title: "Titre du bandeau",
    body: "Un paragraphe court à destination des usagers.",
    align: "left",
  }),
  // Sans titre ni sous-bloc : un pied de page se remplit depuis l'inspecteur,
  // et un titre d'amorce y ferait un bandeau de plus à effacer.
  footer: (id) => ({
    id,
    kind: "footer",
    translations: {},
    title: "",
    background: DEFAULT_FOOTER_BACKGROUND,
    columns: 3,
    children: [],
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
    translations: {},
    title: org.name.trim() || "Nous contacter",
    body: parts.length > 0 ? parts.join(" · ") : "Coordonnées et horaires d'ouverture.",
    align: "left",
  };
}

/**
 * Le texte se lit-il en clair sur ce fond ? Luminance relative (sRGB, WCAG) :
 * sous 0,4 le fond est sombre et appelle du texte clair. Une couleur illisible
 * est traitée comme sombre — le défaut du pied de page l'est.
 */
export function isDarkColor(hex: string): boolean {
  if (!HEX_COLOR.test(hex)) return true;
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance < 0.4;
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

/**
 * Les textes traduisibles d'une section, dans l'ordre où ils se saisissent.
 *
 * C'est la liste que l'inspecteur propose ET celle qu'il a le droit d'effacer
 * (`translationsForWrite`). Un kind qui n'a qu'un titre ne doit pas proposer un
 * paragraphe : le champ français n'existe pas, la traduction n'aurait rien à
 * traduire.
 */
export function fieldsForKind(kind: SectionKind): readonly PortalSectionField[] {
  switch (kind) {
    case "recherche":
      return ["title", "subtitle", "placeholder"];
    case "compte":
      return ["title", "subtitle"];
    case "texte":
      return ["title", "body"];
    default:
      // `demarches`, `actus`, `footer` : un titre, et rien d'autre. Les
      // sous-blocs du pied de page ont chacun les leurs.
      return ["title"];
  }
}

/**
 * Le texte français d'un champ, quel que soit le kind. Rend `""` pour un champ
 * que ce kind ne porte pas — il n'y a alors rien à traduire, et
 * `TranslationFields` écarte de lui-même une source vide.
 */
export function sectionText(section: PortalSection, field: PortalSectionField): string {
  switch (field) {
    case "title":
      return section.title;
    case "subtitle":
      return section.kind === "recherche" || section.kind === "compte" ? section.subtitle : "";
    case "placeholder":
      return section.kind === "recherche" ? section.placeholder : "";
    case "body":
      return section.kind === "texte" ? section.body : "";
  }
}

/**
 * Pose (ou efface) la traduction d'un texte, frappe par frappe.
 *
 * ⚠️ Passe par `translationsForWrite` plutôt que d'écrire dans l'objet : les
 * trois règles — jamais de clé `fr`, un texte vide est une absence, pas
 * d'entrée de langue vide — sont écrites UNE fois, dans le module des langues.
 * Les réécrire ici en ferait une seconde version à tenir d'accord.
 */
export function setSectionTranslation(
  translations: SectionTranslations,
  code: string,
  field: PortalSectionField,
  value: string,
): SectionTranslations {
  return translationsForWrite(
    translations,
    { [code]: { [field]: value } },
    [code],
    [field],
    PORTAL_SECTION_FIELDS,
  );
}

/** Cette section porte-t-elle déjà une traduction ? (ouverture du bloc de saisie) */
export function hasTranslations(section: PortalSection): boolean {
  if (Object.keys(section.translations).length > 0) return true;
  return section.kind === "footer" && section.children.some(hasTranslations);
}

// ---- Validation / parsing --------------------------------------------------

/**
 * ⚠️ `translations` DOIT ÊTRE DÉCLARÉ ICI. Zod strippe les clés inconnues : sans
 * cette ligne, une traduction saisie survivrait à la frappe puis disparaîtrait
 * au rechargement de l'éditeur — pire qu'une perte franche, l'agent croirait
 * avoir enregistré. `.catch({})` plutôt que `.default({})` : une table abîmée
 * est écartée sans emporter la section, comme partout ailleurs dans ce fichier.
 */
const translations = z
  .record(z.string(), z.record(z.string(), z.string()))
  .catch({})
  .default({});

const common = { id: z.string().min(1), title: z.string().default(""), translations };
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

// Les sous-blocs sont lus à part, un par un (voir `parseSection`) : un
// sous-bloc abîmé ne doit pas emporter le pied de page entier.
const footerSchema = z.object({
  ...common,
  kind: z.literal("footer"),
  background: z.string().regex(HEX_COLOR).catch(DEFAULT_FOOTER_BACKGROUND),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
  children: z.array(z.unknown()).default([]),
});

const sectionSchema = z.discriminatedUnion("kind", [
  rechercheSchema,
  demarchesSchema,
  actusSchema,
  compteSchema,
  texteSchema,
  footerSchema,
]);

const pageShape = z.object({
  version: z.literal(1).default(1),
  sections: z.array(z.unknown()).default([]),
});

function parseSection(candidate: unknown): PortalSection | null {
  const parsed = sectionSchema.safeParse(candidate);
  if (!parsed.success) return null;
  if (parsed.data.kind !== "footer") return parsed.data as PortalSection;
  const children: TexteSection[] = [];
  for (const child of parsed.data.children) {
    const texte = texteSchema.safeParse(child);
    if (texte.success) children.push(texte.data as TexteSection);
  }
  return { ...parsed.data, children } as FooterSection;
}

/**
 * Transforme un JSON stocké (arbitraire) en `PortalPage` valide.
 *
 * Tolérance **section par section** : une section illisible (kind inconnu,
 * id absent) est écartée, les autres sont conservées avec leurs champs
 * manquants complétés par défaut. C'est plus indulgent que `parseFormSchema`,
 * et délibérément : c'est la page d'accueil d'une collectivité — perdre toute
 * sa composition pour une section abîmée serait pire que d'en perdre une.
 * Même tolérance dans un pied de page, sous-bloc par sous-bloc. Une structure
 * de page illisible retombe sur la composition par défaut.
 */
export function parsePortalPage(raw: unknown): PortalPage {
  if (!raw || typeof raw !== "object") return defaultPortalPage();
  const page = pageShape.safeParse(raw);
  if (!page.success) return defaultPortalPage();
  const sections: PortalSection[] = [];
  for (const candidate of page.data.sections) {
    const section = parseSection(candidate);
    if (section) sections.push(section);
  }
  return { version: 1, sections };
}
