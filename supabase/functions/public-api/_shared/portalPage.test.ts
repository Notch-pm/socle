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
      translations: {},
      title: "",
      columns: 3,
      pinned_first: false,
      pinned: [],
      // ⚠️ `false` : la clé manque exactement sur les pages composées avant que
      // ce filtre existe, et une page publiée ne gagne pas un filtre que
      // personne n'y a mis. L'éditeur, lui, le propose sur toute grille neuve.
      audience_filter: false,
    });
  });

  it("sert le filtre « Je suis… » tel que la collectivité l'a réglé", () => {
    const dto = serializePortalPage(
      { sections: [{ id: "g", kind: "demarches", audienceFilter: true }] },
      META,
      PUBLISHED,
    );
    expect(dto.sections[0]).toMatchObject({ audience_filter: true });
  });

  it("sert un bloc texte et image, ordre et texte alternatif compris", () => {
    const dto = serializePortalPage(
      {
        sections: [
          {
            id: "ti",
            kind: "texte-image",
            title: "Nos équipements",
            body: "La piscine est ouverte toute l'année.",
            imageUrl: "https://exemple.fr/piscine.jpg",
            alt: "La piscine municipale",
            layout: "image-first",
            translations: { en: { title: "Our facilities", alt: "The municipal pool" } },
          },
        ],
      },
      META,
      PUBLISHED,
    );
    expect(dto.sections[0]).toEqual({
      id: "ti",
      kind: "texte-image",
      title: "Nos équipements",
      body: "La piscine est ouverte toute l'année.",
      image_url: "https://exemple.fr/piscine.jpg",
      alt: "La piscine municipale",
      layout: "image-first",
      translations: { en: { title: "Our facilities", alt: "The municipal pool" } },
    });
  });

  it("ÉCARTE une adresse d'image qui n'en est pas, sans emporter le texte", () => {
    // Elle finit dans le `src` d'une page publique : `javascript:` et `data:`
    // n'ont pas de forme inoffensive qu'on saurait reconstituer. Le bloc reste
    // servi, sans image — le texte de la collectivité n'a pas à disparaître.
    for (const imageUrl of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "exemple.fr/x.jpg",
      // Le portail est servi en https (contenu mixte bloqué) et n'héberge aucun
      // média de collectivité (chemin absolu = 404).
      "http://exemple.fr/a.jpg",
      "/media/a.jpg",
    ]) {
      const dto = serializePortalPage(
        { sections: [{ id: "ti", kind: "texte-image", body: "Texte gardé", imageUrl }] },
        META,
        PUBLISHED,
      );
      expect(dto.sections[0], imageUrl).toMatchObject({ image_url: "", body: "Texte gardé" });
    }
  });

  it("ramène un ordre inconnu au texte d'abord, et complète les défauts", () => {
    const dto = serializePortalPage(
      { sections: [{ id: "ti", kind: "texte-image", layout: "image-au-milieu" }] },
      META,
      PUBLISHED,
    );
    expect(dto.sections[0]).toEqual({
      id: "ti",
      kind: "texte-image",
      title: "",
      body: "",
      image_url: "",
      alt: "",
      layout: "text-first",
      translations: {},
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
      translations: {},
      title: "Actus",
      layout: "grid",
      count: 2,
      show_dates: false,
    });
  });
});

describe("serializePortalPage — pied de page", () => {
  it("sert le fond, les colonnes et les sous-blocs texte, dans l'ordre", () => {
    const dto = serializePortalPage(
      {
        sections: [
          {
            id: "f",
            kind: "footer",
            title: "",
            background: "#1F2937",
            columns: 2,
            children: [
              { id: "c1", kind: "texte", title: "Contact", body: "1 place", align: "left" },
              { id: "c2", kind: "texte", title: "Horaires", body: "9h-17h", align: "center" },
            ],
          },
        ],
      },
      META,
      PUBLISHED,
    );
    expect(dto.sections[0]).toEqual({
      id: "f",
      kind: "footer",
      translations: {},
      title: "",
      background: "#1f2937",
      columns: 2,
      children: [
        { id: "c1", kind: "texte", title: "Contact", body: "1 place", align: "left", translations: {} },
        { id: "c2", kind: "texte", title: "Horaires", body: "9h-17h", align: "center", translations: {} },
      ],
    });
  });

  it("n'accepte dans un pied de page que des bandeaux texte, et une couleur bien formée", () => {
    const dto = serializePortalPage(
      {
        sections: [
          {
            id: "f",
            kind: "footer",
            background: "red",
            columns: 7,
            children: [{ id: "g", kind: "demarches" }, { id: "t", kind: "texte", title: "OK" }],
          },
        ],
      },
      META,
      PUBLISHED,
    );
    expect(dto.sections[0]).toMatchObject({ background: "#0f1f18", columns: 3 });
    expect((dto.sections[0] as { children: { id: string }[] }).children.map((c) => c.id)).toEqual(["t"]);
  });
});

/**
 * Les textes traduits d'une section (contrat 1.14.0).
 *
 * Même whitelist que le reste du fichier : on sert ce que le kind porte, et
 * rien d'autre — c'est ce qui distingue une sérialisation d'un pass-through.
 */
describe("serializePortalPage — traductions des sections", () => {
  const page = (section: Record<string, unknown>) =>
    serializePortalPage({ sections: [section] }, META, PUBLISHED).sections[0];

  it("sert les textes traduits du kind", () => {
    const dto = page({
      id: "t",
      kind: "texte",
      title: "Nos horaires",
      body: "Du lundi au vendredi.",
      translations: { en: { title: "Opening hours", body: "Monday to Friday." } },
    });
    expect(dto.translations).toEqual({
      en: { title: "Opening hours", body: "Monday to Friday." },
    });
  });

  it("écarte un texte que le kind ne porte pas", () => {
    // Un `body` égaré sur une recherche n'a pas de français à replier.
    const dto = page({
      id: "r",
      kind: "recherche",
      title: "Trouvez votre démarche",
      translations: { en: { title: "Find your service", body: "Perdu" } },
    });
    expect(dto.translations).toEqual({ en: { title: "Find your service" } });
  });

  it("n'émet jamais de clé `fr` : le français est le champ de même nom", () => {
    const dto = page({ id: "t", kind: "texte", title: "Titre", translations: { fr: { title: "Autre" } } });
    expect(dto.translations).toEqual({});
  });

  it("traite une chaîne vide comme une absence, et n'émet pas de langue vide", () => {
    const dto = page({
      id: "t",
      kind: "texte",
      title: "Titre",
      translations: { en: { title: "  " }, br: { title: "Titl" } },
    });
    expect(dto.translations).toEqual({ br: { title: "Titl" } });
  });

  it("émet toujours la clé, `{}` quand rien n'est traduit", () => {
    // Le consommateur écrit `s.translations[lang]?.title ?? s.title` sans avoir
    // à tester la présence du champ.
    expect(page({ id: "t", kind: "texte", title: "Titre" }).translations).toEqual({});
    expect(page({ id: "t", kind: "texte", title: "T", translations: "abîmé" }).translations)
      .toEqual({});
  });

  it("sert aussi celles des sous-blocs du pied de page", () => {
    const dto = page({
      id: "f",
      kind: "footer",
      title: "",
      background: "#0f1f18",
      columns: 3,
      children: [
        { id: "c", kind: "texte", title: "Contact", body: "1 place", translations: { en: { title: "Contact us" } } },
      ],
    });
    expect(dto.kind).toBe("footer");
    if (dto.kind !== "footer") return;
    expect(dto.children[0].translations).toEqual({ en: { title: "Contact us" } });
  });
});
