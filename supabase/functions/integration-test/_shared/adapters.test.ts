import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { arpegeAdapter, getAdapter, presentKeys, readValues } from "./adapters";

const SETTINGS = { api_base_url: "https://api.espace-citoyens.net/demo/", client_id: "cid" };
const SECRETS = { client_secret: "s3cret-value" };

function fakeFetch(status: number, body: string) {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe("arpegeAdapter.isComplete — règle de resolveHawkCredentials", () => {
  const complete = (keys: string[]) => arpegeAdapter.isComplete(new Set(keys));

  it("URL + identifiant + secret client", () => {
    expect(complete(["api_base_url", "client_id", "client_secret"])).toBe(true);
  });
  it("URL + jeton seul (ancien mode, Ariane)", () => {
    expect(complete(["api_base_url", "access_token"])).toBe(true);
  });
  it("le jeton supplée le champ manquant", () => {
    expect(complete(["api_base_url", "client_id", "access_token"])).toBe(true);
  });
  it("sans URL, ou sans secret, incomplète", () => {
    expect(complete(["client_id", "client_secret"])).toBe(false);
    expect(complete(["api_base_url", "client_id"])).toBe(false);
  });
});

describe("arpegeAdapter.test", () => {
  it("appelle GET /v2/Hello signé Hawk, sur l'URL normalisée", async () => {
    const fetchImpl = fakeFetch(200, JSON.stringify({ IsSuccess: true }));
    const result = await arpegeAdapter.test(SETTINGS, SECRETS, fetchImpl);
    expect(result).toEqual({ ok: true, message: "Connexion réussie avec l'API Arpège." });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.espace-citoyens.net/demo/v2/Hello");
    expect(init.headers.Authorization).toMatch(/^Hawk id="cid", ts="\d+", nonce="\w{6}", hash="[^"]+", mac="[^"]+"$/);
  });

  it("ne contacte rien sans identifiants", async () => {
    const fetchImpl = fakeFetch(200, "{}");
    const result = await arpegeAdapter.test({ api_base_url: "https://x.test" }, {}, fetchImpl);
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuse une URL en http", async () => {
    const fetchImpl = fakeFetch(200, "{}");
    const result = await arpegeAdapter.test({ ...SETTINGS, api_base_url: "http://x.test" }, SECRETS, fetchImpl);
    expect(result).toEqual({ ok: false, message: "L'URL de l'API doit commencer par https://." });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("401 : identifiants refusés", async () => {
    const result = await arpegeAdapter.test(SETTINGS, SECRETS, fakeFetch(401, "nope"));
    expect(result).toEqual({ ok: false, message: "Identifiants refusés par Arpège (HTTP 401)." });
  });

  it("enveloppe Arpège IsSuccess:false : code et libellé", async () => {
    const body = JSON.stringify({ IsSuccess: false, CodErreur: "E42", LibErreur: "Compte suspendu" });
    const result = await arpegeAdapter.test(SETTINGS, SECRETS, fakeFetch(200, body));
    expect(result).toEqual({ ok: false, message: "E42 : Compte suspendu" });
  });

  it("le message d'erreur est borné et ne porte jamais le secret", async () => {
    const result = await arpegeAdapter.test(SETTINGS, SECRETS, fakeFetch(500, "x".repeat(1000)));
    expect(result.ok).toBe(false);
    expect(result.message.length).toBeLessThanOrEqual(201);
    expect(result.message).not.toContain(SECRETS.client_secret);
  });

  it("réseau en échec : message lisible", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const result = await arpegeAdapter.test(SETTINGS, SECRETS, fetchImpl);
    expect(result).toEqual({ ok: false, message: "Arpège injoignable à cette adresse." });
  });
});

describe("outils", () => {
  it("getAdapter : inconnu ou NULL → null", () => {
    expect(getAdapter("arpege")).toBe(arpegeAdapter);
    expect(getAdapter(null)).toBeNull();
    expect(getAdapter("ixbus")).toBeNull();
  });
  it("readValues ne garde que les chaînes", () => {
    expect(readValues({ a: "x", b: 1, c: null })).toEqual({ a: "x" });
    expect(readValues(null)).toEqual({});
    expect(readValues(["x"])).toEqual({});
  });
  it("presentKeys : paramètres non vides + secrets présents", () => {
    expect([...presentKeys({ a: "x", b: "  " }, ["s"])].sort()).toEqual(["a", "s"]);
  });
});

describe("index.ts — aucun secret dans les journaux", () => {
  const source = readFileSync(join(__dirname, "..", "index.ts"), "utf8");

  // Seule forme admise : un libellé fixe, et le CODE de l'erreur Postgres.
  // Ni secret, ni en-tête, ni configuration, ni message du partenaire.
  it("tout console.* n'a qu'un libellé fixe et un code d'erreur", () => {
    const logs = source.match(/console\.\w+\([^;]*\);/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).toMatch(/^console\.error\("[^"`$]*", \w+\.code\);$/);
    }
  });
});
