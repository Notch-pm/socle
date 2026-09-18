/**
 * Contenus publiés du site de démarches — ce que `GET /v1/portal/content` sert,
 * et ce qui décide si la mention d'accessibilité porte son lien. Logique pure,
 * testée.
 *
 * ⚠️ **Miroir volontaire** de `src/features/portal/portalContent.ts` (motif
 * `portalTheme.ts`) : une edge function ne peut rien importer de `src/`. Les
 * deux lisent le même JSON avec la même tolérance, et les tests des deux côtés
 * l'épinglent.
 *
 * ⚠️ **UN CONTENU VIDE N'EST PAS UN CONTENU PUBLIÉ.** Publier le site publie
 * aussi une déclaration que personne n'a encore écrite — `{ body: "" }`, avec
 * sa date. La servir rendrait une page blanche sous le titre « Déclaration
 * d'accessibilité » ; c'est un 404, et la mention ne porte pas de lien.
 */
import type { PortalContentDto } from "./dto.ts";

/** Miroir de `MAX_CONTENT_BODY_LENGTH`. */
const MAX_CONTENT_BODY_LENGTH = 50_000;

/** Le slug de la déclaration d'accessibilité — miroir de `ACCESSIBILITY_STATEMENT_SLUG`. */
export const ACCESSIBILITY_STATEMENT_SLUG = "accessibilite";

/**
 * Le texte d'un contenu stocké, lu avec tolérance : ce qui n'est pas un objet,
 * ou un texte démesuré, rend une chaîne vide — jamais un texte tronqué.
 */
export function readContentBody(published: unknown): string {
  if (!published || typeof published !== "object" || Array.isArray(published)) return "";
  const body = (published as Record<string, unknown>).body;
  return typeof body === "string" && body.length <= MAX_CONTENT_BODY_LENGTH ? body : "";
}

/** Y a-t-il quelque chose à servir ? Des blancs ne sont pas un texte. */
export function hasPublishedContent(published: unknown): boolean {
  return readContentBody(published).trim() !== "";
}

/**
 * Contenu publié → DTO, ou `null` quand il n'y a rien à servir (la route répond
 * alors 404). Whitelist : seul `body` sort du JSON stocké.
 */
export function serializePortalContent(
  published: unknown,
  meta: { slug: string; published_at: string },
): PortalContentDto | null {
  const body = readContentBody(published);
  if (body.trim() === "") return null;
  return { slug: meta.slug, published_at: meta.published_at, format: "markdown", body };
}
