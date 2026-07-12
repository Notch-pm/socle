import { describe, it, expect } from "vitest";
import { insertNode, moveNode, ROOT_DROP_ID } from "./formReorder";
import type { Field, FormNode, Section } from "./formSchema";

function field(id: string): Field {
  return { id, key: id, type: "text", label: id };
}
function section(id: string, fields: Field[]): Section {
  return { id, kind: "section", title: id, fields };
}

/** Racine : [f0, sA(a1, a2), f3, sB(b1)] — la topologie de référence des tests. */
function makeContent(): FormNode[] {
  return [
    field("f0"),
    section("sA", [field("a1"), field("a2")]),
    field("f3"),
    section("sB", [field("b1")]),
  ];
}

/** Ids à plat « racine / section:champs » pour des assertions lisibles. */
function shape(content: FormNode[]): string[] {
  return content.map((n) =>
    "kind" in n ? `${n.id}(${n.fields.map((f) => f.id).join(",")})` : n.id,
  );
}

describe("moveNode — champ entre conteneurs", () => {
  it("racine → section : déposé sur la section, le champ va à la fin de celle-ci", () => {
    expect(shape(moveNode(makeContent(), "f0", "sA"))).toEqual([
      "sA(a1,a2,f0)",
      "f3",
      "sB(b1)",
    ]);
  });

  it("racine → section : déposé sur un champ de la section, il s'insère avant ou après lui", () => {
    expect(shape(moveNode(makeContent(), "f0", "a2", "before"))).toEqual([
      "sA(a1,f0,a2)",
      "f3",
      "sB(b1)",
    ]);
    expect(shape(moveNode(makeContent(), "f0", "a2", "after"))).toEqual([
      "sA(a1,a2,f0)",
      "f3",
      "sB(b1)",
    ]);
  });

  it("section → racine : déposé sur un champ racine, il s'insère à sa position", () => {
    expect(shape(moveNode(makeContent(), "a1", "f3", "before"))).toEqual([
      "f0",
      "sA(a2)",
      "a1",
      "f3",
      "sB(b1)",
    ]);
    expect(shape(moveNode(makeContent(), "a1", "f0", "after"))).toEqual([
      "f0",
      "a1",
      "sA(a2)",
      "f3",
      "sB(b1)",
    ]);
  });

  it("section → racine : déposé sur la zone racine, il va à la fin du formulaire", () => {
    expect(shape(moveNode(makeContent(), "a1", ROOT_DROP_ID))).toEqual([
      "f0",
      "sA(a2)",
      "f3",
      "sB(b1)",
      "a1",
    ]);
  });

  it("section → section : le champ passe d'une section à l'autre", () => {
    expect(shape(moveNode(makeContent(), "a2", "b1", "before"))).toEqual([
      "f0",
      "sA(a1)",
      "f3",
      "sB(a2,b1)",
    ]);
    expect(shape(moveNode(makeContent(), "a2", "sB"))).toEqual([
      "f0",
      "sA(a1)",
      "f3",
      "sB(b1,a2)",
    ]);
  });
});

describe("moveNode — réordonnancement dans un même conteneur", () => {
  it("réordonne les nœuds racine (sémantique arrayMove)", () => {
    expect(shape(moveNode(makeContent(), "f0", "f3"))).toEqual([
      "sA(a1,a2)",
      "f3",
      "f0",
      "sB(b1)",
    ]);
  });

  it("réordonne les champs au sein d'une section", () => {
    expect(shape(moveNode(makeContent(), "a1", "a2"))).toEqual([
      "f0",
      "sA(a2,a1)",
      "f3",
      "sB(b1)",
    ]);
  });

  it("un champ déposé sur sa propre section va à la fin de celle-ci", () => {
    expect(shape(moveNode(makeContent(), "a1", "sA"))).toEqual([
      "f0",
      "sA(a2,a1)",
      "f3",
      "sB(b1)",
    ]);
  });

  it("un champ racine déposé sur la zone racine va à la fin", () => {
    expect(shape(moveNode(makeContent(), "f0", ROOT_DROP_ID))).toEqual([
      "sA(a1,a2)",
      "f3",
      "sB(b1)",
      "f0",
    ]);
  });
});

describe("moveNode — sections (niveau racine uniquement)", () => {
  it("réordonne une section déposée sur un nœud racine", () => {
    expect(shape(moveNode(makeContent(), "sA", "f3"))).toEqual([
      "f0",
      "f3",
      "sA(a1,a2)",
      "sB(b1)",
    ]);
  });

  it("déposée sur un champ d'une autre section, elle prend le rang de cette section", () => {
    expect(shape(moveNode(makeContent(), "sA", "b1"))).toEqual([
      "f0",
      "f3",
      "sB(b1)",
      "sA(a1,a2)",
    ]);
  });

  it("déposée sur la zone racine, elle va à la fin", () => {
    expect(shape(moveNode(makeContent(), "sA", ROOT_DROP_ID))).toEqual([
      "f0",
      "f3",
      "sB(b1)",
      "sA(a1,a2)",
    ]);
  });

  it("déposée sur l'un de ses propres champs, rien ne bouge", () => {
    const content = makeContent();
    expect(moveNode(content, "sA", "a2")).toBe(content);
  });
});

describe("moveNode — cas dégénérés", () => {
  it("cible = source, id inconnu ou cible inconnue → contenu inchangé", () => {
    const content = makeContent();
    expect(moveNode(content, "f0", "f0")).toBe(content);
    expect(moveNode(content, "inconnu", "f0")).toBe(content);
    expect(moveNode(content, "f0", "inconnu")).toBe(content);
  });
});

describe("insertNode — ajout depuis la palette", () => {
  it("sans cible (clic), ajoute à la fin de la racine", () => {
    expect(shape(insertNode(makeContent(), field("n"), null))).toEqual([
      "f0",
      "sA(a1,a2)",
      "f3",
      "sB(b1)",
      "n",
    ]);
  });

  it("déposé sur un champ racine, s'insère avant ou après lui", () => {
    expect(shape(insertNode(makeContent(), field("n"), "f3", "before"))).toEqual([
      "f0",
      "sA(a1,a2)",
      "n",
      "f3",
      "sB(b1)",
    ]);
    expect(shape(insertNode(makeContent(), field("n"), "f3", "after"))).toEqual([
      "f0",
      "sA(a1,a2)",
      "f3",
      "n",
      "sB(b1)",
    ]);
  });

  it("déposé sur une section, entre dans la section (à la fin)", () => {
    expect(shape(insertNode(makeContent(), field("n"), "sA"))).toEqual([
      "f0",
      "sA(a1,a2,n)",
      "f3",
      "sB(b1)",
    ]);
  });

  it("déposé sur un champ de section, s'insère dans la section à sa position", () => {
    expect(shape(insertNode(makeContent(), field("n"), "a2", "before"))).toEqual([
      "f0",
      "sA(a1,n,a2)",
      "f3",
      "sB(b1)",
    ]);
  });

  it("une section reste au niveau racine, même déposée sur un champ de section", () => {
    expect(shape(insertNode(makeContent(), section("sN", []), "a2", "after"))).toEqual([
      "f0",
      "sA(a1,a2)",
      "sN()",
      "f3",
      "sB(b1)",
    ]);
    expect(shape(insertNode(makeContent(), section("sN", []), "f0", "before"))).toEqual([
      "sN()",
      "f0",
      "sA(a1,a2)",
      "f3",
      "sB(b1)",
    ]);
  });

  it("cible inconnue ou zone racine → ajout à la fin", () => {
    expect(shape(insertNode(makeContent(), field("n"), "inconnu"))).toContain("n");
    expect(shape(insertNode(makeContent(), field("n"), ROOT_DROP_ID)).at(-1)).toBe("n");
  });
});
