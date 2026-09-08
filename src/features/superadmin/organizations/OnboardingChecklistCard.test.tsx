// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";
import type { RootOnboardingStatus } from "./onboardingChecklist";

const h = vi.hoisted(() => ({
  status: null as RootOnboardingStatus | null,
  loading: false,
}));

vi.mock("./useOrganizationsAdmin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useOrganizationsAdmin")>();
  return {
    ...actual,
    useRootOnboardingStatus: () => ({ data: h.status, isLoading: h.loading, isError: false }),
  };
});

const EMPTY: RootOnboardingStatus = {
  smtp_configured: false,
  admin_count: 0,
  category_count: 0,
  procedure_count: 0,
  procedure_production_count: 0,
  activation_count: 0,
  domain_count: 0,
  portal_published: false,
  ai_quota_decided: false,
  ai_quota_active: false,
  logo_present: false,
  contact_role_count: 8,
  application_count: null,
};

beforeEach(() => {
  h.status = EMPTY;
  h.loading = false;
});

describe("OnboardingChecklistCard", () => {
  it("compte les seules lignes requises et mène chacune à sa section", () => {
    const onOpen = vi.fn();
    render(<OnboardingChecklistCard organizationId="org-1" onOpen={onOpen} />);

    // 8 lignes requises, une seule faite (les rôles, posés à la création).
    expect(screen.getByLabelText("1 sur 8 étapes faites")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Au moins une catégorie/ }));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "section", section: "categories" });

    fireEvent.click(screen.getByRole("button", { name: /Page d'accueil du site publiée/ }));
    expect(onOpen).toHaveBeenLastCalledWith({ kind: "portal" });
  });

  it("n'offre aucun bouton pour ce qui n'a pas d'écran", () => {
    // Les rôles de contact se posent seuls : la ligne informe, elle ne mène nulle part.
    render(<OnboardingChecklistCard organizationId="org-1" onOpen={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Rôles de contact/ })).toBeNull();
    expect(screen.getByText(/Rôles de contact/)).toBeTruthy();
  });

  it("dit que tout est en place quand c'est le cas", () => {
    h.status = {
      ...EMPTY,
      smtp_configured: true,
      admin_count: 1,
      category_count: 2,
      procedure_count: 3,
      procedure_production_count: 1,
      activation_count: 1,
      domain_count: 1,
      ai_quota_decided: true,
      ai_quota_active: false,
    };
    render(<OnboardingChecklistCard organizationId="org-1" onOpen={vi.fn()} />);
    expect(screen.getByText(/Tout ce qu'une collectivité attend est en place/)).toBeTruthy();
    expect(screen.getByLabelText("8 sur 8 étapes faites")).toBeTruthy();
    // Le facultatif reste visible, non coché, sans retenir la progression.
    expect(screen.getAllByText("facultatif")).toHaveLength(2);
  });
});
