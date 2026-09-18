import { describe, expect, it } from "vitest";
import {
  ACCESSIBILITY_STATEMENT_SLUG,
  accessibilityStatementTemplate,
  defaultPortalContent,
  hasContentBody,
  MAX_CONTENT_BODY_LENGTH,
  parsePortalContent,
  PORTAL_CONTENTS,
} from "./portalContent";

describe("catalogue des contenus", () => {
  it("porte la déclaration d'accessibilité, à l'adresse que Nora sert", () => {
    const entry = PORTAL_CONTENTS.find((c) => c.slug === ACCESSIBILITY_STATEMENT_SLUG);
    expect(entry?.path).toBe("/accessibilite");
  });

  it("⚠️ chaque slug a la forme que la base accepte (portal_contents_slug_form)", () => {
    for (const entry of PORTAL_CONTENTS) {
      expect(entry.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(entry.slug.length).toBeLessThanOrEqual(64);
    }
  });
});

describe("parsePortalContent", () => {
  it("rend un contenu vide pour ce qui n'est pas un objet", () => {
    for (const raw of [null, undefined, "texte", 42, []]) {
      expect(parsePortalContent(raw)).toEqual(defaultPortalContent());
    }
  });

  it("relit ce qu'il a écrit", () => {
    const content = { body: "# État de conformité\n\nPartiellement conforme." };
    expect(parsePortalContent(JSON.parse(JSON.stringify(content)))).toEqual(content);
  });

  it("écarte un texte démesuré plutôt que de le tronquer au milieu d'une phrase", () => {
    expect(parsePortalContent({ body: "a".repeat(MAX_CONTENT_BODY_LENGTH + 1) }).body).toBe("");
    expect(parsePortalContent({ body: "a".repeat(MAX_CONTENT_BODY_LENGTH) }).body).toHaveLength(
      MAX_CONTENT_BODY_LENGTH,
    );
  });

  it("ignore les clés qu'il ne connaît pas", () => {
    expect(parsePortalContent({ body: "x", html: "<script>" })).toEqual({ body: "x" });
  });
});

describe("hasContentBody", () => {
  it("des blancs ne sont pas un texte", () => {
    expect(hasContentBody({ body: "" })).toBe(false);
    expect(hasContentBody({ body: " \n\t " })).toBe(false);
    expect(hasContentBody({ body: "Déclaration" })).toBe(true);
  });
});

describe("accessibilityStatementTemplate", () => {
  const template = accessibilityStatementTemplate({
    name: "Laurentville",
    email: "accessibilite@laurentville.fr",
    address: "1 place de la Mairie\n12345 Laurentville",
  });

  it("suit la structure du modèle de la DINUM", () => {
    for (const heading of [
      "# État de conformité",
      "# Résultats des tests",
      "# Contenus non accessibles",
      "# Établissement de cette déclaration d'accessibilité",
      "# Retour d'information et contact",
      "# Voies de recours",
    ]) {
      expect(template).toContain(heading);
    }
  });

  it("pré-remplit ce que le Socle sait de la collectivité", () => {
    expect(template).toContain("Laurentville s'engage");
    expect(template).toContain("par courriel : accessibilite@laurentville.fr");
    // Une adresse sur plusieurs lignes tient sur une seule dans la liste.
    expect(template).toContain("par courrier : 1 place de la Mairie, 12345 Laurentville.");
  });

  it("⚠️ n'affirme AUCUN résultat d'audit à la place de la collectivité", () => {
    // L'état de conformité, le taux et la date sont des déclarations
    // engageantes : le modèle les laisse entre crochets.
    expect(template).toContain("**[totalement / partiellement / non] conforme**");
    expect(template).toContain("[X] % des critères");
    expect(template).toContain("établie le [date]");
  });

  it("laisse des crochets là où le Socle ne sait rien", () => {
    const bare = accessibilityStatementTemplate({ name: "  ", email: null, address: " " });
    expect(bare).toContain("[nom de la collectivité] s'engage");
    expect(bare).toContain("par courriel : [adresse électronique]");
    expect(bare).toContain("par courrier : [adresse postale]");
  });
});
