import { describe, expect, it } from "vitest";
import {
  activationRows,
  contactsSubtitle,
  formatCount,
  parseDashboardStats,
  proceduresSubtitle,
} from "./dashboardStats";

const FULL = {
  organization_id: "org-a",
  procedures: { total: 12, production: 5 },
  contacts: { total: 40, personne: 30, entreprise: 6, association: 3, administration: 1 },
  organizations: [
    { id: "a", name: "Ville", parent_id: null, is_internal_service: false, enabled_procedures: 2 },
    { id: "b", name: "Urbanisme", parent_id: "a", is_internal_service: true, enabled_procedures: 7 },
    { id: "c", name: "CCAS", parent_id: "a", is_internal_service: false, enabled_procedures: 0 },
  ],
};

describe("parseDashboardStats — un lecteur qui ne tombe jamais", () => {
  it("lit une réponse complète", () => {
    const stats = parseDashboardStats(FULL);
    expect(stats.procedures).toEqual({ total: 12, production: 5 });
    expect(stats.contacts.personne).toBe(30);
    expect(stats.organizations).toHaveLength(3);
    expect(stats.organizations[1]).toEqual({
      id: "b", name: "Urbanisme", parentId: "a", isInternalService: true, enabledProcedures: 7,
    });
  });

  // ⚠️ C'est l'écran le plus exposé du produit : le premier qu'un agent voit en
  // se connectant. Une clé absente vaut zéro, jamais une exception.
  it("rend des zéros plutôt que de lever, quoi qu'on lui donne", () => {
    for (const raw of [null, undefined, 42, "x", [], {}, { procedures: "non" }]) {
      const stats = parseDashboardStats(raw);
      expect(stats.procedures.total).toBe(0);
      expect(stats.contacts.total).toBe(0);
      expect(stats.organizations).toEqual([]);
    }
  });

  // PostgREST peut servir un `count(*)` en chaîne selon sa taille.
  it("accepte un compte rendu en chaîne, et refuse ce qui n'est pas un nombre", () => {
    const stats = parseDashboardStats({ procedures: { total: "12", production: "x" } });
    expect(stats.procedures.total).toBe(12);
    expect(stats.procedures.production).toBe(0);
  });

  it("ne rend jamais de compte négatif", () => {
    expect(parseDashboardStats({ contacts: { total: -5 } }).contacts.total).toBe(0);
  });

  // Motif `parsePortalPage` : une ligne abîmée est écartée, les autres restent.
  it("écarte une organisation sans identifiant ou sans nom, et garde les autres", () => {
    const stats = parseDashboardStats({
      organizations: [
        { id: "a", name: "Ville" },
        { name: "Sans identifiant" },
        { id: "c", name: "   " },
        "pas un objet",
        { id: "d", name: "Guichet" },
      ],
    });
    expect(stats.organizations.map((o) => o.id)).toEqual(["a", "d"]);
  });
});

describe("activationRows — qui porte le catalogue", () => {
  // ⚠️ Une barre à zéro n'apprend rien, et un organigramme de trente services
  // écraserait les cinq qui instruisent.
  it("écarte les organismes sans activation", () => {
    expect(activationRows(parseDashboardStats(FULL)).map((r) => r.name))
      .toEqual(["Urbanisme", "Ville"]);
  });

  // ⚠️ C'est un écran d'agent, pas le portail : un service interne y paraît
  // sous SON nom. Ce qui s'efface derrière son porteur, ce sont les démarches
  // vues par un usager.
  it("garde les services internes sous leur propre nom", () => {
    const rows = activationRows(parseDashboardStats(FULL));
    expect(rows[0]).toEqual({ id: "b", name: "Urbanisme", count: 7 });
  });

  it("classe par nombre décroissant, puis par nom — un ordre stable", () => {
    const stats = parseDashboardStats({
      organizations: [
        { id: "a", name: "Zoo", enabled_procedures: 3 },
        { id: "b", name: "Alpha", enabled_procedures: 3 },
        { id: "c", name: "Milieu", enabled_procedures: 9 },
      ],
    });
    expect(activationRows(stats).map((r) => r.name)).toEqual(["Milieu", "Alpha", "Zoo"]);
  });
});

describe("les sous-lignes des tuiles", () => {
  // « 0 en brouillon » ferait lire un manque là où il n'y en a pas.
  it("ne mentionne le brouillon que s'il y en a", () => {
    expect(proceduresSubtitle({ total: 12, production: 5 })).toBe("5 en production · 7 en brouillon");
    expect(proceduresSubtitle({ total: 5, production: 5 })).toBe("5 en production");
    // Un total inférieur à la production n'a pas de sens, mais ne doit pas
    // produire « -2 en brouillon ».
    expect(proceduresSubtitle({ total: 3, production: 5 })).toBe("5 en production");
  });

  // Les administrations n'ont pas leur tuile ; les taire ferait un total qui
  // ne se retrouve pas dans les trois tuiles voisines.
  it("mentionne les administrations quand il y en a, au bon nombre", () => {
    expect(contactsSubtitle({ total: 40, personne: 30, entreprise: 6, association: 3, administration: 1 }))
      .toBe("Fiches actives · dont 1 administration");
    expect(contactsSubtitle({ total: 42, personne: 30, entreprise: 6, association: 3, administration: 3 }))
      .toBe("Fiches actives · dont 3 administrations");
    expect(contactsSubtitle({ total: 39, personne: 30, entreprise: 6, association: 3, administration: 0 }))
      .toBe("Fiches actives");
    expect(contactsSubtitle({ total: 0, personne: 0, entreprise: 0, association: 0, administration: 0 }))
      .toBe("Aucune fiche active");
  });
});

describe("formatCount", () => {
  it("écrit les nombres à la française", () => {
    // Espace insécable étroite : c'est ce que rend `fr-FR`.
    expect(formatCount(12345).replace(/\s/g, " ")).toBe("12 345");
    expect(formatCount(0)).toBe("0");
  });
});
