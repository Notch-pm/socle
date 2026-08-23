import { describe, expect, it } from "vitest";
import { apiKeyStatus, countActiveApiKeys, generateApiKey, sha256Hex } from "./apiKeys";

describe("generateApiKey", () => {
  it("produit un secret préfixé, un préfixe d'affichage cohérent et un hachage vérifiable", async () => {
    const key = await generateApiKey();
    expect(key.secret.startsWith("sk_live_")).toBe(true);
    expect(key.prefix).toBe(key.secret.slice(0, 12));
    // Le hash stocké doit correspondre au SHA-256 du secret (ce que refait l'edge function).
    expect(key.hash).toBe(await sha256Hex(key.secret));
    expect(key.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("génère un secret différent à chaque appel", async () => {
    const a = await generateApiKey();
    const b = await generateApiKey();
    expect(a.secret).not.toBe(b.secret);
  });
});

describe("apiKeyStatus", () => {
  const now = new Date("2026-08-20T12:00:00Z");

  it("est active sans révocation ni expiration", () => {
    expect(apiKeyStatus({ revoked_at: null, expires_at: null }, now)).toBe("active");
  });

  it("est active tant que la date d'expiration n'est pas passée", () => {
    expect(apiKeyStatus({ revoked_at: null, expires_at: "2026-12-31T23:59:59Z" }, now)).toBe("active");
  });

  it("est expirée une fois la date d'expiration passée", () => {
    expect(apiKeyStatus({ revoked_at: null, expires_at: "2026-08-19T23:59:59Z" }, now)).toBe("expired");
  });

  it("la révocation l'emporte sur tout le reste", () => {
    expect(
      apiKeyStatus({ revoked_at: "2026-07-17T16:10:38Z", expires_at: "2026-12-31T23:59:59Z" }, now),
    ).toBe("revoked");
    expect(
      apiKeyStatus({ revoked_at: "2026-07-17T16:10:38Z", expires_at: "2026-01-01T00:00:00Z" }, now),
    ).toBe("revoked");
  });
});

describe("countActiveApiKeys", () => {
  it("ne compte que les clés ni révoquées ni expirées", () => {
    const now = new Date("2026-08-20T12:00:00Z");
    const keys = [
      { revoked_at: null, expires_at: null },
      { revoked_at: "2026-07-17T16:10:38Z", expires_at: null },
      { revoked_at: null, expires_at: "2026-01-01T00:00:00Z" },
      { revoked_at: null, expires_at: "2027-01-01T00:00:00Z" },
    ];
    expect(countActiveApiKeys(keys, now)).toBe(2);
    expect(countActiveApiKeys([], now)).toBe(0);
  });
});
