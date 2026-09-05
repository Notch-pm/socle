import { describe, expect, it } from "vitest";
import {
  MAX_SHORTCUTS,
  PALETTE_ITEMS,
  SECTION_KINDS,
  createContactSection,
  createSection,
  defaultPortalPage,
  isDarkColor,
  parsePortalPage,
  type PortalPage,
} from "./portalPage";

describe("defaultPortalPage", () => {
  it("est versionnée et reprend la maquette, sans actualités ni épinglage", () => {
    const page = defaultPortalPage();
    expect(page.version).toBe(1);
    expect(page.sections.map((s) => s.kind)).toEqual(["recherche", "demarches", "compte", "texte"]);
    // Le pied de page n'est pas dans le défaut : il se compose depuis la palette.
    // Le catalogue n'est pas connu ici : une page par défaut ne présume de rien.
    const grid = page.sections.find((s) => s.kind === "demarches");
    expect(grid).toMatchObject({ pinned: [], pinnedFirst: true, columns: 3 });
  });

  it("donne des ids distincts à chaque appel", () => {
    const a = defaultPortalPage().sections.map((s) => s.id);
    const b = defaultPortalPage().sections.map((s) => s.id);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });
});

describe("createSection", () => {
  it("produit une section de chaque type, avec un titre d'amorce — sauf le pied de page", () => {
    for (const kind of SECTION_KINDS) {
      const section = createSection(kind);
      expect(section.kind).toBe(kind);
      expect(section.id).toBeTruthy();
      // Le pied de page naît sans titre : un titre d'amorce y ferait un
      // bandeau de plus à effacer, ses sous-blocs portent les leurs.
      if (kind === "footer") expect(section.title).toBe("");
      else expect(section.title).not.toBe("");
    }
  });

  it("recherche : raccourcis masqués et vides par défaut", () => {
    expect(createSection("recherche")).toMatchObject({ showShortcuts: false, shortcuts: [] });
  });

  it("démarches : trois colonnes, rien d'épinglé", () => {
    expect(createSection("demarches")).toMatchObject({ columns: 3, pinnedFirst: false, pinned: [] });
  });
});

describe("createContactSection", () => {
  it("compose un bandeau texte depuis la fiche de l'organisation", () => {
    const section = createContactSection({
      name: "Mairie de Sainte-Colombe",
      address: "1 place de la Mairie",
      phone: "04 78 00 00 00",
      email: "contact@sainte-colombe.fr",
    });
    expect(section.kind).toBe("texte");
    expect(section.title).toBe("Mairie de Sainte-Colombe");
    expect(section.body).toBe("1 place de la Mairie · 04 78 00 00 00 · contact@sainte-colombe.fr");
  });

  it("omet les coordonnées absentes plutôt que d'afficher un vide", () => {
    const section = createContactSection({ name: "ACCM", address: null, phone: "  ", email: "a@b.fr" });
    expect(section.body).toBe("a@b.fr");
  });

  it("garde un texte d'amorce quand la fiche est vide", () => {
    const section = createContactSection({ name: " ", address: null, phone: null, email: null });
    expect(section.title).toBe("Nous contacter");
    expect(section.body).not.toBe("");
  });
});

describe("PALETTE_ITEMS", () => {
  it("désactive le bloc Actualités, et lui seul", () => {
    // Il reste dans la palette pour qu'on sache qu'il viendra — mais sans
    // articles il n'aurait rien à afficher.
    const disabled = PALETTE_ITEMS.filter((p) => !p.available).map((p) => p.kind);
    expect(disabled).toEqual(["actus"]);
  });

  it("propose le contact comme un preset, pas comme un type", () => {
    expect(PALETTE_ITEMS.some((p) => p.kind === "contact")).toBe(true);
    expect((SECTION_KINDS as readonly string[]).includes("contact")).toBe(false);
  });
});

describe("parsePortalPage", () => {
  it("retombe sur la composition par défaut pour tout ce qui n'est pas une page", () => {
    const expected = defaultPortalPage().sections.map((s) => s.kind);
    for (const raw of [null, undefined, "nope", 42, { sections: "x" }, { version: 2, sections: [] }]) {
      expect(parsePortalPage(raw).sections.map((s) => s.kind), JSON.stringify(raw)).toEqual(expected);
    }
  });

  it("une page générée par les fabriques se re-parse à l'identique", () => {
    // L'invariant aller-retour : ce que l'éditeur écrit, il le relit tel quel.
    const built: PortalPage = {
      version: 1,
      sections: [
        { ...createSection("recherche"), showShortcuts: true, shortcuts: ["p1", "p2"] },
        { ...createSection("demarches"), columns: 4, pinned: ["p1"] },
        createSection("actus"),
        createSection("compte"),
        { ...createSection("texte"), align: "center" },
      ],
    };
    expect(parsePortalPage(built)).toEqual(built);
  });

  it("écarte une section illisible sans perdre les autres", () => {
    // Plus indulgent que parseFormSchema, à dessein : c'est la page d'accueil
    // d'une collectivité, une section abîmée ne doit pas effacer les autres.
    const page = parsePortalPage({
      version: 1,
      sections: [
        { id: "a", kind: "texte", title: "OK", body: "x", align: "left" },
        { id: "b", kind: "carrousel", title: "Inconnu" },
        { kind: "compte", title: "Sans id" },
        { id: "c", kind: "compte", title: "OK aussi" },
      ],
    });
    expect(page.sections.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("complète les champs manquants d'une section par leurs défauts", () => {
    const page = parsePortalPage({ version: 1, sections: [{ id: "g", kind: "demarches" }] });
    expect(page.sections[0]).toEqual({
      id: "g",
      kind: "demarches",
      title: "",
      columns: 3,
      pinnedFirst: false,
      pinned: [],
    });
  });

  it("refuse une valeur hors domaine sur un champ contraint", () => {
    // 5 colonnes n'existe pas : la section est écartée plutôt que rendue avec
    // une grille que le portail ne saurait pas dessiner.
    const page = parsePortalPage({
      version: 1,
      sections: [{ id: "g", kind: "demarches", columns: 5 }],
    });
    expect(page.sections).toEqual([]);
  });

  it("accepte une page vide", () => {
    expect(parsePortalPage({ version: 1, sections: [] })).toEqual({ version: 1, sections: [] });
  });

  it("ne tronque pas les raccourcis au parse", () => {
    // La limite est un fait d'affichage (MAX_SHORTCUTS), pas de stockage :
    // l'inspecteur et le rendu l'appliquent, le parse conserve la donnée.
    const many = ["a", "b", "c", "d", "e", "f"];
    const page = parsePortalPage({
      version: 1,
      sections: [{ id: "r", kind: "recherche", shortcuts: many }],
    });
    expect(page.sections[0]).toMatchObject({ shortcuts: many });
    expect(many.length).toBeGreaterThan(MAX_SHORTCUTS);
  });
});

describe("pied de page", () => {
  it("naît vide, sombre, sur trois colonnes", () => {
    expect(createSection("footer")).toMatchObject({
      kind: "footer",
      title: "",
      background: "#0f1f18",
      columns: 3,
      children: [],
    });
  });

  it("se re-parse à l'identique avec ses sous-blocs", () => {
    const built: PortalPage = {
      version: 1,
      sections: [
        {
          ...createSection("footer"),
          background: "#123456",
          columns: 2,
          children: [createSection("texte"), { ...createSection("texte"), align: "center" }],
        },
      ],
    };
    expect(parsePortalPage(built)).toEqual(built);
  });

  it("écarte un sous-bloc illisible sans emporter le pied de page", () => {
    const page = parsePortalPage({
      version: 1,
      sections: [
        {
          id: "f",
          kind: "footer",
          children: [
            { id: "ok", kind: "texte", title: "Contact", body: "…", align: "left" },
            { id: "grille", kind: "demarches" },
            { kind: "texte", title: "sans id" },
          ],
        },
      ],
    });
    expect(page.sections[0]).toMatchObject({ kind: "footer", columns: 3, background: "#0f1f18" });
    expect((page.sections[0] as { children: { id: string }[] }).children.map((c) => c.id)).toEqual(["ok"]);
  });

  it("ramène une couleur de fond malformée au sombre par défaut", () => {
    // Une couleur est une valeur CSS injectée dans la page : ce qui n'est pas
    // du #rrggbb ne passe pas, et le pied de page reste lisible.
    const page = parsePortalPage({
      version: 1,
      sections: [{ id: "f", kind: "footer", background: "red; background:url(x)" }],
    });
    expect(page.sections[0]).toMatchObject({ background: "#0f1f18" });
  });
});

describe("isDarkColor", () => {
  it("appelle du texte clair sur un fond sombre, sombre sur un fond clair", () => {
    expect(isDarkColor("#0f1f18")).toBe(true);
    expect(isDarkColor("#000000")).toBe(true);
    expect(isDarkColor("#ffffff")).toBe(false);
    expect(isDarkColor("#ffcd57")).toBe(false);
    // Illisible = sombre : le défaut du pied de page l'est.
    expect(isDarkColor("rouge")).toBe(true);
  });
});
