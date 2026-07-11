import { describe, it, expect } from "vitest";
import { buildEnabledProcedureIds, type OrganizationProcedure } from "./organizationProcedures";

/** Fabrique une liaison minimale mais complète pour les tests. */
function binding(
  procedure_id: string | null,
  is_enabled: boolean | null,
): OrganizationProcedure {
  return {
    id: `${procedure_id}-binding`,
    organization_id: "org-1",
    procedure_id,
    is_enabled,
    custom_name: null,
    custom_order: null,
    metadata: null,
  };
}

describe("buildEnabledProcedureIds", () => {
  it("ne garde que les liaisons is_enabled === true", () => {
    const set = buildEnabledProcedureIds([
      binding("p1", true),
      binding("p2", false),
      binding("p3", null),
      binding("p4", true),
    ]);
    expect([...set].sort()).toEqual(["p1", "p4"]);
  });

  it("ignore les liaisons sans procedure_id", () => {
    const set = buildEnabledProcedureIds([binding(null, true)]);
    expect(set.size).toBe(0);
  });

  it("renvoie un ensemble vide pour une liste vide", () => {
    expect(buildEnabledProcedureIds([]).size).toBe(0);
  });
});
