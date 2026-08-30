import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROCEDURE_STATUS,
  PROCEDURE_STATUS_LABELS,
  isDraftProcedure,
  parseProcedureStatus,
  statusFromProductionToggle,
} from "./procedureStatus";

describe("parseProcedureStatus", () => {
  it("relit les deux statuts connus", () => {
    expect(parseProcedureStatus("production")).toBe("production");
    expect(parseProcedureStatus("brouillon")).toBe("brouillon");
  });

  it("toute valeur inattendue retombe sur brouillon : le doute ne publie rien", () => {
    for (const raw of [null, undefined, "", "PRODUCTION", "prod", 1, true, {}]) {
      expect(parseProcedureStatus(raw)).toBe("brouillon");
    }
  });
});

describe("isDraftProcedure", () => {
  it("une démarche est en brouillon par défaut", () => {
    expect(DEFAULT_PROCEDURE_STATUS).toBe("brouillon");
    expect(isDraftProcedure(null)).toBe(true);
  });

  it("seule « production » retire le tag", () => {
    expect(isDraftProcedure("production")).toBe(false);
    expect(isDraftProcedure("brouillon")).toBe(true);
  });
});

describe("statusFromProductionToggle", () => {
  it("le commutateur « Production » décide du statut", () => {
    expect(statusFromProductionToggle(true)).toBe("production");
    expect(statusFromProductionToggle(false)).toBe("brouillon");
  });
});

describe("PROCEDURE_STATUS_LABELS", () => {
  it("libellés français des deux statuts", () => {
    expect(PROCEDURE_STATUS_LABELS).toEqual({
      brouillon: "Brouillon",
      production: "Production",
    });
  });
});
