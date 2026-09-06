import { describe, it, expect } from "vitest";
import {
  buildOrgTree,
  collectDescendantIds,
  collectDescendantIdsFlat,
  findRootAncestor,
  sortedRootOrganizations,
  visibleRootOrganizations,
  type Organization,
  type OrgNode,
} from "./orgTree";

/** Fabrique un enregistrement `organizations` minimal mais complet pour les tests. */
function org(id: string, name: string, parent_id: string | null = null): Organization {
  return {
    id,
    name,
    parent_id,
    address: null,
    created_at: null,
    email: null,
    email_sender_name: null,
    email_sender_override: false,
    enabled_languages: ["fr"],
    logo_url: null,
    logo_white_url: null,
    primary_color: null,
    secondary_color: null,
    branding_inherit_parent: parent_id !== null,
    metadata: null,
    phone: null,
    slug: null,
    status: "active",
    type: null,
  };
}

/** Récupère un nœud par id dans une forêt (parcours en profondeur). */
function find(nodes: OrgNode[], id: string): OrgNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = find(n.children, id);
    if (hit) return hit;
  }
  return undefined;
}

describe("buildOrgTree", () => {
  it("renvoie une forêt vide pour une liste vide", () => {
    expect(buildOrgTree([])).toEqual([]);
  });

  it("rattache les enfants à leur parent et calcule la profondeur (1-based)", () => {
    const tree = buildOrgTree([
      org("root", "Racine"),
      org("child", "Enfant", "root"),
      org("grandchild", "Petit-enfant", "child"),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("root");
    expect(tree[0].depth).toBe(1);

    const child = tree[0].children[0];
    expect(child.id).toBe("child");
    expect(child.depth).toBe(2);
    expect(child.children[0].id).toBe("grandchild");
    expect(child.children[0].depth).toBe(3);
  });

  it("trie racines et enfants par nom (locale FR)", () => {
    const tree = buildOrgTree([
      org("b", "Beta"),
      org("a", "Alpha"),
      org("a2", "Zeta", "a"),
      org("a1", "Ancre", "a"),
    ]);

    expect(tree.map((n) => n.name)).toEqual(["Alpha", "Beta"]);
    expect(tree[0].children.map((n) => n.name)).toEqual(["Ancre", "Zeta"]);
  });

  it("promeut un orphelin (parent hors périmètre visible) en racine de la forêt", () => {
    // Cas d'un admin qui voit son sous-arbre mais pas l'ancêtre référencé par parent_id.
    const tree = buildOrgTree([
      org("visible", "Visible", "invisible-ancestor"),
      org("leaf", "Feuille", "visible"),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("visible");
    expect(tree[0].depth).toBe(1);
    expect(tree[0].children[0].id).toBe("leaf");
  });

  it("ne mute pas les objets d'entrée", () => {
    const input = [org("root", "Racine"), org("child", "Enfant", "root")];
    const snapshot = JSON.parse(JSON.stringify(input));
    buildOrgTree(input);
    expect(input).toEqual(snapshot);
  });
});

describe("collectDescendantIds", () => {
  it("renvoie tous les ids strictement sous le nœud", () => {
    const tree = buildOrgTree([
      org("root", "Racine"),
      org("a", "A", "root"),
      org("b", "B", "root"),
      org("a1", "A1", "a"),
    ]);

    const root = find(tree, "root")!;
    expect(collectDescendantIds(root).sort()).toEqual(["a", "a1", "b"]);
  });

  it("renvoie une liste vide pour une feuille", () => {
    const tree = buildOrgTree([org("root", "Racine"), org("leaf", "Feuille", "root")]);
    const leaf = find(tree, "leaf")!;
    expect(collectDescendantIds(leaf)).toEqual([]);
  });

  it("n'inclut pas le nœud lui-même", () => {
    const tree = buildOrgTree([org("root", "Racine"), org("child", "Enfant", "root")]);
    const root = find(tree, "root")!;
    expect(collectDescendantIds(root)).not.toContain("root");
  });
});

describe("collectDescendantIdsFlat", () => {
  const flat = [
    org("root", "Racine"),
    org("a", "A", "root"),
    org("b", "B", "root"),
    org("a1", "A1", "a"),
  ];

  it("renvoie toute la descendance depuis la liste plate", () => {
    expect(collectDescendantIdsFlat(flat, "root").sort()).toEqual(["a", "a1", "b"]);
  });

  it("renvoie une liste vide pour une feuille ou un id inconnu", () => {
    expect(collectDescendantIdsFlat(flat, "a1")).toEqual([]);
    expect(collectDescendantIdsFlat(flat, "absent")).toEqual([]);
  });
});

describe("sortedRootOrganizations", () => {
  it("ne garde que les racines strictes (parent_id null), triées par nom (locale FR)", () => {
    const result = sortedRootOrganizations([
      org("z", "Zeta"),
      org("child", "Enfant", "z"),
      org("e", "Étoile"), // accent : un tri ASCII la placerait après « Zeta »
      org("a", "Alpha"),
      org("orphan", "Orphelin", "hors-perimetre"),
    ]);

    expect(result.map((o) => o.id)).toEqual(["a", "e", "z"]);
  });

  it("ne mute pas la liste d'entrée", () => {
    const input = [org("b", "Beta"), org("a", "Alpha")];
    sortedRootOrganizations(input);
    expect(input.map((o) => o.id)).toEqual(["b", "a"]);
  });
});

describe("findRootAncestor", () => {
  const flat = [
    org("root", "Racine"),
    org("child", "Enfant", "root"),
    org("grandchild", "Petit-enfant", "child"),
  ];

  it("remonte jusqu'à la racine (parent_id null)", () => {
    expect(findRootAncestor(flat, "grandchild")?.id).toBe("root");
    expect(findRootAncestor(flat, "child")?.id).toBe("root");
  });

  it("renvoie l'org elle-même si elle est déjà racine", () => {
    expect(findRootAncestor(flat, "root")?.id).toBe("root");
  });

  it("s'arrête au sommet visible quand l'ancêtre est hors périmètre", () => {
    // L'admin voit « visible » et sa feuille, mais pas l'ancêtre référencé.
    const partial = [
      org("visible", "Visible", "invisible-ancestor"),
      org("leaf", "Feuille", "visible"),
    ];
    expect(findRootAncestor(partial, "leaf")?.id).toBe("visible");
  });

  it("renvoie undefined pour un id absent", () => {
    expect(findRootAncestor(flat, "absent")).toBeUndefined();
  });
});

describe("visibleRootOrganizations", () => {
  it("garde les racines strictes, triées par nom", () => {
    const flat = [org("b", "Bravo"), org("a", "Alpha"), org("c", "Charlie", "a")];
    expect(visibleRootOrganizations(flat).map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("promeut l'org dont le parent est hors périmètre RLS", () => {
    // Le cas du membre d'une sous-organisation : sa racine ne lui est pas
    // visible, l'en-tête doit tout de même porter une identité.
    const partial = [org("sous", "Sous-organisation", "racine-invisible")];
    expect(visibleRootOrganizations(partial).map((o) => o.id)).toEqual(["sous"]);
  });

  it("n'a pas de sommet quand rien n'est visible", () => {
    expect(visibleRootOrganizations([])).toEqual([]);
  });

  it("ne promeut pas un enfant dont le parent EST visible", () => {
    const flat = [org("racine", "Racine"), org("enfant", "Enfant", "racine")];
    expect(visibleRootOrganizations(flat).map((o) => o.id)).toEqual(["racine"]);
  });
});
