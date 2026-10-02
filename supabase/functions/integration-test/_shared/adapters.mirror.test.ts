import { describe, expect, it } from "vitest";
import * as edge from "./adapters";
import * as front from "../../../../src/features/integrations/adapters";

/**
 * Miroir front / edge : le formulaire (front) et le test de connexion (edge)
 * doivent connaître les mêmes champs, et juger la complétude de la même façon.
 */
describe("adaptateurs — miroir front / edge", () => {
  it("mêmes champs (clé, libellé, secret, requis, avancé)", () => {
    expect(front.ARPEGE_FIELDS).toEqual(edge.ARPEGE_FIELDS);
  });

  it("même règle de complétude, sur toutes les combinaisons de champs", () => {
    const keys = edge.ARPEGE_FIELDS.map((f) => f.key);
    for (let mask = 0; mask < 1 << keys.length; mask++) {
      const present = new Set(keys.filter((_, i) => mask & (1 << i)));
      expect(front.arpegeAdapter.isComplete(present)).toBe(edge.arpegeAdapter.isComplete(present));
    }
  });

  it("mêmes adaptateurs connus", () => {
    for (const key of ["arpege", "ixbus", ""]) {
      expect(front.getAdapter(key)?.key ?? null).toBe(edge.getAdapter(key)?.key ?? null);
    }
  });
});
