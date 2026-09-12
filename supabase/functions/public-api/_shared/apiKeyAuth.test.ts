import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  API_KEY_COLUMNS,
  evaluateApiKey,
  PLATFORM_WITHOUT_APPLICATION_MESSAGE,
  scopeRequest,
  UNAUTHORIZED_MESSAGE,
  type ApiKeyRow,
} from "./apiKeyAuth";

const NOW = new Date("2026-09-08T12:00:00Z");

function row(over: Partial<ApiKeyRow> = {}): ApiKeyRow {
  return {
    id: "key-1",
    organization_id: "org-root",
    revoked_at: null,
    expires_at: null,
    scopes: ["read"],
    consumer: null,
    ...over,
  };
}

const READ = { requiredScope: "read", scopeMessage: "scope read requis", now: NOW };

describe("evaluateApiKey — 401 : la clé n'existe pas, ou plus", () => {
  it("refuse une clé absente, révoquée ou expirée avec le même message", () => {
    // Un seul message pour les trois : dire lequel renseignerait un attaquant.
    for (const candidate of [
      null,
      row({ revoked_at: "2026-09-01T00:00:00Z" }),
      row({ expires_at: "2026-09-07T23:59:59Z" }),
    ]) {
      const decision = evaluateApiKey(candidate, READ);
      expect(decision).toEqual({ ok: false, code: "unauthorized", message: UNAUTHORIZED_MESSAGE });
    }
  });

  it("accepte une clé qui expire plus tard", () => {
    expect(evaluateApiKey(row({ expires_at: "2026-12-31T00:00:00Z" }), READ).ok).toBe(true);
  });
});

describe("evaluateApiKey — 403 : la clé existe mais ne suffit pas", () => {
  it("exige le scope demandé, avec le message de la fonction", () => {
    const decision = evaluateApiKey(row({ scopes: ["contacts"] }), READ);
    expect(decision).toEqual({ ok: false, code: "forbidden", message: "scope read requis" });
  });

  it("tolère une colonne scopes malformée en la lisant vide", () => {
    expect(evaluateApiKey(row({ scopes: "read" }), READ).ok).toBe(false);
    expect(evaluateApiKey(row({ scopes: ["read", 42] }), READ).ok).toBe(true);
  });

  it("refuse une clé plateforme sans application : pas d'application, pas de périmètre", () => {
    // Avant le registre, une telle clé voyait TOUT. C'est précisément ce qui
    // n'existe plus.
    for (const consumer of [null, "", "   "]) {
      const decision = evaluateApiKey(row({ organization_id: null, consumer }), READ);
      expect(decision).toEqual({
        ok: false,
        code: "forbidden",
        message: PLATFORM_WITHOUT_APPLICATION_MESSAGE,
      });
    }
  });

  it("n'exige pas d'application sur une clé liée à une racine", () => {
    const decision = evaluateApiKey(row({ consumer: null }), READ);
    expect(decision.ok).toBe(true);
  });
});

describe("evaluateApiKey — la clé admise", () => {
  it("rend des scopes propres et une application nettoyée", () => {
    const decision = evaluateApiKey(
      row({ organization_id: null, scopes: ["read", "smtp"], consumer: " nora " }),
      READ,
    );
    expect(decision).toEqual({
      ok: true,
      key: { id: "key-1", organization_id: null, scopes: ["read", "smtp"], consumer: "nora" },
    });
  });

  it("ne sélectionne jamais le hachage", () => {
    expect(API_KEY_COLUMNS).not.toMatch(/key_hash/);
    expect(API_KEY_COLUMNS).toMatch(/consumer/);
  });
});

describe("scopeRequest — par quelle RPC calculer le périmètre", () => {
  it("une clé liée → le sous-arbre de sa racine", () => {
    expect(scopeRequest({ id: "k", organization_id: "org-root", scopes: ["read"], consumer: "iris" }))
      .toEqual({ kind: "root", rpc: "org_subtree_ids", args: { root: "org-root" } });
  });

  it("une clé plateforme → les collectivités abonnées à son application", () => {
    expect(scopeRequest({ id: "k", organization_id: null, scopes: ["read"], consumer: "nora" }))
      .toEqual({ kind: "platform", rpc: "application_scope_ids", args: { p_application: "nora" } });
  });
});

describe("le module est le même dans les quatre fonctions", () => {
  it("public-api, contacts-api, ai-api et audience-api portent une copie identique", () => {
    // Pas de `_shared` de premier niveau (voir l'en-tête du module) : la
    // duplication est acceptée, la dérive ne l'est pas.
    const here = readFileSync(new URL("./apiKeyAuth.ts", import.meta.url), "utf8");
    for (const sibling of [
      "../../contacts-api/_shared/apiKeyAuth.ts",
      "../../ai-api/_shared/apiKeyAuth.ts",
      "../../audience-api/_shared/apiKeyAuth.ts",
    ]) {
      expect(readFileSync(new URL(sibling, import.meta.url), "utf8")).toBe(here);
    }
  });
});
