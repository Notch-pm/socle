import { describe, expect, it } from "vitest";
import { generateApiKey, sha256Hex } from "./apiKeys";

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
