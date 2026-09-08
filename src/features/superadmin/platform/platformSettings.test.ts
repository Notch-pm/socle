import { describe, expect, it } from "vitest";
import {
  parseProvisionReport,
  parseTokenCount,
  provisionReportLabel,
  settingsInput,
  validateSettings,
} from "./platformSettings";

describe("settingsInput — la ligne devient un formulaire", () => {
  it("vide quand rien n'est réglé, ou quand la ligne manque", () => {
    expect(settingsInput(null)).toEqual({
      portalDomainSuffix: "",
      portalCnameTarget: "",
      defaultAiMonthlyTokens: "",
    });
    expect(
      settingsInput({ portal_domain_suffix: null, portal_cname_target: null, default_ai_monthly_tokens: null }),
    ).toEqual({ portalDomainSuffix: "", portalCnameTarget: "", defaultAiMonthlyTokens: "" });
  });

  it("recopie ce qui est réglé", () => {
    expect(
      settingsInput({
        portal_domain_suffix: "demarches.edilumen.fr",
        portal_cname_target: "portail.edilumen.fr",
        default_ai_monthly_tokens: 2_000_000,
      }),
    ).toEqual({
      portalDomainSuffix: "demarches.edilumen.fr",
      portalCnameTarget: "portail.edilumen.fr",
      defaultAiMonthlyTokens: "2000000",
    });
  });
});

describe("parseTokenCount — un nombre tel qu'on le tape", () => {
  it("accepte les séparateurs de milliers, refuse le reste", () => {
    expect(parseTokenCount("2 000 000")).toBe(2_000_000);
    expect(parseTokenCount("2 000 000")).toBe(2_000_000);
    expect(parseTokenCount("2000000")).toBe(2_000_000);
    expect(parseTokenCount("")).toBeNull();
    expect(parseTokenCount("   ")).toBeNull();
    expect(parseTokenCount("0")).toBeNaN();
    expect(parseTokenCount("-5")).toBeNaN();
    expect(parseTokenCount("2M")).toBeNaN();
  });
});

describe("validateSettings — ce qui part, ou pourquoi rien ne part", () => {
  it("une case vide vaut NULL, jamais une chaîne vide", () => {
    const { errors, write } = validateSettings({
      portalDomainSuffix: "",
      portalCnameTarget: "",
      defaultAiMonthlyTokens: "",
    });
    expect(errors).toEqual({});
    expect(write).toEqual({
      portal_domain_suffix: null,
      portal_cname_target: null,
      default_ai_monthly_tokens: null,
    });
  });

  it("normalise la zone comme un domaine (casse, point final, schéma collé)", () => {
    const { write } = validateSettings({
      portalDomainSuffix: " HTTPS://Demarches.Edilumen.FR/ ",
      portalCnameTarget: "Portail.Edilumen.fr.",
      defaultAiMonthlyTokens: "1 500 000",
    });
    expect(write).toEqual({
      portal_domain_suffix: "demarches.edilumen.fr",
      portal_cname_target: "portail.edilumen.fr",
      default_ai_monthly_tokens: 1_500_000,
    });
  });

  it("nomme chaque défaut et n'envoie rien tant qu'il en reste un", () => {
    const { errors, write } = validateSettings({
      portalDomainSuffix: "localhost",
      portalCnameTarget: "-portail.fr",
      defaultAiMonthlyTokens: "beaucoup",
    });
    expect(write).toBeNull();
    expect(errors.portalDomainSuffix).toMatch(/localhost/);
    expect(errors.portalCnameTarget).toMatch(/commencer et finir/);
    expect(errors.defaultAiMonthlyTokens).toMatch(/strictement positif/);
  });
});

describe("le compte rendu du provisioning", () => {
  it("tolère un JSON incomplet", () => {
    expect(parseProvisionReport(null)).toEqual({ organizations: 0, roles: 0, quotas: 0, domains: 0 });
    expect(parseProvisionReport({ organizations: 3, roles: "8" })).toEqual({
      organizations: 3, roles: 0, quotas: 0, domains: 0,
    });
  });

  it("raconte ce qui a été ajouté, ou que rien ne manquait", () => {
    expect(provisionReportLabel({ organizations: 3, roles: 0, quotas: 0, domains: 0 })).toBe(
      "3 organisations principales parcourues : rien à ajouter, tout était déjà en place.",
    );
    expect(provisionReportLabel({ organizations: 1, roles: 8, quotas: 1, domains: 1 })).toBe(
      "1 organisation principale parcourue : 8 rôles de contact, 1 plafond IA, 1 sous-domaine ajoutés.",
    );
  });
});
