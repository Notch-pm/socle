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
  PortalSectionTranslationsDto,
  PortalTexteSectionDto,
} from "./dto.ts";

/** Une couleur est une valeur CSS injectée chez le consommateur : `#rrggbb`, rien d'autre. */
const HEX_COLOR = /^#[0-9a-f]{6}$/;
/**
 * Une URL d'image finit dans le `src` d'une page publique : **`https` absolue,
 * ou rien**. Miroir d'`IMAGE_URL` côté éditeur — la garde est des DEUX côtés,
 * parce que la colonne peut aussi avoir été écrite avant que l'éditeur ne la
 * pose.
 */
const IMAGE_URL = /^https:\/\/[^\s]+$/i;
/** Le sombre classique d'un pied de page — le défaut de l'éditeur. */
const DEFAULT_FOOTER_BACKGROUND = "#0f1f18";

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

/**
 * Les textes traduits de la section, **par whitelist de champs du kind** — même
 * discipline que le reste de ce fichier.
 *
 * Trois règles, les mêmes que pour `Procedure.translations` :
 *  • jamais de clé `fr` — le français est le champ de même nom ;
 *  • une chaîne vide est une **absence**, pas un texte vide (le Socle
 *    n'en stocke pas, mais la règle appartient au lecteur) ;
 *  • une langue dont aucun texte ne reste ne laisse pas d'entrée vide.
 *
 * ⚠️ Un `body` égaré sur une section `recherche` ne sort pas : il n'a pas de
 * français à replier, et le consommateur n'aurait rien à en faire.
 * Toujours émis, `{}` quand il n'y a rien : le consommateur écrit
 * `s.translations[lang]?.title ?? s.title` sans tester la présence.
 */
function translations(value: unknown, fields: readonly string[]): PortalSectionTranslationsDto {
  const out: PortalSectionTranslationsDto = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [rawCode, rawEntry] of Object.entries(value as Row)) {
    const code = rawCode.trim().toLowerCase();
    if (code === "" || code === "fr") continue;
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) continue;
    const entry: Record<string, string> = {};
    for (const field of fields) {
      const text = (rawEntry as Row)[field];
      if (typeof text === "string" && text.trim() !== "") entry[field] = text;
    }
    if (Object.keys(entry).length > 0) out[code] = entry;
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
    case "recherche": {
      // ⚠️ On ÉCARTE une adresse qu'on n'accepte pas, on ne la nettoie pas —
      // même parti que `texte-image`. Le bloc reste servi, sans fond : le
      // champ de recherche d'une collectivité n'a pas à disparaître avec son
      // habillage.
      const imageUrl = str(row.imageUrl);
      return {
        id,
        kind: "recherche",
        title,
        subtitle: str(row.subtitle),
        placeholder: str(row.placeholder),
        show_shortcuts: bool(row.showShortcuts, false),
        shortcuts: references(row.shortcuts, publishedIds),
        image_url: IMAGE_URL.test(imageUrl) ? imageUrl : "",
        // Les deux options n'ont de sens que sous une image, et sont servies
        // telles quelles même sans elle : le Socle les conserve quand l'adresse
        // est effacée (le réglage gouverne l'usage, pas la donnée), et c'est au
        // rendu de les ignorer tant qu'il n'y a rien à habiller.
        image_full_width: bool(row.imageFullWidth, false),
        image_fixed: bool(row.imageFixed, false),
        // Habillage des textes posés sur l'image — même régime : servi tel
        // quel, sans objet sans image. Une couleur inconnue retombe sur
        // l'encre du thème, le rendu d'avant l'option.
        text_color: row.textColor === "white" ? "white" : "theme",
        text_shadow: bool(row.textShadow, false),
        translations: translations(row.translations, ["title", "subtitle", "placeholder"]),
      };
    }
    case "demarches":
      return {
        id,
        kind: "demarches",
        title,
        columns: columns(row.columns),
        pinned_first: bool(row.pinnedFirst, false),
        pinned: references(row.pinned, publishedIds),
        // ⚠️ `false` par défaut : la clé manque exactement sur les pages
        // composées avant que ce filtre existe, et une page publiée ne gagne
        // pas un filtre que personne n'y a mis. L'éditeur, lui, le propose sur
        // toute grille neuve.
        audience_filter: bool(row.audienceFilter, false),
        translations: translations(row.translations, ["title"]),
      };
    case "actus":
      return {
        id,
        kind: "actus",
        title,
        layout: row.layout === "grid" ? "grid" : "list",
        count: columns(row.count),
        show_dates: bool(row.showDates, true),
        translations: translations(row.translations, ["title"]),
      };
    case "compte":
      return {
        id,
        kind: "compte",
        title,
        subtitle: str(row.subtitle),
        translations: translations(row.translations, ["title", "subtitle"]),
      };
    case "texte":
      return {
        id,
        kind: "texte",
        title,
        body: str(row.body),
        align: row.align === "center" ? "center" : "left",
        translations: translations(row.translations, ["title", "body"]),
      };
    case "texte-image": {
      // ⚠️ On ÉCARTE une adresse qu'on n'accepte pas, on ne la nettoie pas :
      // `javascript:` et `data:` n'ont pas de forme inoffensive qu'on saurait
      // reconstituer. Le bloc reste servi, sans image — le texte de la
      // collectivité n'a pas à disparaître avec son illustration.
      const imageUrl = str(row.imageUrl);
      return {
        id,
        kind: "texte-image",
        title,
        body: str(row.body),
        image_url: IMAGE_URL.test(imageUrl) ? imageUrl : "",
        alt: str(row.alt),
        layout: row.layout === "image-first" ? "image-first" : "text-first",
        translations: translations(row.translations, ["title", "body", "alt"]),
      };
    }
    case "footer": {
      // Les sous-blocs sont lus un par un, et seuls les bandeaux texte
      // passent : un sous-bloc abîmé n'emporte pas le pied de page.
      const children: PortalTexteSectionDto[] = [];
      if (Array.isArray(row.children)) {
        for (const child of row.children) {
          const section = serializeSection(child, publishedIds);
          if (section && section.kind === "texte") children.push(section);
        }
      }
      const background = str(row.background).toLowerCase();
      return {
        id,
        kind: "footer",
        title,
        background: HEX_COLOR.test(background) ? background : DEFAULT_FOOTER_BACKGROUND,
        columns: row.columns === 1 || row.columns === 2 ? row.columns : 3,
        children,
        translations: translations(row.translations, ["title"]),
      };
    }
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
