import { describe, it, expect } from "vitest";
import { PROCEDURE_STEPS } from "./steps";

describe("PROCEDURE_STEPS", () => {
  it("définit exactement les 6 étapes du stepper", () => {
    expect(PROCEDURE_STEPS).toHaveLength(6);
  });

  it("commence par l'étape « Descriptif »", () => {
    expect(PROCEDURE_STEPS[0]).toEqual({ key: "descriptif", label: "Descriptif" });
  });

  it("⚠️ la clé `publication` ne revient pas : « Publication » est le LIBELLÉ de `communication`", () => {
    // La clé `publication` désignait une étape supprimée. Depuis le 2026-09-18,
    // « Publication » est le libellé de la clé `communication` (colonne
    // `communication_config`) : la clé suit la colonne, le libellé suit l'agent.
    expect(PROCEDURE_STEPS.map((s) => s.key)).not.toContain("publication");
    expect(PROCEDURE_STEPS.find((s) => s.key === "communication")?.label).toBe("Publication");
  });

  it("⚠️ « Communication usager » se lit AVANT « Publication » et ne s'y confond pas", () => {
    // Ce que l'usager lit d'abord, où et quand on le diffuse ensuite.
    const keys = PROCEDURE_STEPS.map((s) => s.key);
    expect(keys.indexOf("usager")).toBeLessThan(keys.indexOf("communication"));
    expect(PROCEDURE_STEPS.find((s) => s.key === "usager")?.label).toBe("Communication usager");
  });

  it("expose les clés attendues dans l'ordre", () => {
    expect(PROCEDURE_STEPS.map((s) => s.key)).toEqual([
      "descriptif",
      "demandeur",
      "formulaire",
      "usager",
      "communication",
      "connaissances",
    ]);
  });

  it("a des clés uniques", () => {
    const keys = PROCEDURE_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
