// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntegrationsPage } from "./IntegrationsPage";

// Les hooks sont court-circuités : ce qui est vérifié ici, c'est ce que l'écran
// MONTRE et ce qu'il n'offre pas — la lecture est gardée par la RPC et par
// `supabase/tests/integrations.test.sql`.
const h = vi.hoisted(() => ({ roots: vi.fn(), overview: vi.fn() }));

vi.mock("@/features/ai-usage/useAdminRootOrganizations", () => ({
  useAdminRootOrganizations: () => h.roots(),
}));

const ARPEGE = {
  id: "int-arpege",
  slug: "arpege",
  name: "Arpège",
  description: "Connexion entre Clara et Arpège.",
  logo_url: null,
  type_id: "application_gru",
  adapter: "arpege",
  is_available: true,
  created_at: "",
  updated_at: "",
  integration_types: { id: "application_gru", name: "Application GRU", position: 40 },
  integration_applications: [{ application_id: "clara", applications: { name: "Clara — gestion de courrier" } }],
};

vi.mock("./useIntegrations", () => ({
  useIntegrationTypes: () => ({
    data: [{ id: "application_gru", name: "Application GRU", position: 40, created_at: "" }],
    isLoading: false,
  }),
  useIntegrationsCatalogue: () => ({ data: [ARPEGE], isLoading: false, isError: false }),
  useOrganizationIntegrationOverview: (...args: unknown[]) => h.overview(...args),
}));

beforeEach(() => {
  h.roots.mockReset();
  h.overview.mockReset();
  h.roots.mockReturnValue({ data: [{ id: "org-1", name: "ACCM" }], isLoading: false, isError: false });
});

describe("IntegrationsPage", () => {
  it("nomme les intégrations actives de la collectivité", () => {
    h.overview.mockReturnValue({
      data: [{ integration_id: "int-arpege", is_active: true, last_test_ok: true, last_tested_at: "2026-10-02T10:00:00Z", present_keys: [] }],
      isLoading: false,
      isError: false,
    });
    render(<IntegrationsPage />);
    expect(screen.getByRole("status").textContent).toBe("Intégration active : Arpège.");
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Connexion entre Clara et Arpège.")).toBeTruthy();
    expect(h.overview).toHaveBeenCalledWith("org-1");
  });

  it("montre le catalogue même sans rien d'actif", () => {
    h.overview.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<IntegrationsPage />);
    expect(screen.getByRole("status").textContent).toBe("Aucune intégration n'est active pour votre collectivité.");
    expect(screen.getByText("Arpège")).toBeTruthy();
    expect(screen.getByText("Non configurée")).toBeTruthy();
  });

  it("n'offre aucune action : consultation seule", () => {
    h.overview.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<IntegrationsPage />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("renvoie un administrateur de sous-organisation vers l'éditeur", () => {
    h.roots.mockReturnValue({ data: [], isLoading: false, isError: false });
    h.overview.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<IntegrationsPage />);
    expect(screen.getByText(/réservée aux administrateurs d'une organisation principale/)).toBeTruthy();
  });
});
