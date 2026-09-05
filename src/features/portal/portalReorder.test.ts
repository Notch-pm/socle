import { describe, expect, it } from "vitest";
import { createSection, type PortalSection } from "./portalPage";
import {
  dropIndex,
  insertSection,
  moveSection,
  moveSectionToIndex,
  removeSection,
  replaceSection,
  resolveDropPosition,
  shiftSection,
} from "./portalReorder";

function page(): PortalSection[] {
  return [
    { ...createSection("recherche"), id: "a" },
    { ...createSection("demarches"), id: "b" },
    { ...createSection("texte"), id: "c" },
  ];
}

const ids = (sections: PortalSection[]) => sections.map((s) => s.id);

describe("dropIndex — le nombre que l'ombre et le dépôt partagent", () => {
  it("désigne la place avant ou après la cible", () => {
    expect(dropIndex(page(), "b", "before")).toBe(1);
    expect(dropIndex(page(), "b", "after")).toBe(2);
    expect(dropIndex(page(), "a", "before")).toBe(0);
    expect(dropIndex(page(), "c", "after")).toBe(3);
  });

  it("désigne la fin sans cible ou avec une cible inconnue", () => {
    expect(dropIndex(page(), null)).toBe(3);
    expect(dropIndex(page(), "zzz")).toBe(3);
  });
});

describe("insertSection", () => {
  it("ajoute en fin sans cible (clic dans la palette)", () => {
    const next = insertSection(page(), { ...createSection("compte"), id: "n" }, null);
    expect(ids(next)).toEqual(["a", "b", "c", "n"]);
  });

  it("insère avant ou après la cible selon la position", () => {
    const n = { ...createSection("compte"), id: "n" };
    expect(ids(insertSection(page(), n, "b", "before"))).toEqual(["a", "n", "b", "c"]);
    expect(ids(insertSection(page(), n, "b", "after"))).toEqual(["a", "b", "n", "c"]);
  });

  it("ne modifie pas la liste d'origine", () => {
    const original = page();
    insertSection(original, { ...createSection("compte"), id: "n" }, null);
    expect(ids(original)).toEqual(["a", "b", "c"]);
  });
});

describe("moveSectionToIndex — l'index est celui de la liste AVANT retrait", () => {
  it("corrige le décalage quand on descend", () => {
    // « a » déposé après « c » : l'ombre est à l'index 3 de [a, b, c] ; une
    // fois « a » retirée, cette place est l'index 2.
    expect(ids(moveSectionToIndex(page(), "a", 3))).toEqual(["b", "c", "a"]);
    expect(ids(moveSectionToIndex(page(), "a", 2))).toEqual(["b", "a", "c"]);
  });

  it("ne corrige rien quand on monte", () => {
    expect(ids(moveSectionToIndex(page(), "c", 0))).toEqual(["c", "a", "b"]);
    expect(ids(moveSectionToIndex(page(), "c", 1))).toEqual(["a", "c", "b"]);
  });

  it("rend la même référence quand la destination est la place actuelle", () => {
    // Déposer « b » juste avant ou juste après elle-même ne change rien : les
    // deux ombres possibles autour du bloc saisi sont des non-gestes.
    const original = page();
    expect(moveSectionToIndex(original, "b", 1)).toBe(original);
    expect(moveSectionToIndex(original, "b", 2)).toBe(original);
    expect(moveSectionToIndex(original, "zzz", 0)).toBe(original);
  });
});

describe("moveSection — avant / après la cible, comme l'ombre", () => {
  it("dépose avant ou après la cible", () => {
    expect(ids(moveSection(page(), "a", "c", "before"))).toEqual(["b", "a", "c"]);
    expect(ids(moveSection(page(), "a", "c", "after"))).toEqual(["b", "c", "a"]);
    expect(ids(moveSection(page(), "c", "a", "before"))).toEqual(["c", "a", "b"]);
  });

  it("rend la même référence quand rien ne bouge", () => {
    const original = page();
    expect(moveSection(original, "a", "a")).toBe(original);
    expect(moveSection(original, "a", "zzz")).toBe(original);
    expect(moveSection(original, "zzz", "a")).toBe(original);
    expect(moveSection(original, "a", "b", "before")).toBe(original);
  });
});

describe("shiftSection", () => {
  it("décale d'un cran, et s'arrête en butée", () => {
    expect(ids(shiftSection(page(), "b", -1))).toEqual(["b", "a", "c"]);
    expect(ids(shiftSection(page(), "b", 1))).toEqual(["a", "c", "b"]);
    const original = page();
    expect(shiftSection(original, "a", -1)).toBe(original);
    expect(shiftSection(original, "c", 1)).toBe(original);
    expect(shiftSection(original, "zzz", 1)).toBe(original);
  });
});

describe("replaceSection / removeSection", () => {
  it("remplace par id sans toucher aux voisines", () => {
    const next = replaceSection(page(), { ...createSection("texte"), id: "b", title: "Nouveau" });
    expect(next[1]).toMatchObject({ id: "b", kind: "texte", title: "Nouveau" });
    expect(next[0].id).toBe("a");
    expect(next[2].id).toBe("c");
  });

  it("retire par id", () => {
    expect(ids(removeSection(page(), "b"))).toEqual(["a", "c"]);
    expect(ids(removeSection(page(), "zzz"))).toEqual(["a", "b", "c"]);
  });
});

describe("resolveDropPosition", () => {
  it("décide selon le centre de l'élément déplacé", () => {
    const over = { top: 100, height: 50 }; // centre à 125
    expect(resolveDropPosition({ top: 90, height: 20 }, over)).toBe("before"); // centre 100
    expect(resolveDropPosition({ top: 120, height: 20 }, over)).toBe("after"); // centre 130
  });

  it("choisit « avant » sans géométrie — le choix qui ne saute rien", () => {
    expect(resolveDropPosition(null, { top: 0, height: 10 })).toBe("before");
    expect(resolveDropPosition({ top: 0, height: 10 }, null)).toBe("before");
  });
});
