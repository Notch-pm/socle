import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROCEDURE_ACCESS_MODE,
  PROCEDURE_ACCESS_MODES,
  PROCEDURE_ACCESS_MODE_LABELS,
  parseProcedureAccessMode,
  requiresAuthentication,
} from "./procedureAccess";

describe("parseProcedureAccessMode", () => {
  it("relit les deux accès connus", () => {
    expect(parseProcedureAccessMode("libre")).toBe("libre");
    expect(parseProcedureAccessMode("authentifie")).toBe("authentifie");
  });

  it("⚠️ toute valeur inattendue retombe sur « libre » : le doute ne ferme rien", () => {
    // L'inverse du doute de `parseProcedureStatus`, et pour la même raison : on
    // n'affirme rien à la place de la collectivité. Une restriction que nul n'a
    // demandée empêcherait des dépôts qui passaient la veille.
    for (const raw of [null, undefined, "", "AUTHENTIFIE", "authentifié", "auth", 1, true, {}]) {
      expect(parseProcedureAccessMode(raw), JSON.stringify(raw) ?? "undefined").toBe("libre");
    }
  });
});

describe("requiresAuthentication", () => {
  it("une démarche est en accès libre par défaut", () => {
    expect(DEFAULT_PROCEDURE_ACCESS_MODE).toBe("libre");
    expect(requiresAuthentication(null)).toBe(false);
  });

  it("seul « authentifie » exige un compte", () => {
    expect(requiresAuthentication("authentifie")).toBe(true);
    expect(requiresAuthentication("libre")).toBe(false);
  });
});

describe("PROCEDURE_ACCESS_MODES", () => {
  it("propose les deux accès dans l'ordre, le libre d'abord", () => {
    expect(PROCEDURE_ACCESS_MODES.map((mode) => mode.value)).toEqual(["libre", "authentifie"]);
  });

  it("chaque accès dit en une phrase ce qu'il change pour l'usager", () => {
    for (const mode of PROCEDURE_ACCESS_MODES) {
      expect(mode.hint.length).toBeGreaterThan(0);
      expect(mode.label).toBe(PROCEDURE_ACCESS_MODE_LABELS[mode.value]);
    }
  });
});
