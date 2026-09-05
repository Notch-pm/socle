import { describe, expect, it } from "vitest";
import { serializePortalPage } from "./portalPage.ts";

const META = { slug: "accueil", published_at: "2026-09-05T12:21:10Z" };
const PUBLISHED = new Set(["p1", "p2"]);

describe("serializePortalPage — références résolues", () => {
  it("n'écarte que les démarches absentes du catalogue publié, sans réordonner", () => {
    // p9 n'est pas publiée (brouillon, interne, hors période, supprimée — peu
    // importe) : le consommateur ne doit jamais la recevoir.
    const dto = serializePortalPage(
      {
        version: 1,
        sections: [
          { id: "g", kind: "demarches", title: "G", columns: 3, pinnedFirst: true, pinned: ["p2", "p9", "p1", "p2"] },
        ],
      },
      META,
      PUBLISHED,
    );
    expect(dto.sections[0]).toMatchObject({ kind: "demarches", pinned: ["p2", "p1"], pinned_first: true });
  });

  it("filtre aussi les raccourcis de recherche", () => {
    const dto = serializePortalPage(
      { version: 1, sections: [{ id: "r", kind: "recherche", showShortcuts: true, shortcuts: ["p9", "p1"] }] },
      META,
      PUBLISHED,
    );
    expect(dto.sections[0]).toMatchObject({ kind: "recherche", show_shortcuts: true, shortcuts: ["p1"] });
  });
});

describe("serializePortalPage — tolérance, comme l'éditeur", () => {
  it("écarte une section illisible sans perdre les autres", () => {
    const dto = serializePortalPage(
      {
        sections: [
          { id: "a", kind: "texte", title: "OK", body: "x", align: "center" },
          { id: "b", kind: "carrousel" },
          { kind: "compte", title: "sans id" },
          { id: "c", kind: "compte", title: "OK aussi" },
        ],
      },
      META,
      PUBLISHED,
    );
    expect(dto.sections.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("complète les champs manquants par les défauts de l'éditeur", () => {
    const dto = serializePortalPage({ sections: [{ id: "g", kind: "demarches" }] }, META, PUBLISHED);
    expect(dto.sections[0]).toEqual({
      id: "g",
      kind: "demarches",
      title: "",
      columns: 3,
      pinned_first: false,
      pinned: [],
    });
  });

  it("ramène une valeur hors domaine au défaut plutôt que de la servir", () => {
    const dto = serializePortalPage(
      { sections: [{ id: "g", kind: "demarches", columns: 5 }, { id: "t", kind: "texte", align: "right" }] },
      META,
      PUBLISHED,
    );
    expect(dto.sections[0]).toMatchObject({ columns: 3 });
    expect(dto.sections[1]).toMatchObject({ align: "left" });
  });

  it("rend une page vide, pas une erreur, pour une composition sans structure", () => {
    for (const raw of [null, "nope", 42, {}, { sections: "x" }]) {
      const dto = serializePortalPage(raw, META, PUBLISHED);
      expect(dto, JSON.stringify(raw)).toEqual({ ...META, version: 1, sections: [] });
    }
  });

  it("sert les actualités telles quelles — le consommateur décide", () => {
    const dto = serializePortalPage(
      { sections: [{ id: "n", kind: "actus", title: "Actus", layout: "grid", count: 2, showDates: false }] },
      META,
      PUBLISHED,
    );
    expect(dto.sections[0]).toEqual({
      id: "n",
      kind: "actus",
      title: "Actus",
      layout: "grid",
      count: 2,
      show_dates: false,
    });
  });
});
