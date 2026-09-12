import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * « AUCUNE DONNÉE PERSONNELLE », RENDU VÉRIFIABLE.
 *
 * C'est sur cette phrase que repose l'absence de bandeau de consentement sur
 * les portails des collectivités. L'affirmer ne vaut rien ; quatre mécanismes
 * la tiennent, du plus fort au plus faible :
 *
 *  1. LE SCHÉMA — aucune colonne des deux tables ne peut porter un
 *     identifiant. Épinglé par `supabase/tests/audience.test.sql` (cas R1),
 *     qui fige la liste EXACTE des colonnes.
 *  2. LES SIGNATURES DE RPC — deux uuid, trois énumérés courts, un booléen.
 *  3. LA WHITELIST DU CORPS — toute clé inconnue est un 400
 *     (`validation.test.ts`).
 *  4. CE FICHIER — il lit le source et attrape la régression réaliste : le
 *     `console.log(body)` ajouté pendant un incident, le `x-forwarded-for`
 *     « juste pour freiner », l'écriture directe dans les tables.
 *
 * Grossier, assumé, et c'est celui qui sert le jour où quelqu'un débogue.
 *
 * Motif `ai-api/_shared/passthrough.test.ts`.
 */

/**
 * ⚠️ On scanne le CODE, pas la prose. L'en-tête d'`index.ts` explique
 * précisément ce qu'il s'interdit (« ni User-Agent, ni référent »…) : sans
 * retirer les commentaires, le test se déclencherait sur sa propre
 * documentation. Les `//` en milieu de ligne sont préservés.
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
const validation = read("./validation.ts");

describe("la fonction ne lit jamais ce qui identifierait un visiteur", () => {
  // Ces quatre en-têtes sont les seuls moyens, dans une edge function, de
  // remonter à une personne. Ne pas les lire est plus fort que de promettre de
  // ne pas les écrire.
  it("aucun en-tête identifiant n'est lu", () => {
    for (const header of ["user-agent", "x-forwarded-for", "cf-connecting-ip", "referer", "x-real-ip"]) {
      expect(index.toLowerCase()).not.toContain(`"${header}"`);
      expect(index.toLowerCase()).not.toContain(`'${header}'`);
    }
  });

  // Seuls quatre en-têtes sont lus, et on les nomme : deux d'acheminement
  // (reconstruction de l'URL publique du contrat) et l'autorisation.
  it("les seuls en-têtes lus sont ceux du routage et de la clé", () => {
    const reads = index.match(/headers\.get\(([^)]*)\)/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    for (const call of reads) {
      expect(call).toMatch(/Authorization|x-forwarded-proto|x-forwarded-host/i);
    }
  });
});

describe("rien du corps de la requête n'atteint un journal", () => {
  it("aucun journal ne mentionne la charge utile", () => {
    const calls = index.match(/console\.[a-z]+\([\s\S]*?\);/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      for (const forbidden of ["raw", "view.", "deposit.", "parsed", "req.", "JSON.stringify"]) {
        expect(call).not.toContain(forbidden);
      }
    }
  });
});

describe("seules les RPC écrivent", () => {
  // Une écriture directe permettrait d'y glisser une colonne demain, sans
  // passer par la migration qui porte la promesse.
  it("les tables ne sont jamais écrites en direct", () => {
    for (const table of ["portal_audience_pages", "portal_audience_breakdown"]) {
      expect(index).not.toContain(table);
    }
    expect(index).toContain("record_portal_page_view");
    expect(index).toContain("record_portal_deposit");
  });

  // La seule écriture directe admise est la trace d'usage de la clé — une
  // horodate sur `api_keys`, qui ne dit rien du visiteur.
  it("la seule écriture directe est l'horodate de la clé", () => {
    const writes = index.match(/\.from\(["'][^"']+["']\)[\s\S]{0,120}?\.(insert|update|upsert)/g) ?? [];
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("api_keys");
    expect(index).toMatch(/\.update\(\{\s*last_used_at/);
  });
});

describe("le tenant est toujours recoupé avec le périmètre de la clé", () => {
  // Le `tenant_id` vient du CORPS (l'appelant est un relais multi-collectivités) :
  // sans ce recoupement, une clé compromise gonflerait les chiffres de
  // n'importe quelle collectivité de la plateforme.
  it("le périmètre est calculé par la RPC désignée, et l'appartenance vérifiée", () => {
    expect(index).toContain("scopeRequest");
    expect(index).toMatch(/includes\(tenantId\)/);
    // Hors périmètre = 404, jamais 403 : on ne renseigne pas sur l'existence
    // des collectivités.
    expect(index).toMatch(/errorResponse\("not_found", "Organisation introuvable\."/);
  });

  it("aucun chemin n'écrit sans être passé par le périmètre", () => {
    // Autant d'appels au périmètre que de RPC d'écriture.
    const scopeChecks = index.match(/await inScope\(/g) ?? [];
    const writes = index.match(/admin\.rpc\("record_portal_/g) ?? [];
    expect(scopeChecks.length).toBe(writes.length);
    expect(writes.length).toBe(2);
  });
});

describe("le parseur n'ouvre aucune porte", () => {
  it("la liste des clés acceptées est close, et ne contient rien d'identifiant", () => {
    const keys = validation.match(/_KEYS = \[([^\]]*)\]/g)?.join(" ") ?? "";
    expect(keys).not.toBe("");
    for (const forbidden of ["visitor", "ip", "user_agent", "referrer", "session", "url"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  // Le jour ne vient JAMAIS de l'appelant : une horloge décalée ferait
  // atterrir des vues dans un futur qu'aucune période n'affiche.
  it("aucune date ne traverse le corps", () => {
    expect(validation).not.toMatch(/\bday\b/);
    expect(index).not.toMatch(/p_day/);
  });
});
