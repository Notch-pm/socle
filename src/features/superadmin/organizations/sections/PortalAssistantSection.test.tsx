// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PortalAssistantSection } from "./PortalAssistantSection";

const h = vi.hoisted(() => ({
  settings: null as { enabled: boolean; deposit_enabled: boolean } | null,
  set: vi.fn(),
}));

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ session: null, profile: { id: "user-1", global_role: "super_admin" }, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/features/superadmin/organizations/usePortalAssistant", () => ({
  PORTAL_ASSISTANT_CLOSED: { enabled: false, deposit_enabled: false },
  usePortalAssistantSettings: () => ({ data: h.settings, isLoading: false }),
  useSetPortalAssistant: () => ({ mutate: h.set, isPending: false, error: null }),
}));

// La borne a son propre test (`PortalAssistantBudget.test.tsx`) ; ici on vérifie
// seulement qu'elle est montrée À CÔTÉ de l'interrupteur, et qu'elle sait s'il est ouvert.
vi.mock("@/features/superadmin/organizations/sections/PortalAssistantBudget", () => ({
  PortalAssistantBudget: (props: { assistantEnabled: boolean }) => (
    <div data-testid="budget" data-enabled={String(props.assistantEnabled)} />
  ),
}));

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

const OPEN = "Proposer l'assistant sur le site";
const DEPOSIT = "Déposer une demande par la conversation";

function renderSection() {
  return render(
    <MemoryRouter>
      <PortalAssistantSection organizationId="org-1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.settings = null;
  h.set.mockReset();
});

describe("PortalAssistantSection", () => {
  it("aucune ligne = assistant fermé, et le dépôt ne se règle pas sous un assistant fermé", () => {
    renderSection();
    expect(screen.getByLabelText(OPEN).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByLabelText(DEPOSIT).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByLabelText(DEPOSIT).hasAttribute("disabled")).toBe(true);
  });

  it("ouvre l'assistant d'un geste, en envoyant les DEUX drapeaux", () => {
    renderSection();
    fireEvent.click(screen.getByLabelText(OPEN));
    expect(h.set).toHaveBeenCalledWith({
      organizationId: "org-1",
      enabled: true,
      deposit_enabled: false,
      updatedBy: "user-1",
    });
  });

  it("⚠️ couper l'assistant CONSERVE le réglage du dépôt", () => {
    // Le réglage gouverne l'usage, pas la donnée : c'est l'API publique qui
    // cesse de servir `deposit_enabled`, la base le garde pour la réouverture.
    h.settings = { enabled: true, deposit_enabled: true };
    renderSection();
    fireEvent.click(screen.getByLabelText(OPEN));
    expect(h.set).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, deposit_enabled: true }),
    );
  });

  it("montre le dépôt conservé sous un assistant fermé, et dit qu'il est sans effet", () => {
    h.settings = { enabled: false, deposit_enabled: true };
    renderSection();
    expect(screen.getByLabelText(DEPOSIT).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/Sans effet tant que l'assistant n'est pas proposé/)).toBeTruthy();
  });

  it("⚠️ montre la borne de crédit à côté de l'interrupteur, et lui dit s'il est ouvert", () => {
    // On ne devrait pas pouvoir ouvrir l'assistant au public sans voir sa borne.
    h.settings = { enabled: true, deposit_enabled: false };
    renderSection();
    expect(screen.getByTestId("budget").getAttribute("data-enabled")).toBe("true");
  });

  it("dit d'où vient le corpus, et renvoie au plafond avant l'ouverture au public", () => {
    renderSection();
    expect(screen.getByText(/jamais sur la base de connaissances des agents/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Vérifier le plafond" }).getAttribute("href")).toBe(
      "/?section=ia",
    );
  });
});
