// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "./Header";

// L'en-tête porte trois identités : le produit, la collectivité, l'utilisateur.
// Les deux premières sont ce que ce test épingle — la troisième existait déjà.
const h = vi.hoisted(() => ({ orgs: vi.fn() }));

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({
    session: { user: { email: "agent@accm.fr" } },
    profile: { global_role: "consultant" },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/features/superadmin/organizations/useOrganizationsAdmin", async () => {
  // `visibleRootOrganizations` est pure et déjà testée : on la garde vraie et
  // on ne remplace que la lecture serveur.
  const real = await vi.importActual<
    typeof import("@/features/superadmin/organizations/orgTree")
  >("@/features/superadmin/organizations/orgTree");
  return { useAllOrganizations: () => h.orgs(), visibleRootOrganizations: real.visibleRootOrganizations };
});

const org = (id: string, name: string, parent_id: string | null = null, logo_url: string | null = null) =>
  ({ id, name, parent_id, logo_url });

beforeEach(() => {
  h.orgs.mockReset();
  h.orgs.mockReturnValue({ data: [org("accm", "ACCM")] });
});

describe("Header", () => {
  it("nomme le produit à côté du logo de l'entreprise", () => {
    render(<Header />);
    expect(screen.getByText("Socle")).toBeTruthy();
    expect(screen.getByAltText("Edilumen")).toBeTruthy();
  });

  it("porte l'identité de l'organisation principale", () => {
    h.orgs.mockReturnValue({ data: [org("accm", "ACCM", null, "https://exemple.test/accm.png")] });
    render(<Header />);
    expect(screen.getByText("ACCM")).toBeTruthy();
    expect(screen.getByAltText("ACCM").getAttribute("src")).toBe("https://exemple.test/accm.png");
  });

  it("ne montre que le nom quand la collectivité n'a pas de logo", () => {
    render(<Header />);
    expect(screen.getByText("ACCM")).toBeTruthy();
    expect(screen.queryByAltText("ACCM")).toBeNull();
  });

  it("nomme la sous-organisation quand la racine est hors périmètre RLS", () => {
    h.orgs.mockReturnValue({ data: [org("svc", "Services techniques", "racine-invisible")] });
    render(<Header />);
    expect(screen.getByText("Services techniques")).toBeTruthy();
  });

  it("annonce les autres organisations plutôt que de les taire", () => {
    h.orgs.mockReturnValue({ data: [org("accm", "ACCM"), org("t2", "Test 2")] });
    render(<Header />);
    expect(screen.getByText("ACCM")).toBeTruthy();
    expect(screen.getByText("+1").getAttribute("title")).toBe("ACCM · Test 2");
  });

  it("ne rend aucune identité tant que les organisations ne sont pas chargées", () => {
    h.orgs.mockReturnValue({ data: undefined });
    render(<Header />);
    expect(screen.getByText("Socle")).toBeTruthy();
    expect(screen.queryByText("ACCM")).toBeNull();
  });
});
