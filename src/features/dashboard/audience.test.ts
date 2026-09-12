import { describe, expect, it } from "vitest";
import {
  breakdownLabel,
  breakdownOf,
  depositRate,
  depositSubtitle,
  emptyAudience,
  pageLabel,
  parisDay,
  parseAudience,
  periodRange,
  seriesFor,
  type Audience,
} from "./audience";

const RAW = {
  from: "2026-09-06",
  to: "2026-09-12",
  days: [
    { day: "2026-09-06", views: 10, visits: 4, deposits: 0 },
    { day: "2026-09-12", views: 6, visits: 3, deposits: 2 },
  ],
  totals: { views: 16, visits: 7, deposits: 2, form_views: 5 },
  pages: [
    { page: "accueil", procedure_id: null, procedure_name: null, views: 9 },
    { page: "demarche", procedure_id: "p1", procedure_name: "Carte de stationnement", views: 5 },
    { page: "formulaire", procedure_id: "p1", procedure_name: "Carte de stationnement", views: 5 },
    { page: "demarche", procedure_id: "p2", procedure_name: null, views: 2 },
  ],
  breakdown: [
    { dimension: "langue", value: "fr", views: 14, visits: 6 },
    { dimension: "langue", value: "oc", views: 2, visits: 1 },
    { dimension: "appareil", value: "mobile", views: 11, visits: 5 },
    { dimension: "appareil", value: "ordinateur", views: 5, visits: 2 },
  ],
};

describe("parseAudience — un lecteur qui ne tombe jamais", () => {
  it("lit une réponse complète", () => {
    const audience = parseAudience(RAW);
    expect(audience.days).toHaveLength(2);
    expect(audience.totals).toEqual({ views: 16, visits: 7, deposits: 2, formViews: 5 });
    expect(audience.pages).toHaveLength(4);
    expect(audience.breakdown).toHaveLength(4);
  });

  it("rend une audience vide plutôt que de lever", () => {
    for (const raw of [null, undefined, 42, "x", [], {}, { days: "non" }]) {
      expect(parseAudience(raw)).toEqual(emptyAudience());
    }
  });

  it("écarte les lignes inexploitables, et garde les autres", () => {
    const audience = parseAudience({
      days: [{ day: "pas-une-date", views: 5 }, { day: "2026-09-12", views: 3 }],
      pages: [{ page: "contact", views: 4 }, { page: "accueil", views: 2 }],
      breakdown: [
        { dimension: "navigateur", value: "firefox", views: 9 },
        { dimension: "langue", value: "", views: 9 },
        { dimension: "langue", value: "fr", views: 1 },
      ],
    });
    expect(audience.days.map((d) => d.day)).toEqual(["2026-09-12"]);
    expect(audience.pages.map((p) => p.page)).toEqual(["accueil"]);
    expect(audience.breakdown.map((b) => b.value)).toEqual(["fr"]);
  });

  // La RPC rend une date, que PostgREST peut servir horodatée.
  it("ne garde que la partie date d'un jour", () => {
    const audience = parseAudience({ days: [{ day: "2026-09-12T00:00:00+02:00", views: 1 }] });
    expect(audience.days[0].day).toBe("2026-09-12");
  });
});

describe("periodRange — les bornes, en heure de Paris", () => {
  // Minuit à Paris le 12, donc encore le 11 en UTC : c'est le cas où un calcul
  // naïf dans le fuseau du navigateur perdrait un jour.
  const AT = new Date("2026-09-11T22:30:00Z");

  it("date le jour courant en heure de Paris, pas en UTC", () => {
    expect(parisDay(AT)).toBe("2026-09-12");
  });

  // ⚠️ Bornes INCLUSES des deux côtés : « 7 jours » est aujourd'hui plus les
  // six précédents, pas huit jours.
  it("compte la période bornes incluses", () => {
    expect(periodRange("7d", AT)).toEqual({ from: "2026-09-06", to: "2026-09-12" });
    expect(periodRange("30d", AT)).toEqual({ from: "2026-08-14", to: "2026-09-12" });
    expect(periodRange("1y", AT)).toEqual({ from: "2025-09-13", to: "2026-09-12" });
  });

  it("traverse un changement d'heure sans reculer d'un jour", () => {
    // Le 31 octobre 2026 : le changement d'heure d'hiver est passé (25 oct.).
    expect(periodRange("7d", new Date("2026-10-31T12:00:00Z")))
      .toEqual({ from: "2026-10-25", to: "2026-10-31" });
  });
});

describe("seriesFor — la série du graphique", () => {
  const audience: Audience = parseAudience(RAW);
  const range = { from: "2026-09-06", to: "2026-09-12" };

  // ⚠️ Sans ce remplissage, le graphique relierait le 6 au 12 comme s'ils se
  // suivaient : un creux de cinq jours se lirait comme un plateau.
  it("complète les jours sans données par des zéros", () => {
    const points = seriesFor(audience, "7d", range);
    expect(points).toHaveLength(7);
    expect(points.map((p) => p.views)).toEqual([10, 0, 0, 0, 0, 0, 6]);
    expect(points.map((p) => p.visits)).toEqual([4, 0, 0, 0, 0, 0, 3]);
    expect(points[0].key).toBe("2026-09-06");
    expect(points[0].label).toBe("6 sept.");
  });

  it("couvre exactement la période demandée sur 30 jours", () => {
    const points = seriesFor(audience, "30d", { from: "2026-08-14", to: "2026-09-12" });
    expect(points).toHaveLength(30);
    expect(points[0].key).toBe("2026-08-14");
    expect(points[29].key).toBe("2026-09-12");
  });

  // ⚠️ 365 points sur une largeur d'écran ne se lisent pas, et ce n'est pas la
  // question qu'on pose à cette échelle.
  it("regroupe par mois sur un an, sans perdre un seul mois", () => {
    const points = seriesFor(audience, "1y", { from: "2025-09-13", to: "2026-09-12" });
    expect(points).toHaveLength(13);
    expect(points[0].key).toBe("2025-09");
    expect(points[0].label).toBe("sept. 25");
    expect(points[12].key).toBe("2026-09");
    // Les deux jours de données tombent dans le même mois : ils s'additionnent.
    expect(points[12].views).toBe(16);
    expect(points[12].visits).toBe(7);
  });

  it("rend une série entièrement à zéro quand rien n'a été mesuré", () => {
    const points = seriesFor(emptyAudience(), "7d", range);
    expect(points).toHaveLength(7);
    expect(points.every((p) => p.views === 0 && p.visits === 0)).toBe(true);
  });
});

describe("les libellés", () => {
  // ⚠️ La ligne est conservée quand une démarche est supprimée (pas de clé
  // étrangère : un historique ne s'efface pas). Elle doit donc se LIRE — un
  // uuid nu ne dirait rien à personne.
  it("nomme une démarche supprimée plutôt que d'afficher son identifiant", () => {
    const audience = parseAudience(RAW);
    expect(audience.pages.map(pageLabel)).toEqual([
      "Accueil",
      "Carte de stationnement",
      "Carte de stationnement — formulaire",
      "Démarche supprimée",
    ]);
  });

  it("traduit les langues par le catalogue, et les appareils par le sien", () => {
    expect(breakdownLabel({ dimension: "langue", value: "oc", views: 1, visits: 0 }))
      .toBe("Occitan");
    expect(breakdownLabel({ dimension: "appareil", value: "tablette", views: 1, visits: 0 }))
      .toBe("Tablette");
    // Un code hors catalogue reste lisible tel quel (motif `languageLabel`).
    expect(breakdownLabel({ dimension: "langue", value: "zz", views: 1, visits: 0 })).toBe("zz");
  });
});

describe("breakdownOf", () => {
  it("ne rend qu'une dimension, la plus vue d'abord, et écarte les zéros", () => {
    const audience = parseAudience({
      breakdown: [
        { dimension: "langue", value: "oc", views: 2 },
        { dimension: "langue", value: "en", views: 0 },
        { dimension: "langue", value: "fr", views: 14 },
        { dimension: "appareil", value: "mobile", views: 11 },
      ],
    });
    expect(breakdownOf(audience, "langue").map((b) => b.value)).toEqual(["fr", "oc"]);
    expect(breakdownOf(audience, "appareil").map((b) => b.value)).toEqual(["mobile"]);
  });
});

describe("depositRate — un taux sans dénominateur n'existe pas", () => {
  // ⚠️ « 0 % » ferait lire un échec là où il n'y a eu aucune tentative.
  it("rend « — » quand aucun formulaire n'a été ouvert", () => {
    expect(depositRate({ views: 20, visits: 9, deposits: 0, formViews: 0 })).toBe("—");
    expect(depositSubtitle({ views: 20, visits: 9, deposits: 0, formViews: 0 }))
      .toBe("Aucun formulaire ouvert");
  });

  it("calcule le taux, avec une décimale seulement sous 10 %", () => {
    expect(depositRate({ views: 0, visits: 0, deposits: 2, formViews: 5 })).toBe("40 %");
    expect(depositRate({ views: 0, visits: 0, deposits: 3, formViews: 100 })).toBe("3 %");
    expect(depositRate({ views: 0, visits: 0, deposits: 7, formViews: 200 })).toBe("3,5 %");
  });

  // ⚠️ Un usager qui ouvre le formulaire un jour et dépose le lendemain met sa
  // vue d'un côté de la période et son dépôt de l'autre. Borner masquerait le
  // décalage au lieu de le montrer.
  it("ne borne pas à 100 %", () => {
    expect(depositRate({ views: 0, visits: 0, deposits: 3, formViews: 2 })).toBe("150 %");
  });

  it("compose la sous-ligne de la tuile", () => {
    expect(depositSubtitle({ views: 0, visits: 0, deposits: 2, formViews: 5 }))
      .toBe("soit 40 % des formulaires ouverts");
  });
});
