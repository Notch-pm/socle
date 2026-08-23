// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ApiKeyFormDialog, PLATFORM_ACK_LABEL } from "./ApiKeyFormDialog";

// Mutation court-circuitée : on vérifie ce que le dialogue demande (propriétaire,
// nom, scopes), pas l'insertion Supabase.
const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  useCreateApiKey: vi.fn(),
}));

vi.mock("@/features/superadmin/organizations/useApiKeys", () => ({
  useCreateApiKey: (...args: unknown[]) => {
    h.useCreateApiKey(...args);
    return { mutate: h.mutate, reset: h.reset, isPending: false, isError: false, error: null };
  },
}));

// Primitives Radix (Dialog, Switch) : polyfills absents de jsdom.
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

function renderDialog(owner: string | null) {
  render(<ApiKeyFormDialog open onOpenChange={() => {}} owner={owner} createdBy="user-1" />);
}

function fillName(value: string) {
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value } });
}

function submitButton() {
  return screen.getByRole("button", { name: /^Créer la clé/ });
}

beforeEach(() => {
  h.mutate.mockReset();
  h.reset.mockReset();
  h.useCreateApiKey.mockReset();
});

describe("ApiKeyFormDialog — clé rattachée à une organisation", () => {
  it("crée la clé pour l'organisation donnée sans assentiment supplémentaire", () => {
    renderDialog("org-1");
    expect(h.useCreateApiKey).toHaveBeenCalledWith("org-1", "user-1");
    expect(screen.getByText("Nouvelle clé API")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText(PLATFORM_ACK_LABEL)).toBeNull();

    fillName("  Clara — production ");
    expect(submitButton().hasAttribute("disabled")).toBe(false);
    fireEvent.click(submitButton());

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0][0]).toEqual({
      name: "Clara — production",
      expiresAt: null,
      scopes: ["read"],
    });
  });
});

describe("ApiKeyFormDialog — clé plateforme (owner = null)", () => {
  it("annonce le périmètre global et exige l'assentiment avant de créer", () => {
    renderDialog(null);
    expect(h.useCreateApiKey).toHaveBeenCalledWith(null, "user-1");
    expect(screen.getByText("Nouvelle clé plateforme")).toBeTruthy();
    // Avertissement explicite sur le périmètre.
    expect(screen.getByRole("alert").textContent).toMatch(/toutes les organisations/i);

    fillName("Clara — plateforme");
    // Nom + scope valides, mais la case d'assentiment n'est pas cochée → bloqué.
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    fireEvent.click(submitButton());
    expect(h.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(PLATFORM_ACK_LABEL));
    expect(submitButton().hasAttribute("disabled")).toBe(false);
    fireEvent.click(submitButton());

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0][0]).toEqual({
      name: "Clara — plateforme",
      expiresAt: null,
      scopes: ["read"],
    });
  });

  it("transmet les accès choisis (ex. usagers en plus du référentiel)", () => {
    renderDialog(null);
    fillName("Clara — plateforme");
    fireEvent.click(screen.getByLabelText("Usagers (lecture + écriture)"));
    fireEvent.click(screen.getByLabelText(PLATFORM_ACK_LABEL));
    fireEvent.click(submitButton());

    expect(h.mutate.mock.calls[0][0].scopes).toEqual(["read", "contacts"]);
  });
});
