// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ApiKeyFormDialog, CONSUMER_HINT, PLATFORM_ACK_LABEL } from "./ApiKeyFormDialog";

// Mutation court-circuitée : on vérifie ce que le dialogue demande (propriétaire,
// nom, scopes, application), pas l'insertion Supabase.
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

// Le registre des applications, tel que la page « Applications » le tient.
vi.mock("@/features/superadmin/applications/useApplications", () => ({
  useApplications: () => ({
    data: [
      { id: "clara", name: "Clara — gestion de courrier", scope: "abonnement" },
      { id: "iris", name: "Iris — gestion des demandes", scope: "abonnement" },
      { id: "nora", name: "Nora — portail usagers", scope: "abonnement" },
      { id: "socle", name: "Socle — traduction automatique", scope: "plateforme" },
    ],
    isLoading: false,
  }),
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

function renderDialog(owner: string | null, application?: string) {
  render(
    <ApiKeyFormDialog
      open
      onOpenChange={() => {}}
      owner={owner}
      createdBy="user-1"
      application={application}
    />,
  );
}

function fillName(value: string) {
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value } });
}

function submitButton() {
  return screen.getByRole("button", { name: /^Créer la clé/ });
}

const applicationSelect = () => screen.getByLabelText("Application") as HTMLSelectElement;
const chooseApplication = (id: string) =>
  fireEvent.change(applicationSelect(), { target: { value: id } });

beforeEach(() => {
  h.mutate.mockReset();
  h.reset.mockReset();
  h.useCreateApiKey.mockReset();
});

describe("ApiKeyFormDialog — clé rattachée à une organisation", () => {
  it("crée la clé pour l'organisation donnée, sans application ni assentiment", () => {
    renderDialog("org-1");
    expect(h.useCreateApiKey).toHaveBeenCalledWith("org-1", "user-1");
    expect(screen.getByText("Nouvelle clé API")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText(PLATFORM_ACK_LABEL)).toBeNull();
    // Un partenaire n'est pas une application du registre.
    expect(screen.queryByLabelText("Application")).toBeNull();

    fillName("  Partenaire X — production ");
    expect(submitButton().hasAttribute("disabled")).toBe(false);
    fireEvent.click(submitButton());

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0][0]).toEqual({
      name: "Partenaire X — production",
      expiresAt: null,
      scopes: ["read"],
      consumer: null,
    });
  });
});

describe("ApiKeyFormDialog — clé plateforme (owner = null)", () => {
  it("exige une application ET l'assentiment avant de créer", () => {
    renderDialog(null);
    expect(h.useCreateApiKey).toHaveBeenCalledWith(null, "user-1");
    expect(screen.getByText("Nouvelle clé plateforme")).toBeTruthy();
    // L'avertissement parle d'abonnement, plus de « toutes les organisations ».
    expect(screen.getByRole("alert").textContent).toMatch(/collectivités abonnées/i);

    fillName("Clara — production");
    fireEvent.click(screen.getByLabelText(PLATFORM_ACK_LABEL));
    // Nom + scope + assentiment, mais pas d'application → bloqué : sans
    // application, la clé n'a pas de périmètre.
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    fireEvent.click(submitButton());
    expect(h.mutate).not.toHaveBeenCalled();

    chooseApplication("clara");
    expect(submitButton().hasAttribute("disabled")).toBe(false);
    fireEvent.click(submitButton());

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0][0]).toEqual({
      name: "Clara — production",
      expiresAt: null,
      scopes: ["read"],
      consumer: "clara",
    });
  });

  it("bloque tant que l'assentiment manque, même application choisie", () => {
    renderDialog(null);
    fillName("Clara — production");
    chooseApplication("clara");
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText(PLATFORM_ACK_LABEL));
    expect(submitButton().hasAttribute("disabled")).toBe(false);
  });

  it("verrouille l'application quand la page l'a pré-liée", () => {
    // Depuis la page « Applications », la clé est créée SOUS une application :
    // pas de choix à faire, pas d'erreur possible.
    renderDialog(null, "nora");
    expect(applicationSelect().value).toBe("nora");
    expect(applicationSelect().hasAttribute("disabled")).toBe(true);

    fillName("Nora — production");
    fireEvent.click(screen.getByLabelText(PLATFORM_ACK_LABEL));
    fireEvent.click(submitButton());
    expect(h.mutate.mock.calls[0][0]).toMatchObject({ consumer: "nora" });
  });

  it("transmet les accès choisis (ex. usagers en plus du référentiel)", () => {
    renderDialog(null, "clara");
    fillName("Clara — production");
    fireEvent.click(screen.getByLabelText("Usagers (lecture + écriture)"));
    fireEvent.click(screen.getByLabelText(PLATFORM_ACK_LABEL));
    fireEvent.click(submitButton());

    expect(h.mutate.mock.calls[0][0].scopes).toEqual(["read", "contacts"]);
  });
});

/**
 * Le scope facturé exige une application imputable. Sans elle, `ai-api`
 * refuserait la clé à l'usage (403) : autant le dire à la création plutôt
 * qu'au premier appel.
 */
describe("ApiKeyFormDialog — scope IA et imputation sur une clé liée", () => {
  const enableAi = () => fireEvent.click(screen.getByLabelText("Assistant IA (jetons facturés)"));

  it("ne demande l'application que si le scope IA est coché", () => {
    renderDialog("org-1");
    fillName("Iris");
    expect(screen.queryByLabelText("Application")).toBeNull();
    enableAi();
    expect(screen.getByLabelText("Application")).toBeTruthy();
    expect(screen.getByText(new RegExp(CONSUMER_HINT.slice(0, 30)))).toBeTruthy();
  });

  it("ferme le bouton tant que l'application n'est pas choisie", () => {
    renderDialog("org-1");
    fillName("Iris");
    enableAi();
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    chooseApplication("iris");
    expect(submitButton().hasAttribute("disabled")).toBe(false);
  });

  it("transmet l'imputation avec le scope", () => {
    renderDialog("org-1");
    fillName("Iris");
    enableAi();
    chooseApplication("iris");
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
    chooseApplication("iris");
    enableAi();
    fireEvent.click(submitButton());

    expect(h.mutate.mock.calls[0][0].consumer).toBeNull();
  });
});
