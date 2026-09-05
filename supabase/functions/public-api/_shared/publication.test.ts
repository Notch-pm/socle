import { describe, expect, it } from "vitest";
import {
  DEFAULT_PUBLICATION,
  isPubliclyPublished,
  isPublishedOn,
  isoDay,
  parsePublication,
} from "./publication.ts";

describe("parsePublication — le défaut du contrat est VISIBLE", () => {
  it("lit une démarche jamais paramétrée comme visible et non bornée", () => {
    // La règle qui coûte le plus cher si on l'inverse : une collectivité qui
    // n'a jamais ouvert l'étape « Communication » verrait tout son catalogue
    // disparaître du portail.
    for (const raw of [null, undefined, {}, { visibility: null }, "brouillon", 42]) {
      expect(parsePublication(raw)).toEqual(DEFAULT_PUBLICATION);
    }
  });

  it("ne retire du portail que sur un `false` explicite", () => {
    expect(parsePublication({ visibility: { portalVisible: false } }).portalVisible).toBe(false);
    // Clé absente, ou valeur d'un autre type : on reste sur le défaut.
    expect(parsePublication({ visibility: {} }).portalVisible).toBe(true);
    expect(parsePublication({ visibility: { portalVisible: "non" } }).portalVisible).toBe(true);
  });

  it("ignore les dates quand la période est désactivée", () => {
    // Le Socle CONSERVE les dates quand le commutateur est éteint (« le
    // commutateur gouverne l'usage, pas la donnée »). Les appliquer quand même
    // masquerait une démarche dont la période a été délibérément levée.
    const publication = parsePublication({
      visibility: {
        publicationPeriodEnabled: false,
        publicationStart: "2020-01-01",
        publicationEnd: "2020-12-31",
      },
    });
    expect(publication.publicationStart).toBeNull();
    expect(publication.publicationEnd).toBeNull();
  });

  it("écarte une date malformée sans écarter la démarche", () => {
    const publication = parsePublication({
      visibility: { publicationPeriodEnabled: true, publicationStart: "01/01/2027" },
    });
    expect(publication.publicationStart).toBeNull();
    expect(publication.portalVisible).toBe(true);
  });
});

describe("isPublishedOn — bornes incluses et indépendantes", () => {
  const window = (start: string | null, end: string | null) => ({
    portalVisible: true,
    publicationStart: start,
    publicationEnd: end,
  });

  it("inclut les deux bornes", () => {
    expect(isPublishedOn(window("2027-01-01", "2027-01-31"), "2027-01-01")).toBe(true);
    expect(isPublishedOn(window("2027-01-01", "2027-01-31"), "2027-01-31")).toBe(true);
    expect(isPublishedOn(window("2027-01-01", "2027-01-31"), "2026-12-31")).toBe(false);
    expect(isPublishedOn(window("2027-01-01", "2027-01-31"), "2027-02-01")).toBe(false);
  });

  it("ne borne rien quand une borne manque", () => {
    expect(isPublishedOn(window(null, "2027-01-31"), "1999-01-01")).toBe(true);
    expect(isPublishedOn(window("2027-01-01", null), "2099-01-01")).toBe(true);
    expect(isPublishedOn(window(null, null), "2027-06-15")).toBe(true);
  });
});

describe("isoDay — le jour de PARIS, pas celui du serveur", () => {
  it("rend le lendemain français juste après minuit heure de Paris", () => {
    // 31 décembre 23 h 30 UTC = 1er janvier 00 h 30 à Paris. Une démarche qui
    // s'ouvre le 1er doit être publiée à cet instant, pas deux heures plus tard.
    expect(isoDay(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });

  it("reste sur le jour courant en pleine journée", () => {
    expect(isoDay(new Date("2027-06-15T10:00:00Z"))).toBe("2027-06-15");
  });
});

describe("isPubliclyPublished — la définition complète de « publiée »", () => {
  const published = {
    status: "production",
    type: "externe",
    communication_config: { visibility: { portalVisible: true } },
  };

  it("publie une démarche prête, externe et visible", () => {
    expect(isPubliclyPublished(published, "2027-06-15")).toBe(true);
  });

  it("refuse un brouillon, même visible", () => {
    expect(isPubliclyPublished({ ...published, status: "brouillon" }, "2027-06-15")).toBe(false);
    // Fail closed : tout ce qui n'est pas « production » est un brouillon.
    expect(isPubliclyPublished({ ...published, status: undefined }, "2027-06-15")).toBe(false);
  });

  it("refuse une démarche interne — pas de guichet en ligne", () => {
    expect(isPubliclyPublished({ ...published, type: "interne" }, "2027-06-15")).toBe(false);
  });

  it("refuse une démarche retirée du portail ou hors période", () => {
    expect(
      isPubliclyPublished(
        { ...published, communication_config: { visibility: { portalVisible: false } } },
        "2027-06-15",
      ),
    ).toBe(false);
    expect(
      isPubliclyPublished(
        {
          ...published,
          communication_config: {
            visibility: { publicationPeriodEnabled: true, publicationStart: "2027-07-01" },
          },
        },
        "2027-06-15",
      ),
    ).toBe(false);
  });

  it("publie une démarche prête dont l'étape Communication n'a jamais été ouverte", () => {
    expect(
      isPubliclyPublished({ status: "production", type: "externe" }, "2027-06-15"),
    ).toBe(true);
  });
});
