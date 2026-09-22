import { describe, expect, it } from "vitest";
import {
  currentPeriod,
  formatTokens,
  nextRenewalIso,
  quotaView,
  remainderLimit,
  renewalLabel,
  resolveShare,
  splitView,
  type AiShare,
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

describe("resolveShare — jumeau de `ai_usage_share_effective`", () => {
  it("un pourcentage est un plancher entier du plafond", () => {
    expect(resolveShare({ mode: "percent", tokens: null, percent: 25 }, 999)).toBe(249);
    expect(resolveShare({ mode: "percent", tokens: null, percent: 25 }, 10_000)).toBe(2_500);
  });

  // Sans plafond, un pourcentage n'a rien à multiplier : la part est SANS
  // EFFET, elle ne borne personne — le serveur saute la porte.
  it("un pourcentage sans plafond est sans effet", () => {
    expect(resolveShare({ mode: "percent", tokens: null, percent: 25 }, null)).toBeNull();
    expect(resolveShare({ mode: "percent", tokens: null, percent: 25 }, 0)).toBeNull();
  });

  it("une part en jetons se borne au plafond, et vaut telle quelle sans plafond", () => {
    expect(resolveShare({ mode: "tokens", tokens: 5_000, percent: null }, 3_000)).toBe(3_000);
    expect(resolveShare({ mode: "tokens", tokens: 5_000, percent: null }, null)).toBe(5_000);
    expect(resolveShare({ mode: "tokens", tokens: null, percent: null }, 3_000)).toBeNull();
  });
});

const share = (over: Partial<AiShare> = {}): AiShare => ({
  consumer: "nora",
  mode: "tokens",
  configuredTokens: 4_000,
  percent: null,
  effectiveTokens: 4_000,
  isActive: true,
  used: 0,
  reserved: 0,
  updatedAt: null,
  ...over,
});

describe("remainderLimit — jumeau de `v_caller_limit`", () => {
  it("le reste est le plafond moins les parts", () => {
    expect(remainderLimit(10_000, [share()])).toBe(6_000);
    expect(remainderLimit(10_000, [])).toBe(10_000);
    expect(remainderLimit(null, [share()])).toBeNull();
  });

  // Une part dépassée (règlement plus lourd que l'estimation) a consommé
  // au-delà : ce dépassement est sorti du reste.
  it("une part dépassée compte pour ce qu'elle a réellement engagé", () => {
    expect(remainderLimit(10_000, [share({ used: 4_500 })])).toBe(5_500);
  });

  it("n'est jamais négatif : n parts peuvent dépasser le plafond ensemble", () => {
    expect(remainderLimit(5_000, [share(), share({ consumer: "clara", effectiveTokens: 4_000 })])).toBe(0);
  });

  it("ignore les parts sans effet", () => {
    expect(remainderLimit(10_000, [share({ effectiveTokens: null })])).toBe(10_000);
  });
});

describe("splitView", () => {
  it("part et plafond : deux jauges dont la somme fait le plafond", () => {
    const v = splitView({
      plafond: 10_000,
      share: share({ used: 1_000, reserved: 500 }),
      totalUsed: 3_000,
      totalReserved: 700,
    });
    expect(v.state).toBe("split");
    expect(v.usagers?.limit).toBe(4_000);
    expect(v.usagers?.engaged).toBe(1_500);
    expect(v.agents?.limit).toBe(6_000);
    // L'engagé du reste est l'engagé commun moins celui de la part.
    expect(v.agents?.used).toBe(2_000);
    expect(v.agents?.reserved).toBe(200);
  });

  it("aucune part active : rien à répartir, la part levée reste visible", () => {
    const levee = share({ isActive: false, effectiveTokens: null });
    const v = splitView({ plafond: 10_000, share: levee, totalUsed: 0, totalReserved: 0 });
    expect(v.state).toBe("none");
    expect(v.share).toBe(levee);
    expect(v.usagers).toBeNull();
    expect(splitView({ plafond: 10_000, share: null, totalUsed: 0, totalReserved: 0 }).state).toBe("none");
  });

  it("part en jetons sans plafond : l'assistant est borné, le reste est illimité", () => {
    const v = splitView({ plafond: null, share: share({ used: 100 }), totalUsed: 900, totalReserved: 0 });
    expect(v.state).toBe("share-without-quota");
    expect(v.usagers?.limit).toBe(4_000);
    expect(v.agents?.unlimited).toBe(true);
    expect(v.agents?.used).toBe(800);
  });

  it("pourcentage sans plafond : sans effet, le commun vaut pour tous", () => {
    const v = splitView({
      plafond: null,
      share: share({ mode: "percent", configuredTokens: null, percent: 25, effectiveTokens: null }),
      totalUsed: 50,
      totalReserved: 0,
    });
    expect(v.state).toBe("percent-without-quota");
    expect(v.usagers).toBeNull();
    expect(v.agents?.unlimited).toBe(true);
  });

  it("le sous-compteur ne peut pas faire passer le reste en négatif", () => {
    const v = splitView({ plafond: 10_000, share: share({ used: 500 }), totalUsed: 200, totalReserved: 0 });
    expect(v.agents?.used).toBe(0);
  });
});
