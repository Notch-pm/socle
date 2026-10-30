// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { UsersManagementPage } from "./UsersManagementPage";
import type { AccessApplication, OrgAgent } from "./agentAccess";

const h = vi.hoisted(() => ({
  agents: [] as OrgAgent[],
  applications: [] as AccessApplication[],
}));

vi.mock("@/features/users/useOrgUsers", () => {
  const mutation = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null });
  return {
    useOrgUsers: () => ({ data: h.agents, isLoading: false, isError: false }),
    useAccessApplications: () => ({ data: h.applications, isLoading: false, isError: false }),
    useRemoveOrgUser: mutation,
    useResendInvitation: mutation,
    useSetUserStatus: mutation,
    useCreateOrgUser: mutation,
    useUpdateOrgUser: mutation,
  };
});

const CLARA: AccessApplication = {
  id: "clara",
  name: "Clara",
  roles: [
    { code: "administrateur", label: "Administrateur", isAdmin: true },
    { code: "elu", label: "Élu", isAdmin: false },
  ],
};

function agent(overrides: Partial<OrgAgent>): OrgAgent {
  return {
    userId: "u",
    email: "x@ville.fr",
    firstName: null,
    lastName: null,
    status: "active",
    socle: null,
    access: {},
    ...overrides,
  };
}

beforeEach(() => {
  h.applications = [CLARA];
  h.agents = [
    agent({ userId: "u-1", email: "alice@ville.fr", firstName: "Alice", socle: { membershipId: "m-1", role: "admin" } }),
    agent({
      userId: "u-2",
      email: "bob@ville.fr",
      firstName: "Bob",
      status: "suspended",
      access: { clara: { id: "x-1", roleCode: "elu", isActive: true } },
    }),
    agent({ userId: "u-3", email: "ancien@ville.fr", access: { clara: { id: "x-2", roleCode: "elu", isActive: false } } }),
  ];
});

describe("UsersManagementPage", () => {
  it("affiche une colonne par application abonnée, le Socle en tête", () => {
    render(<UsersManagementPage organizationId="org-1" />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Nom", "Email", "Socle", "Clara", "Actions"]);
  });

  it("montre le rôle de chaque application, et le statut suspendu", () => {
    render(<UsersManagementPage organizationId="org-1" />);
    const bob = screen.getByText("bob@ville.fr").closest("tr")!;
    expect(within(bob).getByText("Élu")).toBeTruthy();
    expect(within(bob).getByText("Suspendu")).toBeTruthy();
    expect(within(bob).getByTitle("Réactiver")).toBeTruthy();
    // Pas d'accès au Socle : pas d'invitation du Socle à renvoyer.
    expect(within(bob).queryByTitle("Renvoyer l'invitation")).toBeNull();

    const alice = screen.getByText("alice@ville.fr").closest("tr")!;
    expect(within(alice).getByText("Administrateur")).toBeTruthy();
    expect(within(alice).getByTitle("Renvoyer l'invitation")).toBeTruthy();
  });

  it("masque par défaut les utilisateurs dont tous les accès sont retirés", () => {
    render(<UsersManagementPage organizationId="org-1" />);
    expect(screen.queryByText("ancien@ville.fr")).toBeNull();
    fireEvent.click(screen.getByLabelText("Afficher les utilisateurs sans accès (1)"));
    expect(screen.getByText("ancien@ville.fr")).toBeTruthy();
  });
});
