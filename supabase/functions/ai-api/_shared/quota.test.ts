import { describe, expect, it } from "vitest";
import {
  nextRenewalIso,
  periodKey,
  quotaExceededMessage,
  rateLimitedMessage,
  renewalLabel,
  secondsUntilNextMinute,
} from "./quota.ts";
import {
  clampOutput,
  DEFAULT_OUTPUT_TOKENS,
  estimateInput,
  estimateTokens,
  MAX_OUTPUT_TOKENS,
  reservationFor,
} from "./tokens.ts";

describe("periodKey / nextRenewalIso", () => {
  it("rend la période au format du CHECK SQL", () => {
    expect(periodKey(new Date("2026-08-29T15:00:00Z"))).toBe("2026-08");
    expect(periodKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });

  // La période vit en base en UTC. Calculée en heure locale, elle
  // désignerait un autre mois pendant deux heures chaque fin de mois — et le
  // message annoncerait une date de renouvellement fausse.
  it("suit l'UTC, pas l'heure de Paris", () => {
    expect(periodKey(new Date("2026-08-31T23:00:00Z"))).toBe("2026-08");
    expect(periodKey(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09");
  });

  it("pointe le premier de la période suivante", () => {
    expect(nextRenewalIso(new Date("2026-08-29T15:00:00Z"))).toBe("2026-09-01");
    expect(nextRenewalIso(new Date("2026-12-15T10:00:00Z"))).toBe("2027-01-01");
  });
});

describe("renewalLabel", () => {
  it("écrit « 1ᵉʳ », jamais « 1 » — le renouvellement tombe toujours un premier", () => {
    expect(renewalLabel("2026-09-01")).toBe("1ᵉʳ septembre 2026");
    expect(renewalLabel("2027-01-01")).toBe("1ᵉʳ janvier 2027");
    expect(renewalLabel("2026-08-01")).toBe("1ᵉʳ août 2026");
  });

  it("rend l'entrée telle quelle si elle n'est pas une date", () => {
    expect(renewalLabel("bientôt")).toBe("bientôt");
    expect(renewalLabel("2026-13-01")).toBe("2026-13-01");
  });
});

describe("quotaExceededMessage", () => {
  // C'est LA phrase que verra l'agent. Elle est composée ici pour qu'aucun
  // consommateur n'ait à la recalculer — un jumeau qui dérive ferait mentir la
  // date.
  it("nomme la date de renouvellement", () => {
    expect(quotaExceededMessage("2026-09-01")).toBe(
      "Le plafond d'utilisation de l'assistant IA est atteint pour ce mois. " +
        "Le crédit sera renouvelé le 1ᵉʳ septembre 2026.",
    );
  });
});

describe("estimation de jetons", () => {
  it("rend zéro sur le vide et croît avec le texte", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("un peu de texte")).toBeGreaterThan(0);
    expect(estimateTokens("aa")).toBeGreaterThanOrEqual(estimateTokens("a"));
  });

  // Le contrat de l'heuristique : surestimer le français, jamais l'inverse.
  // Sous-estimer laisserait dépasser le plafond avant que le règlement ne
  // s'en aperçoive.
  it("estime le français au-dessus de la règle anglaise chars/4", () => {
    const fr = "Le justificatif de domicile de moins de trois mois est obligatoire.";
    expect(estimateTokens(fr)).toBeGreaterThan(Math.ceil(fr.length / 4));
    expect(estimateTokens(fr)).toBeLessThan(Math.ceil(fr.length / 4) * 1.2);
  });

  it("compte le prompt système dans l'entrée", () => {
    const avec = estimateInput("consigne longue".repeat(20), [{ role: "user", content: "q" }]);
    const sans = estimateInput("", [{ role: "user", content: "q" }]);
    expect(avec).toBeGreaterThan(sans);
  });
});

describe("reservationFor", () => {
  // Réserver sur un nombre fourni par l'appelant reviendrait à verrouiller le
  // plafond sur une déclaration : n'importe quel consommateur pourrait
  // sous-déclarer pour passer.
  it("ne descend jamais en dessous de sa propre estimation", () => {
    const messages = [{ role: "user", content: "q".repeat(4000) }];
    const menteur = reservationFor("système", messages, 900, 1);
    const honnete = reservationFor("système", messages, 900, null);
    expect(menteur).toBe(honnete);
  });

  it("retient l'indication de l'appelant quand elle est plus haute", () => {
    expect(reservationFor("s", [{ role: "user", content: "q" }], 900, 50000)).toBe(50000);
  });

  it("réserve la sortie maximale, pas une sortie moyenne", () => {
    const petite = reservationFor("s", [{ role: "user", content: "q" }], 100, null);
    const grande = reservationFor("s", [{ role: "user", content: "q" }], 900, null);
    expect(grande - petite).toBe(800);
  });
});

describe("clampOutput", () => {
  it("borne au lieu de refuser", () => {
    expect(clampOutput(99999)).toBe(MAX_OUTPUT_TOKENS);
    expect(clampOutput(500)).toBe(500);
  });

  it("retombe sur le défaut pour toute valeur absurde", () => {
    expect(clampOutput(undefined)).toBe(DEFAULT_OUTPUT_TOKENS);
    expect(clampOutput(0)).toBe(DEFAULT_OUTPUT_TOKENS);
    expect(clampOutput(-10)).toBe(DEFAULT_OUTPUT_TOKENS);
    expect(clampOutput("beaucoup")).toBe(DEFAULT_OUTPUT_TOKENS);
    expect(clampOutput(NaN)).toBe(DEFAULT_OUTPUT_TOKENS);
  });
});

describe("secondsUntilNextMinute", () => {
  it("compte jusqu'au prochain top de minute", () => {
    expect(secondsUntilNextMinute(new Date("2026-08-29T10:00:00.000Z"))).toBe(60);
    expect(secondsUntilNextMinute(new Date("2026-08-29T10:00:15.000Z"))).toBe(45);
    expect(secondsUntilNextMinute(new Date("2026-08-29T10:00:30.500Z"))).toBe(30);
  });

  // `Retry-After: 0` inviterait à réessayer tout de suite — exactement le
  // comportement qu'on freine.
  it("ne rend jamais 0, même à la toute fin de la fenêtre", () => {
    expect(secondsUntilNextMinute(new Date("2026-08-29T10:00:59.000Z"))).toBe(1);
    expect(secondsUntilNextMinute(new Date("2026-08-29T10:00:59.999Z"))).toBe(1);
  });

  it("reste dans la borne d'une fenêtre d'une minute", () => {
    for (let s = 0; s < 60; s++) {
      const v = secondsUntilNextMinute(new Date(Date.UTC(2026, 7, 29, 10, 0, s)));
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(60);
    }
  });
});

describe("rateLimitedMessage", () => {
  // Le crédit n'est PAS en cause : parler de plafond enverrait l'agent
  // demander un relèvement dont il n'a pas besoin.
  it("parle de cadence, jamais de plafond ni de crédit", () => {
    const m = rateLimitedMessage();
    expect(m).toContain("peu de temps");
    expect(m).not.toMatch(/plafond|crédit|renouvel/i);
  });
});
