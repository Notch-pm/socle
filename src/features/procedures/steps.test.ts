import { describe, it, expect } from "vitest";
import { PROCEDURE_STEPS } from "./steps";

describe("PROCEDURE_STEPS", () => {
  it("définit exactement les 6 étapes du stepper", () => {
    expect(PROCEDURE_STEPS).toHaveLength(6);
  });

  it("commence par l'étape « Descriptif » (seule active)", () => {
    expect(PROCEDURE_STEPS[0]).toEqual({ key: "descriptif", label: "Descriptif" });
  });

  it("expose les clés attendues dans l'ordre", () => {
    expect(PROCEDURE_STEPS.map((s) => s.key)).toEqual([
      "descriptif",
      "publication",
      "demandeur",
      "formulaire",
      "communication",
      "connaissances",
    ]);
  });

  it("a des clés uniques", () => {
    const keys = PROCEDURE_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
