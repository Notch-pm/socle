import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `AGENTS.md` est le nom que lisent les outils autres que Claude Code ; son
 * contenu est le même que celui de `CLAUDE.md`. Comme pour `apiKeyAuth.ts`,
 * copié dans les quatre edge functions : **la duplication est acceptée, la
 * dérive ne l'est pas**.
 *
 * ⚠️ Ce test n'existe pas par goût de la symétrie. Jusqu'au 2026-09-18,
 * `AGENTS.md` était un instantané du 23 août : il annonçait encore comme
 * « placeholder » une étape livrée depuis, et il lui manquait neuf sections de
 * features entières. Personne ne l'avait vu, parce qu'une copie périmée ne lève
 * aucune erreur — elle se contente d'être crue.
 */
const root = new URL("../", import.meta.url);

const read = (name: string) => readFileSync(new URL(name, root), "utf8");

describe("AGENTS.md est le miroir de CLAUDE.md", () => {
  it("les deux fichiers sont byte-identiques", () => {
    const claude = read("CLAUDE.md");
    const agents = read("AGENTS.md");

    // Message d'échec utile : le correctif tient en une commande.
    if (agents !== claude) {
      const claudeLines = claude.split("\n");
      const agentsLines = agents.split("\n");
      // `findIndex` rend -1 quand la dérive est un AJOUT en fin de fichier :
      // aucune ligne commune ne diffère. Annoncer « ligne 0 » enverrait
      // chercher au mauvais endroit.
      const differing = claudeLines.findIndex((line, i) => agentsLines[i] !== line);
      const where =
        differing >= 0
          ? `première divergence ligne ${differing + 1}`
          : "contenu commun identique, seule la longueur diffère";
      throw new Error(
        `AGENTS.md a dérivé de CLAUDE.md (${where} ; ` +
          `${claudeLines.length} lignes contre ${agentsLines.length}). ` +
          "Recopier le fichier de référence : cp CLAUDE.md AGENTS.md",
      );
    }
    expect(agents).toBe(claude);
  });

  it("⚠️ le miroir se dit dans le CONTENU, donc dans les deux copies", () => {
    // Écrire la règle ailleurs (ici, ou dans un README) laisserait un lecteur
    // d'AGENTS.md ignorer qu'il lit une copie — et l'éditer seul.
    const agents = read("AGENTS.md");
    expect(agents).toContain("`AGENTS.md` est une copie BYTE-IDENTIQUE de ce fichier");
    expect(agents).toContain("cp CLAUDE.md AGENTS.md");
  });
});
