import { describe, expect, it } from "vitest";
import {
  ACCESSIBILITY_STATEMENT_SLUG,
  hasPublishedContent,
  readContentBody,
  serializePortalContent,
} from "./portalContent.ts";

/**
 * ⚠️ **Miroir volontaire** de `src/features/portal/portalContent.test.ts` : les
 * deux lisent la même colonne avec la même tolérance.
 */
describe("readContentBody", () => {
  it("rend une chaîne vide pour ce qui n'est pas un contenu", () => {
    for (const raw of [null, undefined, "texte", 42, [], { body: 42 }]) {
      expect(readContentBody(raw)).toBe("");
    }
  });

  it("écarte un texte démesuré plutôt que de le tronquer au milieu d'une phrase", () => {
    expect(readContentBody({ body: "a".repeat(50_001) })).toBe("");
    expect(readContentBody({ body: "a".repeat(50_000) })).toHaveLength(50_000);
  });
});

describe("hasPublishedContent", () => {
  it("⚠️ une déclaration publiée vide n'est pas une déclaration publiée", () => {
    // Publier le site publie aussi une déclaration que personne n'a écrite.
    expect(hasPublishedContent({ body: "" })).toBe(false);
    expect(hasPublishedContent({ body: "  \n " })).toBe(false);
    expect(hasPublishedContent(null)).toBe(false);
    expect(hasPublishedContent({ body: "# État de conformité" })).toBe(true);
  });
});

describe("serializePortalContent", () => {
  const meta = { slug: ACCESSIBILITY_STATEMENT_SLUG, published_at: "2026-09-18T10:00:00Z" };

  it("sert le texte en Markdown, avec son slug et sa date", () => {
    expect(serializePortalContent({ body: "# Titre" }, meta)).toEqual({
      slug: "accessibilite",
      published_at: "2026-09-18T10:00:00Z",
      format: "markdown",
      body: "# Titre",
    });
  });

  it("rien à servir ⇒ null (la route répond 404)", () => {
    expect(serializePortalContent({ body: " " }, meta)).toBeNull();
    expect(serializePortalContent(null, meta)).toBeNull();
  });

  it("whitelist : seul `body` sort du JSON stocké", () => {
    const dto = serializePortalContent({ body: "x", draftNote: "interne", html: "<b>" }, meta);
    expect(Object.keys(dto ?? {}).sort()).toEqual(["body", "format", "published_at", "slug"]);
  });
});
