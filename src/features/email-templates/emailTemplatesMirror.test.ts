import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * `emailTemplates.ts` existe côté écran et côté `public-api` (une edge
 * function n'importe rien de `src/`) : la duplication est acceptée, la dérive
 * ne l'est pas — motif `apiKeyAuth.ts`.
 */
const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("emailTemplates.ts — miroir écran / API", () => {
  it("les deux copies sont byte-identiques", () => {
    const front = read("src/features/email-templates/emailTemplates.ts");
    const edge = read("supabase/functions/public-api/_shared/emailTemplates.ts");
    expect(edge === front, "Recopier : cp src/features/email-templates/emailTemplates.ts supabase/functions/public-api/_shared/emailTemplates.ts").toBe(true);
  });
});
