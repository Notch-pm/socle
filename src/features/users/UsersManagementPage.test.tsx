// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { UsersManagementPage } from "./UsersManagementPage";
import type { AccessApplication, ManagedOrganization, OrgAgent } from "./agentAccess";

const h = vi.hoisted(() => ({
  agents: [] as OrgAgent[],
  applications: [] as AccessApplication[],
  organizations: [] as ManagedOrganization[],
  createUser: vi.fn(),
}));

vi.mock("@/features/users/useOrgUsers", () => {
  const mutation = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null });
  return {
    useOrgUsers: () => ({ data: h.agents, isLoading: false, isError: false }),
    useAccessApplications: () => ({ data: h.applications, isLoading: false, isError: false }),
    useRemoveOrgUser: mutation,
    useResendInvitation: mutation,
    useSetUserStatus: mutation,
    useCreateOrgUser: () => ({ ...mutation(), mutate: h.createUser, data: undefined }),
    useManagedOrganizations: () => ({
      organizations: h.organizations,
      rootId: h.organizations[0]?.parentId === null ? h.organizations[0].id : null,
      isLoading: false,
      isError: false,
    }),
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
  h.createUser.mockReset();
  h.applications = [CLARA];
  h.organizations = [
    { id: "org-1", name: "Ville", parentId: null, depth: 0 },
    { id: "svc-1", name: "État civil", parentId: "org-1", depth: 1 },
  ];
  h.agents = [
    agent({ userId: "u-1", email: "alice@ville.fr", firstName: "Alice", socle: { role: "admin", memberships: [{ id: "m-1", organizationId: "org-1" }] } }),
    agent({
      userId: "u-2",
      email: "bob@ville.fr",
      firstName: "Bob",
      status: "suspended",
      access: {
        clara: [
          { id: "x-1", organizationId: "org-1", roleCode: "elu", isActive: true },
          { id: "x-9", organizationId: "svc-1", roleCode: "elu", isActive: true },
        ],
      },
    }),
    agent({ userId: "u-3", email: "ancien@ville.fr", access: { clara: [{ id: "x-2", organizationId: "org-1", roleCode: "elu", isActive: false }] } }),
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
    expect(within(bob).getByText("2 organismes")).toBeTruthy();
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

  it("création : un tableau d'organismes par application ouverte, envoyé à invite-user", () => {
    render(<UsersManagementPage organizationId="org-1" />);
    fireEvent.click(screen.getByText("Nouvel utilisateur"));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "carole@ville.fr" } });
    fireEvent.change(screen.getByLabelText("Prénom"), { target: { value: "Carole" } });
    fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Durand" } });
    fireEvent.change(screen.getByLabelText("Clara"), { target: { value: "elu" } });
    // L'organisme de la page est coché d'office ; on ajoute le service pour Clara.
    expect((screen.getByLabelText("Clara — Ville") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Clara — État civil"));
    fireEvent.click(screen.getByText("Créer"));
    return vi.waitFor(() =>
      expect(h.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "carole@ville.fr",
          role: "consultant",
          organization_id: "org-1",
          socle_organization_ids: ["org-1"],
          applications: [{ application_id: "clara", role_code: "elu", organization_ids: ["org-1", "svc-1"] }],
        }),
        expect.anything(),
      ),
    );
  });

  it("création : l'administration d'une application coche et verrouille la collectivité", () => {
    render(<UsersManagementPage organizationId="org-1" />);
    fireEvent.click(screen.getByText("Nouvel utilisateur"));
    fireEvent.change(screen.getByLabelText("Clara"), { target: { value: "elu" } });
    fireEvent.click(screen.getByLabelText("Clara — Ville"));
    expect((screen.getByLabelText("Clara — Ville") as HTMLInputElement).checked).toBe(false);
    fireEvent.change(screen.getByLabelText("Clara"), { target: { value: "administrateur" } });
    const root = screen.getByLabelText("Clara — Ville") as HTMLInputElement;
    expect(root.checked).toBe(true);
    expect(root.disabled).toBe(true);
  });
});
