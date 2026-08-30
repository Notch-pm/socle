// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ProceduresListPanel } from "./ProceduresListPanel";

const h = vi.hoisted(() => {
  const base = {
    organization_id: "org-1",
    category_id: null,
    type: "externe",
    keywords: null,
    short_description: null,
    input_duration_minutes: null,
    order_index: 1,
    is_active_global: null,
    agent_description: null,
    user_description: null,
    translations: null,
    requester_config: null,
    form_schema: null,
    knowledge_base: null,
    communication_config: null,
    created_at: null,
    updated_at: null,
  };
  return {
    procedures: [
      { ...base, id: "p-draft", name: "Démarche en cours", status: "brouillon" },
      { ...base, id: "p-prod", name: "Démarche livrée", status: "production", order_index: 2 },
    ],
    mutateUpdate: vi.fn(),
  };
});

vi.mock("@/features/procedures/useProcedures", () => ({
  useProceduresForOrg: () => ({ data: h.procedures, isLoading: false, isError: false }),
  useDeleteProcedure: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUpdateProcedure: () => ({ mutate: h.mutateUpdate, isPending: false, error: null }),
}));
vi.mock("@/features/categories/useCategories", () => ({
  useCategoriesQuery: () => ({ data: [], isLoading: false }),
}));

// Radix Switch : polyfills absents de jsdom.
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

function renderPanel() {
  render(
    <ProceduresListPanel
      organizationId="org-1"
      canDelete={false}
      onNew={vi.fn()}
      onEdit={vi.fn()}
    />,
  );
}

const row = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

beforeEach(() => h.mutateUpdate.mockClear());

describe("ProceduresListPanel — état brouillon / production", () => {
  it("le tag « Brouillon » ne marque que les démarches non passées en production", () => {
    renderPanel();
    expect(within(row("Démarche en cours")).getByText("Brouillon")).toBeTruthy();
    expect(within(row("Démarche livrée")).queryByText("Brouillon")).toBeNull();
  });

  it("le commutateur reflète le statut de chaque ligne", () => {
    renderPanel();
    expect(
      within(row("Démarche en cours")).getByRole("switch").getAttribute("aria-checked"),
    ).toBe("false");
    expect(within(row("Démarche livrée")).getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("activer le commutateur passe la démarche en production", () => {
    renderPanel();
    fireEvent.click(within(row("Démarche en cours")).getByRole("switch"));
    expect(h.mutateUpdate).toHaveBeenCalledWith({ id: "p-draft", status: "production" });
  });

  it("désactiver le commutateur la repasse en brouillon (geste réversible)", () => {
    renderPanel();
    fireEvent.click(within(row("Démarche livrée")).getByRole("switch"));
    expect(h.mutateUpdate).toHaveBeenCalledWith({ id: "p-prod", status: "brouillon" });
  });
});
