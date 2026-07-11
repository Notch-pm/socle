import { describe, expect, it } from "vitest";
import { buildOrganizationTree, isUuid } from "./scope.ts";
import type { OrganizationDto } from "./dto.ts";

function org(id: string, parent_id: string | null, name: string): OrganizationDto {
  return {
    id,
    parent_id,
    name,
    slug: null,
    type: null,
    status: "active",
    address: null,
    phone: null,
    email: null,
    logo_url: null,
    email_sender_override: false,
    email_sender_name: null,
    metadata: null,
    created_at: null,
  };
}

describe("isUuid", () => {
  it("accepte un UUID valide", () => {
    expect(isUuid("d5227d25-f327-493a-a9a2-278397531e33")).toBe(true);
  });
  it("rejette une valeur non-UUID", () => {
    expect(isUuid("42")).toBe(false);
    expect(isUuid("../etc/passwd")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("buildOrganizationTree", () => {
  it("imbrique les enfants sous leur parent et trie par nom", () => {
    const flat = [
      org("root", null, "Racine"),
      org("b", "root", "Beta"),
      org("a", "root", "Alpha"),
      org("a1", "a", "Alpha-1"),
    ];
    const tree = buildOrganizationTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("root");
    expect(tree[0].children.map((c) => c.id)).toEqual(["a", "b"]); // trié : Alpha avant Beta
    expect(tree[0].children[0].children[0].id).toBe("a1");
  });

  it("promeut en racine une org dont le parent est hors périmètre", () => {
    const tree = buildOrganizationTree([org("child", "absent-parent", "Enfant")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("child");
  });
});
