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

describe("l'OCR ne conserve ni le document ni le texte extrait", () => {
  // ⚠️ LA GARANTIE EST PLUS FORTE ICI QUE SUR LES COMPLÉTIONS, et c'est la
  // raison d'être de l'URL signée : l'octet du document ne traverse pas le
  // Socle du tout. Le jour où quelqu'un remplacerait l'URL par un envoi en
  // base64 « pour simplifier », il ferait entrer le document dans cette
  // fonction — donc dans ses journaux possibles — et perdrait la seule
  // garantie qui ne repose sur personne.
  it("le Socle ne télécharge jamais le document lui-même", () => {
    expect(index).toContain("callProviderOcr");
    // Un seul `fetch` légitime existe dans cette fonction : celui du
    // fournisseur, et il vit dans provider.ts. Aucun ici.
    expect(index).not.toMatch(/\bfetch\s*\(/);
    expect(index).not.toContain("include_image_base64");
  });

  it("aucun journal ne mentionne l'URL signée ni le texte extrait", () => {
    const calls = index.match(/console\.[a-z]+\([\s\S]*?\);/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      for (const forbidden of ["request.url", "result.pages", "page.markdown", "${text}"]) {
        expect(call).not.toContain(forbidden);
      }
    }
  });

  // Le texte extrait est la seule chose qui sort — vers l'appelant, dans la
  // réponse HTTP. Il n'est jamais écrit, et le journal ne peut pas le porter :
  // seule la RPC écrit, avec un nombre de jetons pour toute trace.
  it("le texte extrait ne franchit aucune écriture", () => {
    expect(index).not.toMatch(/from\(["']ai_usage_events["']\)[\s\S]{0,80}\.(insert|update|upsert)/);
    expect(index).toMatch(/p_actual_tokens:\s*actualTokens/);
  });

  it("le module d'appel OCR est le même module isolé", () => {
    expect(provider).toContain("/v1/ocr");
    expect(provider).not.toContain("createClient");
    expect(provider).not.toMatch(/console\./);
  });

  it("l'erreur brute du fournisseur n'est pas relayée non plus ici", () => {
    expect(index).toContain("La lecture de documents est momentanément indisponible");
    expect(index).not.toMatch(/errorResponse\(\s*"ai_unavailable",\s*result\.detail/);
  });
});

describe("les deux routes payantes passent par la même porte", () => {
  // ⚠️ UN SEUL CRÉDIT PAR COLLECTIVITÉ. Le jour où l'OCR aurait sa propre
  // réservation, sa propre table ou son propre plafond, une collectivité
  // aurait deux budgets à surveiller pour une seule facture — et l'éditeur
  // deux totaux à additionner à la main.
  it("l'OCR réserve et solde avec les mêmes RPC que les complétions", () => {
    expect(index.match(/reserve_ai_usage/g)?.length).toBeGreaterThanOrEqual(2);
    expect(index.match(/settle_ai_usage/g)?.length).toBeGreaterThanOrEqual(3);
    expect(index).toMatch(/p_resource_type:\s*"ocr"/);
  });

  // Les deux refus doivent se dire avec les mêmes mots : deux formulations
  // obligeraient chaque consommateur à reconnaître deux formes.
  it("les deux refus sont fabriqués au même endroit", () => {
    expect(index.match(/rateLimitedResponse\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(index.match(/quotaExceededResponse\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("la voix ne laisse aucune trace", () => {
  // ⚠️ L'AUDIO TRAVERSE LE SOCLE — c'est la seule route où l'octet de
  // l'usager entre dans la fonction. La garantie ne tient donc plus à une URL
  // signée : elle tient à ce qu'aucun chemin d'écriture ne voie ni l'audio, ni
  // le texte transcrit, ni le texte prononcé.
  const audio = read("./audio.ts");

  it("aucun journal ne mentionne l'audio, le texte transcrit ou le texte prononcé", () => {
    const calls = index.match(/console\.[a-z]+\([\s\S]*?\);/g) ?? [];
    for (const call of calls) {
      for (const forbidden of ["request.audio", "request.text", "result.text", "result.audio", "form", "raw"]) {
        expect(call).not.toContain(forbidden);
      }
    }
  });

  it("rien n'est écrit dans un stockage, et la réponse audio n'est pas mise en cache", () => {
    expect(index).not.toMatch(/\.storage\b/);
    expect(index).toContain(`"Cache-Control": "no-store"`);
  });

  it("le module audio ne sait rien écrire", () => {
    expect(audio).not.toContain("createClient");
    expect(audio).not.toMatch(/console\./);
    expect(audio).not.toMatch(/\bfetch\s*\(/);
  });

  it("le module d'appel audio est le même module isolé", () => {
    expect(provider).toContain("/v1/audio/transcriptions");
    expect(provider).toContain("/v1/audio/speech");
    expect(provider).not.toContain("createClient");
    expect(provider).not.toMatch(/console\./);
  });

  // Un CRÉDIT par collectivité, encore : la voix réserve et solde par les
  // mêmes RPC, et sa nature est fixée par le Socle, jamais par l'appelant —
  // c'est elle qui choisit le seau de cadence.
  it("la voix passe par la même porte, avec une nature fixée par le Socle", () => {
    expect(index).toMatch(/p_resource_type:\s*resourceType/);
    expect(index).toContain(`reserveAudio("transcription"`);
    expect(index).toContain(`reserveAudio("speech"`);
    expect(index).not.toMatch(/p_resource_type:\s*(raw|request)\./);
  });

  it("l'erreur brute du fournisseur n'est pas relayée non plus ici", () => {
    expect(index).toContain("La transcription est momentanément indisponible");
    expect(index).toContain("La synthèse vocale est momentanément indisponible");
  });
});
