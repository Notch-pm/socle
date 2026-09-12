import { describe, expect, it } from "vitest";
import {
  MAX_SHORTCUTS,
  PALETTE_ITEMS,
  SECTION_KINDS,
  createContactSection,
  createSection,
  applySectionTranslations,
  defaultPortalPage,
  fieldsForKind,
  hasTranslations,
  isDarkColor,
  setSectionTranslation,
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
      // Deux blocs naissent sans titre : le pied de page, dont un titre
      // d'amorce ferait un bandeau de plus à effacer (ses sous-blocs portent
      // les leurs), et « texte et image », où le titre est facultatif — il sert
      // autant à illustrer un paragraphe qu'à annoncer une rubrique.
      if (kind === "footer" || kind === "texte-image") expect(section.title).toBe("");
      else expect(section.title).not.toBe("");
    }
  });

  it("recherche : raccourcis masqués et vides par défaut", () => {
    expect(createSection("recherche")).toMatchObject({ showShortcuts: false, shortcuts: [] });
  });

  it("recherche : aucune image de fond, donc aucune de ses deux options", () => {
    expect(createSection("recherche")).toMatchObject({
      imageUrl: "",
      imageFullWidth: false,
      imageFixed: false,
    });
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
      translations: {},
      title: "",
      columns: 3,
      pinnedFirst: false,
      pinned: [],
      // ⚠️ `false`, alors qu'une grille NEUVE naît avec le filtre : la clé
      // manque exactement sur les pages composées avant qu'il existe.
      audienceFilter: false,
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

describe("bloc « texte et image »", () => {
  it("naît sans titre, texte d'abord, sans image", () => {
    expect(createSection("texte-image")).toMatchObject({
      kind: "texte-image",
      title: "",
      imageUrl: "",
      alt: "",
      layout: "text-first",
    });
    expect(createSection("texte-image").body).not.toBe("");
  });

  it("se re-parse à l'identique, ordre et texte alternatif compris", () => {
    const built: PortalPage = {
      version: 1,
      sections: [
        {
          ...createSection("texte-image"),
          title: "Nos équipements",
          imageUrl: "https://exemple.fr/piscine.jpg",
          alt: "La piscine municipale",
          layout: "image-first",
        },
      ],
    };
    expect(parsePortalPage(built)).toEqual(built);
  });

  it("traduit son titre, son paragraphe ET la description de l'image", () => {
    // `alt` est ce que lit une synthèse vocale : le laisser en français ne
    // traduirait la page que pour ceux qui la voient.
    expect(fieldsForKind("texte-image")).toEqual(["title", "body", "alt"]);
  });

  it("écarte une adresse d'image qui n'est pas une adresse, sans perdre le bloc", () => {
    // Une URL finit dans le `src` d'une page publique : on écarte, on ne
    // nettoie pas. Le texte de la collectivité, lui, reste.
    // ⚠️ `http://` et les chemins absolus sont écartés AUSSI : le portail est
    // servi en https et n'héberge aucun média de collectivité.
    for (const imageUrl of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "exemple.fr/x.jpg",
      "http://exemple.fr/a.jpg",
      "/media/a.jpg",
      "https://",
    ]) {
      const page = parsePortalPage({
        version: 1,
        sections: [{ id: "i", kind: "texte-image", body: "Texte gardé", imageUrl }],
      });
      expect(page.sections[0], imageUrl).toMatchObject({ imageUrl: "", body: "Texte gardé" });
    }
  });

  it("accepte une https absolue, et elle seule", () => {
    for (const imageUrl of ["https://exemple.fr/a.jpg", "https://cdn.exemple.fr/x/y.png?v=2"]) {
      const page = parsePortalPage({
        version: 1,
        sections: [{ id: "i", kind: "texte-image", imageUrl }],
      });
      expect(page.sections[0], imageUrl).toMatchObject({ imageUrl });
    }
  });

  it("refuse un ordre hors domaine plutôt que d'en inventer un", () => {
    const page = parsePortalPage({
      version: 1,
      sections: [{ id: "i", kind: "texte-image", layout: "image-au-milieu" }],
    });
    expect(page.sections).toEqual([]);
  });
});

describe("image de fond du bloc de recherche", () => {
  it("se re-parse à l'identique, options comprises", () => {
    const built: PortalPage = {
      version: 1,
      sections: [
        {
          ...createSection("recherche"),
          imageUrl: "https://medias.ville.fr/hotel-de-ville.jpg",
          imageFullWidth: true,
          imageFixed: true,
        },
      ],
    };
    expect(parsePortalPage(built)).toEqual(built);
  });

  it("écarte une adresse qui n'en est pas, sans perdre le bloc", () => {
    // Même parti que `texte-image` : on écarte, on ne nettoie pas — et le
    // champ de recherche de la collectivité reste debout.
    for (const imageUrl of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "exemple.fr/x.jpg",
      "http://exemple.fr/a.jpg",
      "/media/a.jpg",
    ]) {
      const page = parsePortalPage({
        version: 1,
        sections: [{ id: "r", kind: "recherche", title: "Gardé", imageUrl }],
      });
      expect(page.sections[0], imageUrl).toMatchObject({ imageUrl: "", title: "Gardé" });
    }
  });

  it("CONSERVE les deux options quand l'adresse est effacée", () => {
    // Le réglage gouverne l'usage, pas la donnée (motif `email_sender_name`) :
    // recoller une adresse doit rendre le bandeau tel qu'il était. C'est au
    // rendu de les ignorer tant qu'il n'y a rien à habiller.
    const page = parsePortalPage({
      version: 1,
      sections: [
        { id: "r", kind: "recherche", imageUrl: "", imageFullWidth: true, imageFixed: true },
      ],
    });
    expect(page.sections[0]).toMatchObject({
      imageUrl: "",
      imageFullWidth: true,
      imageFixed: true,
    });
  });

  it("lit une page composée avant l'image comme un bloc sans fond", () => {
    const page = parsePortalPage({
      version: 1,
      sections: [{ id: "r", kind: "recherche", title: "T" }],
    });
    expect(page.sections[0]).toMatchObject({
      imageUrl: "",
      imageFullWidth: false,
      imageFixed: false,
    });
  });

  it("ne se traduit pas : un fond n'a rien à faire lire", () => {
    // ⚠️ Contrairement à l'`alt` de `texte-image` : ce qu'une synthèse vocale
    // doit lire ici, ce sont le titre et le sous-titre, posés DESSUS.
    expect(fieldsForKind("recherche")).toEqual(["title", "subtitle", "placeholder"]);
  });
});

describe("filtre « Je suis… » de la grille de démarches", () => {
  it("est proposé sur une grille neuve", () => {
    expect(createSection("demarches").audienceFilter).toBe(true);
  });

  it("est ABSENT d'une grille composée avant qu'il existe", () => {
    // ⚠️ Le défaut du parseur (`false`) diverge de celui de la fabrique
    // (`true`), et c'est voulu : la clé manque exactement sur les pages déjà
    // publiées, qui ne doivent pas gagner un filtre que personne n'y a mis.
    const page = parsePortalPage({
      version: 1,
      sections: [{ id: "g", kind: "demarches", title: "Démarches les plus demandées" }],
    });
    expect(page.sections[0]).toMatchObject({ audienceFilter: false });
  });

  it("survit à l'aller-retour dans les deux sens", () => {
    for (const audienceFilter of [true, false]) {
      const built: PortalPage = {
        version: 1,
        sections: [{ ...createSection("demarches"), audienceFilter }],
      };
      expect(parsePortalPage(built)).toEqual(built);
    }
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

/**
 * ⚠️ LE TEST QUI ATTRAPE LE STRIP ZOD.
 *
 * `z.object` supprime les clés qu'il ne déclare pas. Tant que `translations`
 * n'était pas au schéma, une traduction saisie survivait à la frappe (l'état
 * local n'est pas reparsé) puis disparaissait au RECHARGEMENT de l'éditeur, qui
 * amorce son état par `parsePortalPage(row.draft)`. Pire qu'une perte franche :
 * l'agent croyait avoir enregistré, et l'autosauvegarde réécrivait ensuite la
 * page sans ses traductions.
 */
describe("les traductions survivent au parse", () => {
  it("fait l'aller-retour sans rien perdre", () => {
    const stored = {
      version: 1,
      sections: [
        {
          id: "t",
          kind: "texte",
          title: "Nos horaires",
          body: "Du lundi au vendredi.",
          align: "left",
          translations: { en: { title: "Opening hours", body: "Monday to Friday." } },
        },
      ],
    };
    const page = parsePortalPage(stored);
    expect(page.sections[0].translations).toEqual({
      en: { title: "Opening hours", body: "Monday to Friday." },
    });
    // Et une seconde fois : c'est ce que fait un rechargement après autosave.
    expect(parsePortalPage(page).sections[0].translations).toEqual({
      en: { title: "Opening hours", body: "Monday to Friday." },
    });
  });

  it("garde celles des sous-blocs du pied de page", () => {
    const page = parsePortalPage({
      version: 1,
      sections: [
        {
          id: "f",
          kind: "footer",
          title: "",
          background: "#0f1f18",
          columns: 3,
          children: [
            {
              id: "c",
              kind: "texte",
              title: "Contact",
              body: "1 place de la Mairie",
              align: "left",
              translations: { en: { title: "Contact us" } },
            },
          ],
        },
      ],
    });
    const footer = page.sections[0];
    expect(footer.kind).toBe("footer");
    if (footer.kind !== "footer") return;
    expect(footer.children[0].translations).toEqual({ en: { title: "Contact us" } });
  });

  it("écarte une table de traductions abîmée sans emporter la section", () => {
    const page = parsePortalPage({
      version: 1,
      sections: [{ id: "t", kind: "texte", title: "Titre", translations: "n'importe quoi" }],
    });
    expect(page.sections).toHaveLength(1);
    expect(page.sections[0].title).toBe("Titre");
    expect(page.sections[0].translations).toEqual({});
  });

  it("dit quels textes une section propose à la traduction", () => {
    // La liste que l'inspecteur affiche EST celle qu'il a le droit d'effacer.
    expect(fieldsForKind("recherche")).toEqual(["title", "subtitle", "placeholder"]);
    expect(fieldsForKind("compte")).toEqual(["title", "subtitle"]);
    expect(fieldsForKind("texte")).toEqual(["title", "body"]);
    expect(fieldsForKind("demarches")).toEqual(["title"]);
    expect(fieldsForKind("footer")).toEqual(["title"]);
  });

  it("repère une section déjà traduite, sous-blocs compris", () => {
    const vierge = createSection("texte");
    expect(hasTranslations(vierge)).toBe(false);
    expect(hasTranslations({ ...vierge, translations: { en: { title: "T" } } })).toBe(true);

    const footer = createSection("footer");
    expect(hasTranslations({
      ...footer,
      children: [{ ...vierge, translations: { en: { title: "T" } } }],
    })).toBe(true);
  });
});

/**
 * Les deux bogues de l'éditeur, vus en vrai le 2026-09-07.
 *
 * Aucun n'était visible dans un test : le premier ne se manifeste qu'à la
 * frappe, le second qu'en appliquant plusieurs champs dans le même tick. Ils
 * vivent maintenant ici.
 */
describe("les traductions d'une section, à la frappe et à l'application", () => {
  it("garde les espaces qu'on tape", () => {
    // ⚠️ Le bogue : `translationsForWrite` élague, ce qui est juste au moment
    // d'enregistrer un formulaire et faux à chaque frappe — l'espace était
    // supprimé au moment même où on le tapait, rendant les espaces impossibles.
    let t = setSectionTranslation({}, "en", "title", "Find");
    t = setSectionTranslation(t, "en", "title", "Find ");
    expect(t.en.title).toBe("Find ");
    t = setSectionTranslation(t, "en", "title", "Find your service");
    expect(t.en.title).toBe("Find your service");
  });

  it("traite une case blanche comme une absence, et vide la langue", () => {
    const t = setSectionTranslation({ en: { title: "Find" } }, "en", "title", "   ");
    expect(t).toEqual({});
  });

  it("n'écrit jamais le français", () => {
    expect(setSectionTranslation({}, "fr", "title", "Trouvez")).toEqual({});
  });

  it("applique TOUS les champs d'une réponse, pas seulement le dernier", () => {
    // ⚠️ Le bogue : appliqués un par un, les trois champs repartaient du même
    // état et seul le dernier survivait — le titre et le sous-titre se
    // perdaient, il ne restait que le placeholder.
    const t = applySectionTranslations({}, {
      en: {
        title: "Find your service",
        subtitle: "One search box for all your requests",
        placeholder: "Search for a service",
      },
    });
    expect(t).toEqual({
      en: {
        title: "Find your service",
        subtitle: "One search box for all your requests",
        placeholder: "Search for a service",
      },
    });
  });

  it("compose avec ce qui est déjà traduit, sans l'écraser", () => {
    const t = applySectionTranslations({ en: { title: "Relu par un agent" } }, {
      en: { subtitle: "One search box" },
    });
    expect(t.en).toEqual({ title: "Relu par un agent", subtitle: "One search box" });
  });

  it("écarte un champ qui n'est pas un texte de section", () => {
    expect(applySectionTranslations({}, { en: { name: "Birth", title: "T" } })).toEqual({
      en: { title: "T" },
    });
  });
});
