import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * LE PASSE-PLAT S'ÉTEND À CETTE FONCTION.
 *
 * `ai-api` promet de ne conserver ni le prompt ni la réponse, et quatre
 * mécanismes l'y tiennent (voir son `passthrough.test.ts`). Cette fonction-ci
 * est en amont du guichet : les textes de la démarche la traversent (libellé,
 * descriptif court), et leurs traductions en reviennent. La promesse ne vaudrait rien si le texte s'arrêtait
 * ici en chemin.
 *
 * Deux règles, vérifiées sur le SOURCE parce que c'est là que la régression
 * arrive — le `console.log` ajouté un soir d'incident, jamais retiré :
 *
 *  1. aucun journal ne porte les textes, les langues demandées ou la réponse ;
 *  2. cette fonction n'appelle PAS le fournisseur. Elle appelle `ai-api`, sans
 *     quoi le plafond, la cadence et le journal auraient deux implémentations.
 */

/** On scanne le CODE, pas la prose : l'en-tête décrit ce qu'il interdit. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

const index = stripComments(readFileSync(new URL("../index.ts", import.meta.url), "utf8"));

describe("les textes traversent, ils ne s'arrêtent pas", () => {
  it("aucun journal ne mentionne les textes, les cibles ou la traduction", () => {
    const calls = index.match(/console\.[a-z]+\([\s\S]*?\);/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      for (
        const forbidden of [
          "request.label",
          "request.fields",
          "field.value",
          "request.targets",
          "prompt.",
          "targets",
          "answer",
          "body?.answer",
          "JSON.stringify",
        ]
      ) {
        expect(call).not.toContain(forbidden);
      }
    }
  });

  it("appelle le guichet, jamais le fournisseur", () => {
    expect(index).toContain("/functions/v1/ai-api/v1/completions");
    // Ni l'API du fournisseur, ni sa clé : elles ne quittent pas `ai-api`.
    expect(index).not.toContain("api.mistral.ai");
    expect(index).not.toContain("MISTRAL_API_KEY");
  });

  it("attend le guichet PLUS longtemps que le guichet n'attend le fournisseur", () => {
    // Chaîne de délais : fournisseur 55 s < ai-api 60 s < ici. Inversée, on
    // abandonnerait des appels que le Socle termine et facture.
    const match = /AI_API_TIMEOUT_MS = (\d[\d_]*)/.exec(index);
    expect(match).not.toBeNull();
    expect(Number(match![1].replace(/_/g, ""))).toBeGreaterThan(60_000);
  });

  it("n'écrit jamais avec la service role : l'autorisation est celle de l'appelant", () => {
    expect(index).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(index).toContain("is_org_admin");
  });
});
