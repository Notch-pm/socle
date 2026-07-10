import { describe, it, expect } from "vitest";
import { PROCEDURE_STEPS } from "./steps";

describe("PROCEDURE_STEPS", () => {
  it("définit exactement les 5 étapes du stepper", () => {
    expect(PROCEDURE_STEPS).toHaveLength(5);
  });

  it("commence par l'étape « Descriptif »", () => {
    expect(PROCEDURE_STEPS[0]).toEqual({ key: "descriptif", label: "Descriptif" });
  });

  it("ne contient plus l'étape « Publication »", () => {
    expect(PROCEDURE_STEPS.map((s) => s.key)).not.toContain("publication");
  });

  it("expose les clés attendues dans l'ordre", () => {
    expect(PROCEDURE_STEPS.map((s) => s.key)).toEqual([
      "descriptif",
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
