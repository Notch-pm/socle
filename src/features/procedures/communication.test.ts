import { describe, it, expect } from "vitest";
import {
  availableTemplates,
  cleanCommunicationConfig,
  defaultCommunicationConfig,
  documentGroupOf,
  documentVisibilityLabel,
  parseCommunicationConfig,
  publicationPeriodError,
  resolveDocuments,
  templatesForGroup,
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
      documents: {
        restrictVisibility: false,
        documents: [],
        letters: [],
      },
    });
  });
});

describe("documentVisibilityLabel", () => {
  it("nomme les trois conditions en français", () => {
    expect(documentVisibilityLabel("toujours")).toBe("Toujours");
    expect(documentVisibilityLabel("positive")).toBe("Demandes traitées positivement");
    expect(documentVisibilityLabel("negative")).toBe("Demandes traitées négativement");
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
      // Bloc absent du stocké : complété par ses défauts vides.
      documents: { restrictVisibility: false, documents: [], letters: [] },
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

describe("bloc documents — défauts", () => {
  it("est vide par défaut : une démarche jamais paramétrée ne propose rien", () => {
    // Le contraire de `visibility`, dont les défauts sont actifs. Une colonne
    // NULL ne doit pas déverser tout le catalogue dans chaque démarche.
    const config = parseCommunicationConfig(null);
    expect(config.documents).toEqual({
      restrictVisibility: false,
      documents: [],
      letters: [],
    });
  });

  it("lit un bloc documents même quand `visibility` est absent", () => {
    // Régression : le parseur sortait dès que `visibility` manquait, et le bloc
    // documents était perdu en silence.
    const config = parseCommunicationConfig({
      documents: { restrictVisibility: true, letters: [{ id: "l1", visibility: "positive" }] },
    });
    expect(config.documents.restrictVisibility).toBe(true);
    expect(config.documents.letters).toEqual([{ id: "l1", visibility: "positive" }]);
    expect(config.visibility.portalVisible).toBe(true);
  });
});

describe("bloc documents — robustesse", () => {
  it("écarte les entrées sans identifiant exploitable", () => {
    const config = parseCommunicationConfig({
      documents: { documents: [{ id: "  " }, { id: 42 }, null, "d1", { id: "ok" }] },
    });
    expect(config.documents.documents).toEqual([{ id: "ok", visibility: "toujours" }]);
  });

  it("dédoublonne en conservant la première place", () => {
    const config = parseCommunicationConfig({
      documents: {
        documents: [
          { id: "a", visibility: "positive" },
          { id: "b" },
          { id: "a", visibility: "negative" },
        ],
      },
    });
    expect(config.documents.documents.map((d) => d.id)).toEqual(["a", "b"]);
    expect(config.documents.documents[0].visibility).toBe("positive");
  });

  it("retombe sur `toujours` pour une condition inconnue", () => {
    // Le document a été explicitement choisi : une condition illisible ne doit
    // pas le faire disparaître, seulement cesser de le restreindre.
    const config = parseCommunicationConfig({
      documents: { letters: [{ id: "l", visibility: "peut-être" }] },
    });
    expect(config.documents.letters[0].visibility).toBe("toujours");
  });

  it("conserve les conditions quand la restriction est désactivée", () => {
    // Le commutateur gouverne l'usage, pas la donnée : revenir en arrière ne
    // doit rien perdre (même parti que la période de publication).
    const config = parseCommunicationConfig({
      documents: {
        restrictVisibility: false,
        letters: [{ id: "l", visibility: "negative" }],
      },
    });
    expect(config.documents.letters[0].visibility).toBe("negative");
  });

  it("est idempotent", () => {
    const once = parseCommunicationConfig({
      documents: { restrictVisibility: true, documents: [{ id: "a", visibility: "positive" }] },
    });
    expect(cleanCommunicationConfig(once)).toEqual(once);
  });
});

describe("groupes et disponibilité", () => {
  const catalogue = [
    { id: "d1", type: "interne" },
    { id: "d2", type: "externe" },
    { id: "c1", type: "courrier" },
  ];

  it("range les courriers d'un côté, interne et externe de l'autre", () => {
    expect(documentGroupOf("courrier")).toBe("letter");
    expect(documentGroupOf("interne")).toBe("document");
    expect(documentGroupOf("externe")).toBe("document");
    expect(templatesForGroup(catalogue, "document").map((t) => t.id)).toEqual(["d1", "d2"]);
    expect(templatesForGroup(catalogue, "letter").map((t) => t.id)).toEqual(["c1"]);
  });

  it("ne propose que ce qui n'est pas déjà sélectionné", () => {
    const selected = [{ id: "d1", visibility: "toujours" as const }];
    expect(availableTemplates(catalogue, "document", selected).map((t) => t.id)).toEqual(["d2"]);
  });

  it("ne propose plus rien quand tout le groupe est pris (bouton inactif)", () => {
    const selected = [
      { id: "d1", visibility: "toujours" as const },
      { id: "d2", visibility: "toujours" as const },
    ];
    expect(availableTemplates(catalogue, "document", selected)).toEqual([]);
  });

  it("ignore le groupe voisin dans le décompte des disponibles", () => {
    const selected = [{ id: "c1", visibility: "toujours" as const }];
    expect(availableTemplates(catalogue, "document", selected).map((t) => t.id)).toEqual([
      "d1",
      "d2",
    ]);
  });
});

describe("resolveDocuments", () => {
  const catalogue = [
    { id: "d1", type: "interne" },
    { id: "d2", type: "externe" },
  ];

  it("résout dans l'ordre choisi, pas dans celui du catalogue", () => {
    const resolved = resolveDocuments(
      [
        { id: "d2", visibility: "positive" },
        { id: "d1", visibility: "toujours" },
      ],
      catalogue,
    );
    expect(resolved.map((r) => r.template.id)).toEqual(["d2", "d1"]);
    expect(resolved[0].visibility).toBe("positive");
  });

  it("écarte une référence dont le document a été supprimé du catalogue", () => {
    // Le JSON ne porte pas de clé étrangère : une sélection survit à son
    // document. Mieux vaut ne rien servir qu'un document introuvable.
    const resolved = resolveDocuments(
      [
        { id: "disparu", visibility: "toujours" },
        { id: "d1", visibility: "toujours" },
      ],
      catalogue,
    );
    expect(resolved.map((r) => r.template.id)).toEqual(["d1"]);
  });
});
