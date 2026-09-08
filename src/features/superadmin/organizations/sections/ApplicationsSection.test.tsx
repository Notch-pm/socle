// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ApplicationsSection } from "./ApplicationsSection";

const h = vi.hoisted(() => ({
  subscriptions: [] as { application_id: string }[],
  set: vi.fn(),
}));

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ session: null, profile: { id: "user-1", global_role: "super_admin" }, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/features/superadmin/applications/useApplications", () => ({
  useApplications: () => ({
    data: [
      { id: "clara", name: "Clara — gestion de courrier", scope: "abonnement" },
      { id: "nora", name: "Nora — portail usagers", scope: "abonnement" },
      { id: "socle", name: "Socle — traduction automatique", scope: "plateforme" },
    ],
    isLoading: false,
  }),
  useOrganizationApplications: () => ({ data: h.subscriptions, isLoading: false }),
  useSetOrganizationApplication: () => ({ mutate: h.set, isPending: false, error: null }),
}));

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

beforeEach(() => {
  h.subscriptions = [];
  h.set.mockReset();
});

describe("ApplicationsSection", () => {
  it("ne propose que les applications qui se souscrivent", () => {
    // Le Socle (scope plateforme) sert tout le monde : rien à cocher.
    render(<ApplicationsSection organizationId="org-1" />);
    expect(screen.getByLabelText("Nora — portail usagers")).toBeTruthy();
    expect(screen.getByLabelText("Clara — gestion de courrier")).toBeTruthy();
    expect(screen.queryByLabelText(/Socle/)).toBeNull();
  });

  it("reflète l'abonnement et le change d'un geste", () => {
    h.subscriptions = [{ application_id: "nora" }];
    render(<ApplicationsSection organizationId="org-1" />);
    expect(screen.getByLabelText("Nora — portail usagers").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByLabelText("Clara — gestion de courrier").getAttribute("aria-checked")).toBe("false");

    fireEvent.click(screen.getByLabelText("Clara — gestion de courrier"));
    expect(h.set).toHaveBeenCalledWith({
      organizationId: "org-1",
      applicationId: "clara",
      enabled: true,
      createdBy: "user-1",
    });

    fireEvent.click(screen.getByLabelText("Nora — portail usagers"));
    expect(h.set).toHaveBeenLastCalledWith(expect.objectContaining({ applicationId: "nora", enabled: false }));
  });

  it("dit ce que cocher change pour le portail", () => {
    render(<ApplicationsSection organizationId="org-1" />);
    expect(screen.getByText(/qu'une fois Nora cochée/)).toBeTruthy();
  });
});
