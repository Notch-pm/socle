import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * Toute edge function doit au moins PARSER.
 *
 * ⚠️ POURQUOI CE TEST EXISTE, et pourquoi il ne fait pas semblant d'en faire
 * plus. `npm run lint` (`tsc -b`) ne regarde QUE `src` : `tsconfig.app.json`
 * l'énonce en une ligne, `"include": ["src"]`. Les edge functions ne sont donc
 * typées par personne — ni par la CI, ni par le hook de pre-commit — et la
 * seule chose qui les compile est le déploiement lui-même, chez Supabase,
 * après coup.
 *
 * Le 2026-08-29, `ai-api/index.ts` a passé lint, 423 tests et un commit avec
 * une **chaîne non terminée** (un `join("` suivi de vrais retours à la ligne,
 * là où il fallait `join("\n\n---\n\n")`). Rien ne pouvait l'attraper : les
 * tests unitaires n'importent que les modules purs de `_shared`, et
 * `passthrough.test.ts` lit `index.ts` comme du TEXTE, jamais comme du code.
 * La fonction n'aurait simplement pas démarré en production.
 *
 * ⚠️ CE TEST NE TYPE PAS, IL PARSE — et la distinction est volontaire. Typer
 * du Deno avec les types de Node produirait un torrent de faux positifs
 * (`Deno.env`, imports `https://`, `npm:`) qu'on finirait par ignorer, donc
 * par désactiver. Une erreur de SYNTAXE, elle, n'a jamais de faux positif :
 * ce qui ne parse pas ne s'exécute pas, quel que soit le runtime. Un garde-fou
 * étroit qu'on croit vaut mieux qu'un large qu'on éteint.
 */

const ROOT = join(process.cwd(), "supabase", "functions");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Diagnostics de PARSING seuls — les codes TS1xxx. */
function syntaxErrors(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  // `parseDiagnostics` n'est pas dans les types publics : c'est pourtant la
  // seule façon d'obtenir les erreurs de syntaxe sans monter un Program
  // complet (qui exigerait de résoudre des imports Deno introuvables ici).
  const diagnostics =
    (source as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
  return diagnostics.map((d) => {
    const message = ts.flattenDiagnosticMessageText(d.messageText, " ");
    const line = d.start !== undefined
      ? source.getLineAndCharacterOfPosition(d.start).line + 1
      : 0;
    return `${file}:${line} — TS${d.code} ${message}`;
  });
}

describe("edge functions — elles doivent au moins parser", () => {
  const files = sourceFiles(ROOT);

  it("trouve bien des sources à vérifier", () => {
    // Sans cette assertion, un chemin cassé rendrait le test vert sur zéro
    // fichier — la pire forme de garde-fou : celle qui rassure sans rien voir.
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)("%s parse sans erreur de syntaxe", (file) => {
    expect(syntaxErrors(file)).toEqual([]);
  });
});
