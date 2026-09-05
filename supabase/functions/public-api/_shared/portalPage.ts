/**
 * Composition publiée d'une page du portail — ce que `GET /v1/portal/page`
 * sert. Logique pure, testée.
 *
 * ⚠️ **Miroir volontaire** de `src/features/portal/portalPage.ts` (même motif
 * que `publication.ts`) : une edge function ne peut rien importer de `src/`.
 * Les deux lisent le même JSON avec les mêmes tolérances — section par
 * section, champs manquants complétés — et les tests des deux côtés
 * l'épinglent. Ici s'ajoute ce que seul le serveur peut faire : **résoudre
 * les références**. `pinned` et `shortcuts` ne portent en sortie que des
 * démarches réellement publiées ; le consommateur n'a aucun identifiant mort
 * à gérer.
 */
import type {
  PortalPageDto,
  PortalSectionDto,
} from "./dto.ts";

type Row = Record<string, unknown>;

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** 2, 3 ou 4 — le domaine de la contrainte côté éditeur ; 3 par défaut. */
function columns(value: unknown): 2 | 3 | 4 {
  return value === 2 || value === 4 ? value : 3;
}

/**
 * Identifiants de démarches réellement publiées, dédoublonnés, dans l'ordre
 * choisi par la collectivité. Une référence vers une démarche absente du
 * catalogue publié est écartée — c'est le pendant serveur de la règle « on
 * écarte au rendu, pas au parse ».
 */
function references(value: unknown, publishedIds: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const id of value) {
    if (typeof id === "string" && publishedIds.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function serializeSection(raw: unknown, publishedIds: Set<string>): PortalSectionDto | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Row;
  const id = str(row.id);
  if (id === "") return null;
  const title = str(row.title);

  switch (row.kind) {
    case "recherche":
      return {
        id,
        kind: "recherche",
        title,
        subtitle: str(row.subtitle),
        placeholder: str(row.placeholder),
        show_shortcuts: bool(row.showShortcuts, false),
        shortcuts: references(row.shortcuts, publishedIds),
      };
    case "demarches":
      return {
        id,
        kind: "demarches",
        title,
        columns: columns(row.columns),
        pinned_first: bool(row.pinnedFirst, false),
        pinned: references(row.pinned, publishedIds),
      };
    case "actus":
      return {
        id,
        kind: "actus",
        title,
        layout: row.layout === "grid" ? "grid" : "list",
        count: columns(row.count),
        show_dates: bool(row.showDates, true),
      };
    case "compte":
      return { id, kind: "compte", title, subtitle: str(row.subtitle) };
    case "texte":
      return {
        id,
        kind: "texte",
        title,
        body: str(row.body),
        align: row.align === "center" ? "center" : "left",
      };
    default:
      // Un kind inconnu de cette version du serveur est ignoré, pas servi
      // brut : le contrat promet des sections que le consommateur sait lire.
      return null;
  }
}

/**
 * Composition publiée → DTO. Une section illisible est écartée, les autres
 * conservées. Une composition sans structure lisible rend une page vide, pas
 * une erreur : elle a été publiée, elle existe.
 */
export function serializePortalPage(
  published: unknown,
  meta: { slug: string; published_at: string },
  publishedIds: Set<string>,
): PortalPageDto {
  const sections: PortalSectionDto[] = [];
  const raw =
    published && typeof published === "object" ? (published as Row).sections : undefined;
  if (Array.isArray(raw)) {
    for (const candidate of raw) {
      const section = serializeSection(candidate, publishedIds);
      if (section) sections.push(section);
    }
  }
  return { slug: meta.slug, published_at: meta.published_at, version: 1, sections };
}
