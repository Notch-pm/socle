// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ApiKeyFormDialog, CONSUMER_HINT, PLATFORM_ACK_LABEL } from "./ApiKeyFormDialog";

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
      consumer: null,
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
      consumer: null,
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

/**
 * Le scope facturé exige une application imputable. Sans elle, `ai-api`
 * refuserait la clé à l'usage (403 « n'est rattachée à aucune application
 * consommatrice ») : autant le dire à la création plutôt qu'au premier appel.
 */
describe("ApiKeyFormDialog — scope IA et imputation", () => {
  const enableAi = () => fireEvent.click(screen.getByLabelText("Assistant IA (jetons facturés)"));
  const consumerInput = () => screen.getByLabelText("Application imputable") as HTMLInputElement;

  it("ne demande l'application que si le scope IA est coché", () => {
    renderDialog("org-1");
    fillName("Iris");
    expect(screen.queryByLabelText("Application imputable")).toBeNull();
    enableAi();
    expect(screen.getByLabelText("Application imputable")).toBeTruthy();
    expect(screen.getByText(new RegExp(CONSUMER_HINT.slice(0, 30)))).toBeTruthy();
  });

  it("ferme le bouton tant que l'application n'est pas nommée", () => {
    renderDialog("org-1");
    fillName("Iris");
    enableAi();
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    fireEvent.change(consumerInput(), { target: { value: "iris" } });
    expect(submitButton().hasAttribute("disabled")).toBe(false);
  });

  it("refuse un identifiant qui ne tiendrait pas la contrainte SQL", () => {
    renderDialog("org-1");
    fillName("Iris");
    enableAi();
    // « Iris » n'est PAS dans cette liste : la casse est normalisée avant
    // validation (voir le cas suivant). Seul ce que la contrainte SQL
    // refuserait vraiment est rejeté ici.
    for (const invalide of ["1iris", "i", "iris pro", "iris!", "-iris"]) {
      fireEvent.change(consumerInput(), { target: { value: invalide } });
      expect(submitButton().hasAttribute("disabled")).toBe(true);
    }
    fireEvent.change(consumerInput(), { target: { value: "iris-prod" } });
    expect(submitButton().hasAttribute("disabled")).toBe(false);
  });

  it("normalise en minuscules et transmet l'imputation", () => {
    renderDialog("org-1");
    fillName("Iris");
    enableAi();
    fireEvent.change(consumerInput(), { target: { value: "  IRIS  " } });
    fireEvent.click(submitButton());

    expect(h.mutate.mock.calls[0][0]).toMatchObject({
      scopes: ["read", "ai"],
      consumer: "iris",
    });
  });

  // Décocher le scope ne doit pas laisser traîner une imputation fantôme.
  it("n'envoie aucune imputation quand le scope IA est retiré", () => {
    renderDialog("org-1");
    fillName("Iris");
    enableAi();
    fireEvent.change(consumerInput(), { target: { value: "iris" } });
    enableAi();
    fireEvent.click(submitButton());

    expect(h.mutate.mock.calls[0][0].consumer).toBeNull();
  });
});
