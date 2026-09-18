import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `CLAUDE.md` est chargé en entier à chaque session d'agent ; au-delà de
 * 40 000 caractères, Claude Code le signale comme trop lourd.
 *
 * ⚠️ Il en faisait 150 000 le 2026-09-18 : chaque feature y avait déposé ses
 * pièges, un paragraphe à la fois, et personne ne voyait le total monter. Le
 * détail d'une feature vit depuis dans sa fiche `docs/features/*.md` ; ici ne
 * reste qu'un index. Ce test tient la limite, et vérifie que l'index et les
 * fiches ne se perdent pas de vue — une fiche que rien ne cite ne serait jamais
 * lue, un lien vers une fiche absente enverrait chercher dans le vide.
 */
const root = new URL("../", import.meta.url);

const LIMIT = 40_000;

const claude = readFileSync(new URL("CLAUDE.md", root), "utf8");

describe("CLAUDE.md reste un index", () => {
  it(`tient sous ${LIMIT} caractères`, () => {
    if (claude.length >= LIMIT) {
      throw new Error(
        `CLAUDE.md fait ${claude.length} caractères (limite ${LIMIT}). ` +
          "Déplacer le détail dans la fiche docs/features/ de la feature concernée : " +
          "l'index ne garde que ce qu'il faut savoir avant de l'ouvrir.",
      );
    }
    expect(claude.length).toBeLessThan(LIMIT);
  });

  it("chaque fiche citée existe, et chaque fiche est citée", () => {
    const cited = new Set(
      [...claude.matchAll(/\]\(docs\/features\/([^)]+\.md)\)/g)].map((m) => m[1]),
    );
    const onDisk = new Set(
      readdirSync(new URL("docs/features/", root)).filter((f) => f.endsWith(".md")),
    );

    expect(cited.size).toBeGreaterThan(0);
    expect([...cited].filter((f) => !onDisk.has(f))).toEqual([]);
    expect([...onDisk].filter((f) => !cited.has(f))).toEqual([]);
  });
});
