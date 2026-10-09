import { describe, it, expect } from "vitest";
import {
  FREE_MAIL_TITLE_MAX_LENGTH,
  cleanFreeMailTitle,
  freeMailTitleIssue,
  freeMailUnavailableReason,
  missingFreeMailApplications,
} from "./freeMail";

describe("cleanFreeMailTitle — miroir de la contrainte SQL et de readPortalFreeMail", () => {
  it("trime, et un titre vide ou blanc vaut null (le portail met son libellé)", () => {
    expect(cleanFreeMailTitle("  Écrire à la mairie  ")).toBe("Écrire à la mairie");
    expect(cleanFreeMailTitle("   ")).toBeNull();
    expect(cleanFreeMailTitle("")).toBeNull();
    expect(cleanFreeMailTitle(null)).toBeNull();
  });

  it("borne à 80 caractères une fois trimé", () => {
    expect(freeMailTitleIssue("x".repeat(FREE_MAIL_TITLE_MAX_LENGTH))).toBeNull();
    expect(freeMailTitleIssue(`  ${"x".repeat(FREE_MAIL_TITLE_MAX_LENGTH)}  `)).toBeNull();
    expect(freeMailTitleIssue("x".repeat(FREE_MAIL_TITLE_MAX_LENGTH + 1))).not.toBeNull();
    expect(freeMailTitleIssue("")).toBeNull();
  });
});

describe("disponibilité — la racine doit être abonnée à Nora ET à Clara", () => {
  it("disponible avec les deux, quel que soit le reste", () => {
    expect(missingFreeMailApplications(["clara", "iris", "nora"])).toEqual([]);
    expect(freeMailUnavailableReason(["nora", "clara"])).toBeNull();
  });

  it("nomme ce qui manque", () => {
    expect(missingFreeMailApplications(["nora"])).toEqual(["clara"]);
    expect(freeMailUnavailableReason(["nora"])).toContain("abonnée à Clara");
    expect(freeMailUnavailableReason([])).toContain("abonnée à Nora et Clara");
  });
});
