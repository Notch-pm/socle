// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OrganizationProceduresTab } from "./OrganizationProceduresTab";

// Requêtes court-circuitées : on vérifie ce que l'onglet MONTRE d'un conflit,
// pas les allers-retours Supabase. La garantie, elle, est en base — le trigger
// `enforce_single_offer_per_bearer` refuse l'écriture de toute façon.
const h = vi.hoisted(() => ({
  organizations: [] as Record<string, unknown>[],
  ownBindings: [] as Record<string, unknown>[],
  siblingBindings: [] as Record<string, unknown>[],
  setEnabled: vi.fn(),
  enableMany: vi.fn(),
  procedures: [] as Record<string, unknown>[],
  categories: [] as Record<string, unknown>[],
}));

vi.mock("@/features/superadmin/organizations/useOrganizationsAdmin", async () => {
  // Les helpers d'arbre sont purs et testés : on garde les vrais, c'est
  // précisément la résolution du porteur qu'on veut voir à l'œuvre ici.
  const real = await vi.importActual<typeof import("@/features/superadmin/organizations/orgTree")>(
    "@/features/superadmin/organizations/orgTree",
  );
  return { ...real, useAllOrganizations: () => ({ data: h.organizations, isLoading: false }) };
});

vi.mock("./useOrganizationProcedures", () => ({
  useOrganizationProcedureBindings: () => ({ data: h.ownBindings }),
  useEnabledProcedureBindings: () => ({ data: h.siblingBindings }),
  useSetProcedureEnabled: () => ({ mutate: h.setEnabled, isPending: false, error: null }),
  useEnableProcedures: () => ({ mutate: h.enableMany, isPending: false, error: null }),
}));

vi.mock("@/features/procedures/useProcedures", () => ({
  useProceduresForOrg: () => ({ data: h.procedures, isLoading: false, isError: false }),
}));

vi.mock("@/features/categories/useCategories", () => ({
  useCategoriesQuery: () => ({ data: h.categories }),
}));

// Primitives Radix (Switch) : polyfills absents de jsdom.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

function org(id: string, name: string, parent_id: string | null, is_internal_service = false) {
  return { id, name, parent_id, is_internal_service, status: "active" };
}

const ARBRE = [
  org("accm", "ACCM", null),
  org("crau", "Mairie de Saint-Martin", "accm"),
  org("ec", "État civil", "crau", true),
  org("urba", "Urbanisme", "crau", true),
];

const switchFor = (name: string) =>
  screen.getByRole("switch", { name: `Activer « ${name} »` }) as HTMLButtonElement;

beforeEach(() => {
  h.organizations = ARBRE;
  h.ownBindings = [];
  h.siblingBindings = [];
  h.setEnabled.mockReset();
  h.enableMany.mockReset();
  h.procedures = [{ id: "p1", name: "Acte de naissance", category_id: null, type: "externe" }];
  h.categories = [];
});

describe("OrganizationProceduresTab — un seul instructeur par porteur", () => {
  it("verrouille la démarche déjà portée par un service frère, et le nomme", () => {
    h.siblingBindings = [{ organization_id: "urba", procedure_id: "p1", is_enabled: true }];
    render(<OrganizationProceduresTab organizationId="ec" />);

    expect(switchFor("Acte de naissance").disabled).toBe(true);
    // Nommer le service est le seul moyen d'agir : il faut aller l'y
    // désactiver. Le taire laisserait l'agent devant un interrupteur mort.
    expect(screen.getByText(/Déjà activée par « Urbanisme »/)).toBeTruthy();
  });

  it("verrouille aussi ce que porte le PORTEUR lui-même", () => {
    h.siblingBindings = [{ organization_id: "crau", procedure_id: "p1", is_enabled: true }];
    render(<OrganizationProceduresTab organizationId="ec" />);
    expect(switchFor("Acte de naissance").disabled).toBe(true);
  });

  it("ne verrouille pas ce qui est activé ICI : on doit pouvoir le relâcher", () => {
    h.ownBindings = [{ organization_id: "ec", procedure_id: "p1", is_enabled: true }];
    h.siblingBindings = [{ organization_id: "ec", procedure_id: "p1", is_enabled: true }];
    render(<OrganizationProceduresTab organizationId="ec" />);
    expect(switchFor("Acte de naissance").disabled).toBe(false);
  });

  it("laisse libre une démarche que personne du groupe ne porte", () => {
    h.siblingBindings = [{ organization_id: "urba", procedure_id: "autre", is_enabled: true }];
    render(<OrganizationProceduresTab organizationId="ec" />);
    expect(switchFor("Acte de naissance").disabled).toBe(false);
    expect(screen.queryByText(/Déjà activée par/)).toBeNull();
  });

  it("dit sous quel nom le site de démarches présentera ces démarches", () => {
    render(<OrganizationProceduresTab organizationId="ec" />);
    expect(screen.getByText(/présentées au nom de/)).toBeTruthy();
    expect(screen.getByText("Mairie de Saint-Martin")).toBeTruthy();
  });

  it("ne dit rien de tel sur une organisation qui n'est pas un service interne", () => {
    render(<OrganizationProceduresTab organizationId="crau" />);
    expect(screen.queryByText(/présentées au nom de/)).toBeNull();
  });
});

describe("OrganizationProceduresTab — groupement par catégorie et « Tout activer »", () => {
  beforeEach(() => {
    h.categories = [
      { id: "c-etat", name: "Actes d'état civil (Arpège)" },
      { id: "c-urba", name: "urbanisme (Arpège)" },
    ];
    h.procedures = [
      { id: "p1", name: "Acte de naissance", category_id: "c-etat", type: "externe" },
      { id: "p2", name: "Acte de décès", category_id: "c-etat", type: "externe" },
      { id: "p3", name: "Permis de construire", category_id: "c-urba", type: "externe" },
      { id: "p4", name: "Divers", category_id: null, type: "interne" },
    ];
  });

  it("une section par catégorie, alphabétique, « Sans catégorie » en dernier", () => {
    render(<OrganizationProceduresTab organizationId="crau" />);
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h3) => h3.textContent);
    expect(titles).toEqual([
      "Actes d'état civil (Arpège) · 0 / 2",
      "urbanisme (Arpège) · 0 / 1",
      "Sans catégorie · 0 / 1",
    ]);
  });

  it("« Tout activer » d'une catégorie active ses démarches non encore activées, sans tenir celles du groupe", () => {
    h.ownBindings = [{ organization_id: "ec", procedure_id: "p1", is_enabled: true }];
    h.siblingBindings = [{ organization_id: "urba", procedure_id: "p2", is_enabled: true }];
    render(<OrganizationProceduresTab organizationId="ec" />);
    // p1 déjà activée ici, p2 tenue par « Urbanisme » : rien à activer dans l'état civil.
    expect(
      (screen.getByRole("button", { name: "Tout activer dans « Actes d'état civil (Arpège) »" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tout activer dans « urbanisme (Arpège) »" }));
    expect(h.enableMany).toHaveBeenCalledWith({ organizationId: "ec", procedureIds: ["p3"] }, expect.anything());
  });

  it("« Tout activer » global demande confirmation, puis active tout ce qui peut l'être", () => {
    h.siblingBindings = [{ organization_id: "urba", procedure_id: "p2", is_enabled: true }];
    render(<OrganizationProceduresTab organizationId="ec" />);
    fireEvent.click(screen.getByRole("button", { name: "Tout activer" }));
    expect(h.enableMany).not.toHaveBeenCalled();
    expect(screen.getByText(/3 démarches seront activées/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Tout activer" }).at(-1)!);
    expect(h.enableMany).toHaveBeenCalledWith(
      { organizationId: "ec", procedureIds: ["p1", "p3", "p4"] },
      expect.anything(),
    );
  });
});
