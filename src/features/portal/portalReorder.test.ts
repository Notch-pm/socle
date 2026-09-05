import { describe, expect, it } from "vitest";
import { createSection, type PortalSection } from "./portalPage";
import {
  insertSection,
  moveSection,
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

  it("ajoute en fin si la cible est inconnue", () => {
    const next = insertSection(page(), { ...createSection("compte"), id: "n" }, "zzz");
    expect(ids(next)).toEqual(["a", "b", "c", "n"]);
  });

  it("ne modifie pas la liste d'origine", () => {
    const original = page();
    insertSection(original, { ...createSection("compte"), id: "n" }, null);
    expect(ids(original)).toEqual(["a", "b", "c"]);
  });
});

describe("moveSection", () => {
  it("suit la sémantique arrayMove, dans les deux sens", () => {
    expect(ids(moveSection(page(), "a", "c"))).toEqual(["b", "c", "a"]);
    expect(ids(moveSection(page(), "c", "a"))).toEqual(["c", "a", "b"]);
  });

  it("rend la même référence quand rien ne bouge", () => {
    const original = page();
    expect(moveSection(original, "a", "a")).toBe(original);
    expect(moveSection(original, "a", "zzz")).toBe(original);
    expect(moveSection(original, "zzz", "a")).toBe(original);
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
