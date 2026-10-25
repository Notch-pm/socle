// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Organization } from "@/features/superadmin/organizations/orgTree";

const h = vi.hoisted(() => ({
  orgs: [] as Organization[],
  bindings: [] as Array<{ organization_id: string; procedure_id: string; is_enabled: boolean }>,
  writes: [] as Array<Array<{ organizationId: string; procedureId: string; enabled: boolean }>>,
}));

vi.mock("@/features/superadmin/organizations/useOrganizationsAdmin", () => ({
  useAllOrganizations: () => ({ data: h.orgs }),
}));
vi.mock("@/features/procedures/useWritableRootOrganizations", () => ({
  useWritableRootOrganizations: () => ({
    data: h.orgs.filter((o) => o.parent_id === null),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/features/procedures/useProcedures", () => ({
  useProceduresForOrg: () => ({
    data: [
      { id: "p1", name: "Acte de naissance", category_id: "cat", status: "production" },
      { id: "p2", name: "Inscription scolaire", category_id: "cat", status: "brouillon" },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/features/categories/useCategories", () => ({
  useCategoriesQuery: () => ({ data: [{ id: "cat", name: "Famille" }] }),
}));
vi.mock("@/features/organizations/useOrganizationProcedures", () => ({
  useEnabledProcedureBindings: () => ({ data: h.bindings, isLoading: false }),
  useSetProceduresEnabled: () => ({
    mutateAsync: async (changes: (typeof h.writes)[number]) => {
      h.writes.push(changes);
    },
  }),
}));

import { ProcedureActivationPage } from "./ProcedureActivationPage";

const org = (id: string, name: string, parent_id: string | null = null, is_internal_service = false) =>
  ({ id, name, parent_id, is_internal_service, status: "active" }) as Organization;

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/demarches/activation"]}>
      <ProcedureActivationPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.orgs = [org("ville", "Ville"), org("ec", "État civil", "ville", true), org("annexe", "Annexe", "ville")];
  h.bindings = [{ organization_id: "ec", procedure_id: "p1", is_enabled: true }];
  h.writes = [];
});

describe("ProcedureActivationPage", () => {
  it("croise démarches et organismes, et grise ce que le groupe tient déjà", () => {
    renderPage();
    expect(screen.getByRole("columnheader", { name: /Annexe/ })).toBeTruthy();
    expect(screen.getByText("Famille")).toBeTruthy();
    const held = screen.getByRole("checkbox", { name: /« Acte de naissance » pour « Ville » \(déjà proposée par « État civil »\)$/ });
    expect((held as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox", { name: "« Acte de naissance » pour « État civil »" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Brouillon")).toBeTruthy();
  });

  it("écrit une case au clic", () => {
    renderPage();
    fireEvent.click(screen.getByRole("checkbox", { name: "« Inscription scolaire » pour « Annexe »" }));
    expect(h.writes).toEqual([[{ organizationId: "annexe", procedureId: "p2", enabled: true }]]);
  });

  it("« Tous » sur une ligne passe par une confirmation, sans service interne", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Activer « Inscription scolaire » partout" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/2 organismes/)).toBeTruthy();
    expect(h.writes).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Activer partout" }));
    expect(h.writes).toEqual([
      [
        { organizationId: "ville", procedureId: "p2", enabled: true },
        { organizationId: "annexe", procedureId: "p2", enabled: true },
      ],
    ]);
  });

  it("« Aucun » sur une colonne décoche ce que l'organisme propose", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Tout désactiver pour « État civil »" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Tout désactiver" }));
    expect(h.writes).toEqual([[{ organizationId: "ec", procedureId: "p1", enabled: false }]]);
  });

  it("borne les lots d'une colonne aux démarches affichées par la recherche", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Rechercher une démarche"), { target: { value: "scolaire" } });
    expect(screen.queryByText("Acte de naissance")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tout activer pour « Ville »" }));
    expect(within(screen.getByRole("alertdialog")).getByText(/parmi les 1 démarche affichée/)).toBeTruthy();
  });
});
