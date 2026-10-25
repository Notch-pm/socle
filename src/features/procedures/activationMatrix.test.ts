import { describe, it, expect } from "vitest";
import type { Organization } from "@/features/superadmin/organizations/orgTree";
import {
  activationColumns,
  bearerGroups,
  buildEnabledMatrix,
  disableColumn,
  disableRow,
  enableColumn,
  enableRow,
  isEnabled,
  withPendingChanges,
} from "./activationMatrix";

const org = (id: string, name: string, parent_id: string | null = null, extra: Partial<Organization> = {}) =>
  ({ id, name, parent_id, is_internal_service: false, status: "active", ...extra }) as Organization;

// Ville (racine) > État civil (service interne), Annexe > Accueil annexe (service interne).
const ORGS = [
  org("ville", "Ville"),
  org("ec", "État civil", "ville", { is_internal_service: true }),
  org("annexe", "Annexe", "ville"),
  org("acc", "Accueil annexe", "annexe", { is_internal_service: true }),
  org("autre", "Autre racine"),
];
const columns = activationColumns(ORGS, "ville");
const groups = bearerGroups(columns);
const on = (organization_id: string, procedure_id: string) => ({ organization_id, procedure_id, is_enabled: true });

describe("activationColumns", () => {
  it("garde l'arbre de la racine, dans l'ordre de l'arbre, sans les autres racines", () => {
    expect(columns.map((c) => [c.organization.id, c.depth])).toEqual([
      ["ville", 1],
      ["annexe", 2],
      ["acc", 3],
      ["ec", 2],
    ]);
  });

  it("rend une liste vide pour une racine inconnue", () => {
    expect(activationColumns(ORGS, "nulle-part")).toEqual([]);
  });
});

describe("buildEnabledMatrix / withPendingChanges", () => {
  it("ne garde que les liaisons actives", () => {
    const m = buildEnabledMatrix([on("ville", "p1"), { organization_id: "annexe", procedure_id: "p1", is_enabled: false }]);
    expect(isEnabled(m, "ville", "p1")).toBe(true);
    expect(isEnabled(m, "annexe", "p1")).toBe(false);
  });

  it("applique les écritures en cours sans toucher la matrice d'origine", () => {
    const m = buildEnabledMatrix([on("ville", "p1")]);
    const shown = withPendingChanges(
      m,
      new Map([
        ["a", { organizationId: "ville", procedureId: "p1", enabled: false }],
        ["b", { organizationId: "annexe", procedureId: "p2", enabled: true }],
      ]),
    );
    expect(isEnabled(shown, "ville", "p1")).toBe(false);
    expect(isEnabled(shown, "annexe", "p2")).toBe(true);
    expect(isEnabled(m, "ville", "p1")).toBe(true);
  });
});

describe("bearerGroups", () => {
  it("dit quel autre organisme du groupe tient la démarche — dans les deux sens", () => {
    const m = buildEnabledMatrix([on("ec", "p1"), on("annexe", "p2")]);
    expect(groups.heldBy(m, "ville", "p1")?.id).toBe("ec");
    expect(groups.heldBy(m, "acc", "p2")?.id).toBe("annexe");
    // Deux porteurs différents ne se gênent pas.
    expect(groups.heldBy(m, "annexe", "p1")).toBeUndefined();
    expect(groups.heldBy(m, "ec", "p1")).toBeUndefined();
  });
});

describe("lots d'une colonne", () => {
  it("« Tous » écarte ce qui est déjà coché et ce que le groupe tient", () => {
    const m = buildEnabledMatrix([on("ville", "p1"), on("ec", "p2")]);
    expect(enableColumn("ville", ["p1", "p2", "p3"], m, groups)).toEqual([
      { organizationId: "ville", procedureId: "p3", enabled: true },
    ]);
  });

  it("« Aucun » ne touche que ce qui est coché", () => {
    const m = buildEnabledMatrix([on("ville", "p1")]);
    expect(disableColumn("ville", ["p1", "p2"], m)).toEqual([
      { organizationId: "ville", procedureId: "p1", enabled: false },
    ]);
  });
});

describe("lots d'une ligne", () => {
  it("« Tous » coche chaque porteur libre, jamais un service interne", () => {
    const m = buildEnabledMatrix([]);
    expect(enableRow("p1", columns, m, groups).map((c) => c.organizationId)).toEqual(["ville", "annexe"]);
  });

  it("« Tous » saute un porteur dont un service interne tient déjà la démarche", () => {
    const m = buildEnabledMatrix([on("acc", "p1")]);
    expect(enableRow("p1", columns, m, groups).map((c) => c.organizationId)).toEqual(["ville"]);
  });

  it("« Tous » ne coche pas un organisme obsolète", () => {
    const cols = activationColumns([org("r", "R"), org("old", "Ancien", "r", { status: "obsolete" })], "r");
    const m = buildEnabledMatrix([]);
    expect(enableRow("p1", cols, m, bearerGroups(cols)).map((c) => c.organizationId)).toEqual(["r"]);
  });

  it("« Aucun » décoche partout, services internes compris", () => {
    const m = buildEnabledMatrix([on("ec", "p1"), on("annexe", "p1")]);
    expect(disableRow("p1", columns, m).map((c) => c.organizationId)).toEqual(["annexe", "ec"]);
  });
});
