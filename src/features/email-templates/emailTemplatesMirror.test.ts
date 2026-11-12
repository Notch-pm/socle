import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * `emailTemplates.ts` et `emailVariables.ts` existent côté écran et côté
 * `public-api` (une edge function n'importe rien de `src/`) : la duplication
 * est acceptée, la dérive ne l'est pas — motif `apiKeyAuth.ts`.
 */
const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("modèles de courriels — miroirs écran / API", () => {
  for (const file of ["emailTemplates.ts", "emailVariables.ts"]) {
    it(`${file} : les deux copies sont byte-identiques`, () => {
      const front = read(`src/features/email-templates/${file}`);
      const edge = read(`supabase/functions/public-api/_shared/${file}`);
      expect(
        edge === front,
        `Recopier : cp src/features/email-templates/${file} supabase/functions/public-api/_shared/${file}`,
      ).toBe(true);
    });
  }

  it("aucune copie n'importe quoi que ce soit (sinon le miroir edge casse)", () => {
    for (const file of ["emailTemplates.ts", "emailVariables.ts"]) {
      expect(read(`src/features/email-templates/${file}`)).not.toMatch(/^import /m);
    }
  });
});
