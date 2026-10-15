import { describe, expect, it } from "vitest";
import { applicationsByOrganization, rootIdOf } from "./applications.ts";

const ROOT = "root";
const parents = new Map<string, string | null>([
  [ROOT, null],
  ["child", ROOT],
  ["grandchild", "child"],
  ["other-root", null],
]);

describe("rootIdOf", () => {
  it("remonte jusqu'à la racine", () => {
    expect(rootIdOf("grandchild", parents)).toBe(ROOT);
    expect(rootIdOf(ROOT, parents)).toBe(ROOT);
  });

  it("s'arrête au plus haut parent connu (périmètre d'une clé partenaire)", () => {
    const partial = new Map<string, string | null>([["child", ROOT], ["grandchild", "child"]]);
    expect(rootIdOf("grandchild", partial)).toBe("child");
  });

  it("ne boucle pas sur un cycle", () => {
    const cycle = new Map<string, string | null>([["a", "b"], ["b", "a"]]);
    expect(["a", "b"]).toContain(rootIdOf("a", cycle));
  });
});

describe("applicationsByOrganization", () => {
  const subs = [
    { organization_id: ROOT, application_id: "iris" },
    { organization_id: ROOT, application_id: "clara" },
    { organization_id: "other-root", application_id: "nora" },
    { organization_id: 42, application_id: "x" },
  ];

  it("une sous-organisation hérite des abonnements de sa racine, triés", () => {
    const out = applicationsByOrganization(["grandchild", ROOT, "other-root"], parents, subs);
    expect(out.get("grandchild")).toEqual(["clara", "iris"]);
    expect(out.get(ROOT)).toEqual(["clara", "iris"]);
    expect(out.get("other-root")).toEqual(["nora"]);
  });

  it("sans abonnement : liste vide", () => {
    const out = applicationsByOrganization(["child"], parents, []);
    expect(out.get("child")).toEqual([]);
  });
});
