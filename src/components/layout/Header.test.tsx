// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

// L'icône « Paramètres » est un lien de l'application : il lui faut un routeur.
function renderHeader(path = "/") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
  );
}

describe("Header", () => {
  it("nomme le produit à côté du logo de l'entreprise", () => {
    renderHeader();
    expect(screen.getByText("Socle")).toBeTruthy();
    expect(screen.getByAltText("Edilumen")).toBeTruthy();
  });

  it("ouvre sur le lanceur d'applications de la gamme", () => {
    // Le nom du produit ne sert à rien si l'on ne peut pas en changer : les
    // deux vont ensemble dans le coin gauche.
    renderHeader();
    expect(screen.getByLabelText("Changer d'application")).toBeTruthy();
  });

  it("porte l'identité de l'organisation principale", () => {
    h.orgs.mockReturnValue({ data: [org("accm", "ACCM", null, "https://exemple.test/accm.png")] });
    renderHeader();
    expect(screen.getByText("ACCM")).toBeTruthy();
    expect(screen.getByAltText("ACCM").getAttribute("src")).toBe("https://exemple.test/accm.png");
  });

  it("ne montre que le nom quand la collectivité n'a pas de logo", () => {
    renderHeader();
    expect(screen.getByText("ACCM")).toBeTruthy();
    expect(screen.queryByAltText("ACCM")).toBeNull();
  });

  it("nomme la sous-organisation quand la racine est hors périmètre RLS", () => {
    h.orgs.mockReturnValue({ data: [org("svc", "Services techniques", "racine-invisible")] });
    renderHeader();
    expect(screen.getByText("Services techniques")).toBeTruthy();
  });

  it("annonce les autres organisations plutôt que de les taire", () => {
    h.orgs.mockReturnValue({ data: [org("accm", "ACCM"), org("t2", "Test 2")] });
    renderHeader();
    expect(screen.getByText("ACCM")).toBeTruthy();
    expect(screen.getByText("+1").getAttribute("title")).toBe("ACCM · Test 2");
  });

  it("ne rend aucune identité tant que les organisations ne sont pas chargées", () => {
    h.orgs.mockReturnValue({ data: undefined });
    renderHeader();
    expect(screen.getByText("Socle")).toBeTruthy();
    expect(screen.queryByText("ACCM")).toBeNull();
  });

  it("mène aux paramètres de l'application, comme dans Clara et Iris", () => {
    // Utilisateurs et rôles ont quitté le rail : c'est l'administration de
    // l'application, pas un contenu qu'on paramètre.
    renderHeader();
    const settings = screen.getByRole("link", { name: "Paramètres" });
    expect(settings.getAttribute("href")).toBe("/parametres/utilisateurs");
    expect(settings.getAttribute("aria-current")).toBeNull();
  });

  it("marque les paramètres actifs quand on y est", () => {
    renderHeader("/parametres/utilisateurs");
    expect(screen.getByRole("link", { name: "Paramètres" }).getAttribute("aria-current")).toBe("page");
  });
});
