import { describe, it, expect } from "vitest";
import {
  cleanCommunicationConfig,
  defaultCommunicationConfig,
  parseCommunicationConfig,
  publicationPeriodError,
} from "./communication";

describe("defaultCommunicationConfig", () => {
  it("part visible sur le portail, période active et sans bornes", () => {
    expect(defaultCommunicationConfig()).toEqual({
      visibility: {
        portalVisible: true,
        publicationPeriodEnabled: true,
        publicationStart: null,
        publicationEnd: null,
      },
    });
  });
});

describe("parseCommunicationConfig", () => {
  it("retombe sur les défauts pour une valeur absente ou aberrante", () => {
    for (const raw of [null, undefined, 42, "visible", [], {}, { visibility: "oui" }]) {
      expect(parseCommunicationConfig(raw)).toEqual(defaultCommunicationConfig());
    }
  });

  it("relit les paramètres enregistrés", () => {
    expect(
      parseCommunicationConfig({
        visibility: {
          portalVisible: false,
          publicationPeriodEnabled: true,
          publicationStart: "2026-09-01",
          publicationEnd: "2026-12-31",
        },
      }),
    ).toEqual({
      visibility: {
        portalVisible: false,
        publicationPeriodEnabled: true,
        publicationStart: "2026-09-01",
        publicationEnd: "2026-12-31",
      },
    });
  });

  it("un commutateur non booléen retombe sur « actif » (le défaut du champ)", () => {
    const { visibility } = parseCommunicationConfig({
      visibility: { portalVisible: "true", publicationPeriodEnabled: 1 },
    });
    expect(visibility.portalVisible).toBe(true);
    expect(visibility.publicationPeriodEnabled).toBe(true);
  });

  it("n'invente pas de date : format libre, chaîne vide ou jour inexistant → null", () => {
    const { visibility } = parseCommunicationConfig({
      visibility: { publicationStart: "01/09/2026", publicationEnd: "" },
    });
    expect(visibility.publicationStart).toBeNull();
    expect(visibility.publicationEnd).toBeNull();
    expect(
      parseCommunicationConfig({ visibility: { publicationStart: "2026-02-31" } }).visibility
        .publicationStart,
    ).toBeNull();
  });

  it("ignore les clés inconnues", () => {
    const parsed = parseCommunicationConfig({
      visibility: { portalVisible: true, inconnu: "x" },
      autreBloc: { a: 1 },
    });
    expect(parsed).toEqual(defaultCommunicationConfig());
    expect(parsed).not.toHaveProperty("autreBloc");
    expect(parsed.visibility).not.toHaveProperty("inconnu");
  });

  it("conserve les dates quand la période est désactivée (retour en arrière possible)", () => {
    const { visibility } = parseCommunicationConfig({
      visibility: {
        portalVisible: true,
        publicationPeriodEnabled: false,
        publicationStart: "2026-09-01",
        publicationEnd: "2026-12-31",
      },
    });
    expect(visibility.publicationStart).toBe("2026-09-01");
    expect(visibility.publicationEnd).toBe("2026-12-31");
  });
});

describe("cleanCommunicationConfig", () => {
  it("normalise avant persistance (idempotent)", () => {
    const config = defaultCommunicationConfig();
    config.visibility.publicationStart = " 2026-09-01 ";
    const cleaned = cleanCommunicationConfig(config);
    expect(cleaned.visibility.publicationStart).toBe("2026-09-01");
    expect(cleanCommunicationConfig(cleaned)).toEqual(cleaned);
  });
});

describe("publicationPeriodError", () => {
  const base = defaultCommunicationConfig().visibility;

  it("accepte une période cohérente, ou incomplète", () => {
    expect(publicationPeriodError(base)).toBeNull();
    expect(
      publicationPeriodError({ ...base, publicationStart: "2026-09-01", publicationEnd: null }),
    ).toBeNull();
    expect(
      publicationPeriodError({
        ...base,
        publicationStart: "2026-09-01",
        publicationEnd: "2026-09-01",
      }),
    ).toBeNull();
  });

  it("refuse une fin antérieure au début", () => {
    expect(
      publicationPeriodError({
        ...base,
        publicationStart: "2026-12-31",
        publicationEnd: "2026-09-01",
      }),
    ).toContain("doit suivre");
  });

  it("ne dit rien quand la période est désactivée", () => {
    expect(
      publicationPeriodError({
        ...base,
        publicationPeriodEnabled: false,
        publicationStart: "2026-12-31",
        publicationEnd: "2026-09-01",
      }),
    ).toBeNull();
  });
});
