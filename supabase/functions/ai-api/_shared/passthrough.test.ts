import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * LE PASSE-PLAT, RENDU VÉRIFIABLE.
 *
 * Affirmer « le Socle ne conserve pas le prompt » ne vaut rien. Quatre
 * mécanismes le tiennent, du plus fort au plus faible :
 *
 *  1. LE SCHÉMA — aucune colonne d'`ai_usage_events` ne peut porter du texte
 *     métier. Épinglé par `supabase/tests/plafond-ia.test.sql` (cas Q9).
 *  2. LES SIGNATURES DE RPC — que des bigint, des uuid et des énumérés courts.
 *  3. L'ISOLATION DU MODULE D'APPEL — `provider.ts` ne reçoit ni client de
 *     base ni logger. Épinglé par `provider.test.ts`.
 *  4. CE FICHIER — il lit le source et attrape la régression réaliste : le
 *     `console.log` ajouté pendant un incident, le `JSON.stringify(body)`
 *     « juste pour voir », l'écriture directe dans le journal.
 *
 * Grossier, assumé, et c'est celui qui sert le jour où quelqu'un débogue.
 */

/**
 * ⚠️ On scanne le CODE, pas la prose. Les en-têtes de ces fichiers expliquent
 * précisément ce qu'ils interdisent (« ne jamais basculer sur
 * /v1/conversations », « ni logger »…) : sans retirer les commentaires, le
 * test se déclencherait sur sa propre documentation. Les `//` en milieu de
 * ligne sont préservés — sinon `https://api.mistral.ai` disparaîtrait.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

const read = (relative: string) =>
  stripComments(readFileSync(new URL(relative, import.meta.url), "utf8"));

const index = read("../index.ts");
const provider = read("./provider.ts");

describe("le Socle ne conserve ni le prompt ni la réponse", () => {
  it("aucun journal ne mentionne le contenu de la requête ou de la réponse", () => {
    // On isole les appels à console.* et on vérifie leurs arguments.
    const calls = index.match(/console\.[a-z]+\([\s\S]*?\);/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      for (const forbidden of ["request.system", "request.messages", "result.answer", "choices", ".content"]) {
        expect(call).not.toContain(forbidden);
      }
    }
  });

  // ⚠️ Nuance qui compte : `JSON.stringify(payload)` est LÉGITIME — c'est le
  // corps envoyé au fournisseur. Ce qui est interdit, c'est de sérialiser quoi
  // que ce soit DANS un journal. La règle dit donc ce qu'elle veut dire.
  it("rien n'est sérialisé à l'intérieur d'un journal", () => {
    for (const source of [index, provider]) {
      const calls = source.match(/console\.[a-z]+\([\s\S]*?\);/g) ?? [];
      for (const call of calls) {
        expect(call).not.toContain("JSON.stringify");
      }
    }
  });

  // Le seul écrivain du journal est la RPC : une écriture directe permettrait
  // d'y glisser une colonne de texte demain.
  it("le journal n'est jamais écrit en direct — seule la RPC écrit", () => {
    expect(index).not.toMatch(/from\(["']ai_usage_events["']\)[\s\S]{0,80}\.(insert|update|upsert)/);
    expect(index).toContain("reserve_ai_usage");
    expect(index).toContain("settle_ai_usage");
  });

  it("le module d'appel ne reçoit ni client de base, ni logger", () => {
    expect(provider).not.toContain("createClient");
    expect(provider).not.toContain("supabase");
    expect(provider).not.toMatch(/console\./);
  });

  // /v1/conversations stockerait le fil chez le fournisseur : ce serait
  // persister là-bas ce qu'on refuse de garder ici.
  it("n'utilise jamais l'API à état du fournisseur", () => {
    expect(provider).toContain("/v1/agents/completions");
    expect(provider).toContain("/v1/chat/completions");
    expect(provider).not.toContain("/v1/conversations");
  });

  it("l'erreur brute du fournisseur n'est jamais relayée à l'appelant", () => {
    // La réponse 502 porte une phrase fixe, pas le détail.
    expect(index).toContain("L'assistant est momentanément indisponible");
    expect(index).not.toMatch(/errorResponse\(\s*"ai_unavailable",\s*result\.detail/);
  });
});

describe("l'imputation ne vient jamais du corps de la requête", () => {
  it("le consommateur est lu sur la clé API", () => {
    expect(index).toMatch(/apiKey\.consumer/);
    expect(index).not.toMatch(/p_consumer:\s*(raw|request)\./);
  });

  it("l'organisation vient de la clé ou de l'en-tête, jamais du corps", () => {
    expect(index).toContain("x-organization-id");
    expect(index).toContain("resolveRootOrgId");
    expect(index).not.toMatch(/p_org_id:\s*(raw|request)\./);
  });
});
