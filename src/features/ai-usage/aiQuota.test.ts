import { describe, expect, it } from "vitest";
import {
  currentPeriod,
  formatTokens,
  nextRenewalIso,
  quotaView,
  renewalLabel,
} from "./aiQuota";

describe("quotaView", () => {
  it("compte le réservé dans l'engagé", () => {
    const v = quotaView({ limit: 1000, used: 600, reserved: 150 });
    expect(v.engaged).toBe(750);
    expect(v.remaining).toBe(250);
    expect(v.percent).toBe(75);
    expect(v.tone).toBe("ok");
  });

  it("passe en alerte à 80 %, en rouge à 100 %", () => {
    expect(quotaView({ limit: 1000, used: 800, reserved: 0 }).tone).toBe("warn");
    expect(quotaView({ limit: 1000, used: 999, reserved: 1 }).tone).toBe("critical");
  });

  // Le ton suit le RATIO, pas le pourcentage affiché : 79,9 % s'arrondit à 80
  // pour la jauge, mais n'a pas atteint le seuil.
  it("l'arrondi de la jauge ne déclenche pas l'alerte à lui seul", () => {
    const v = quotaView({ limit: 1000, used: 799, reserved: 0 });
    expect(v.percent).toBe(80);
    expect(v.tone).toBe("ok");
  });

  it("borne la jauge à 100 % sans masquer le dépassement dans le ton", () => {
    const v = quotaView({ limit: 100, used: 250, reserved: 0 });
    expect(v.percent).toBe(100);
    expect(v.remaining).toBe(0);
    expect(v.tone).toBe("critical");
  });

  it("aucun plafond ⇒ illimité, mais la consommation reste affichée", () => {
    const v = quotaView({ limit: null, used: 4200, reserved: 0 });
    expect(v.unlimited).toBe(true);
    expect(v.remaining).toBeNull();
    expect(v.used).toBe(4200);
  });

  it("un plafond nul ou négatif vaut aucun plafond", () => {
    expect(quotaView({ limit: 0, used: 10, reserved: 0 }).unlimited).toBe(true);
    expect(quotaView({ limit: -5, used: 10, reserved: 0 }).unlimited).toBe(true);
  });

  it("des compteurs négatifs ne produisent jamais d'affichage négatif", () => {
    const v = quotaView({ limit: 1000, used: -50, reserved: -10 });
    expect(v.engaged).toBe(0);
    expect(v.remaining).toBe(1000);
  });
});

describe("formatTokens", () => {
  it("groupe par milliers avec l'espace fine insécable", () => {
    expect(formatTokens(1250000)).toBe("1 250 000");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(0)).toBe("0");
  });

  it("arrondit et ne descend jamais sous zéro", () => {
    expect(formatTokens(1234.7)).toBe("1 235");
    expect(formatTokens(-42)).toBe("0");
  });
});

describe("renewalLabel", () => {
  it("écrit « 1ᵉʳ », jamais « 1 »", () => {
    expect(renewalLabel("2026-09-01")).toBe("1ᵉʳ septembre 2026");
    expect(renewalLabel("2027-01-01")).toBe("1ᵉʳ janvier 2027");
  });

  it("rend l'entrée telle quelle si ce n'est pas une date", () => {
    expect(renewalLabel("bientôt")).toBe("bientôt");
  });
});

describe("currentPeriod / nextRenewalIso", () => {
  // La période vit en base en UTC : calculée en heure locale, elle
  // désignerait un autre mois pendant deux heures chaque fin de mois.
  it("suivent l'UTC", () => {
    expect(currentPeriod(new Date("2026-08-31T23:00:00Z"))).toBe("2026-08");
    expect(currentPeriod(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09");
    expect(nextRenewalIso(new Date("2026-08-29T12:00:00Z"))).toBe("2026-09-01");
    expect(nextRenewalIso(new Date("2026-12-01T00:00:00Z"))).toBe("2027-01-01");
  });
});
