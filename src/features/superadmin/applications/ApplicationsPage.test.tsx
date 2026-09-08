// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ApplicationsPage } from "./ApplicationsPage";

const h = vi.hoisted(() => ({
  create: vi.fn(),
  lists: [] as unknown[],
}));

vi.mock("./useApplications", () => ({
  useApplications: () => ({
    data: [
      { id: "clara", name: "Clara — gestion de courrier", scope: "abonnement" },
      { id: "socle", name: "Socle — traduction automatique", scope: "plateforme" },
    ],
    isLoading: false,
  }),
  useCreateApplication: () => ({ mutate: h.create, isPending: false, error: null }),
}));

// La liste des clés a ses propres tests ; ici on vérifie qu'elle est montée
// une fois par application, plus une fois pour les clés à rattacher.
vi.mock("@/features/superadmin/organizations/ApiKeysList", () => ({
  ApiKeysList: (props: { owner: string | null; application?: string | null }) => {
    h.lists.push(props);
    return <div data-testid="keys">{String(props.application)}</div>;
  },
}));

beforeEach(() => {
  h.create.mockReset();
  h.lists = [];
});

describe("ApplicationsPage", () => {
  it("monte une liste de clés par application, plus celle des clés à rattacher", () => {
    render(<ApplicationsPage />);
    const lists = screen.getAllByTestId("keys").map((el) => el.textContent);
    expect(lists).toEqual(["clara", "socle", "null"]);
    expect(h.lists.every((p) => (p as { owner: unknown }).owner === null)).toBe(true);
  });

  it("nomme le périmètre de chaque application", () => {
    render(<ApplicationsPage />);
    expect(screen.getByText("Collectivités abonnées")).toBeTruthy();
    expect(screen.getByText("Toute la plateforme")).toBeTruthy();
  });

  it("ajoute une application au registre, identifiant normalisé", () => {
    render(<ApplicationsPage />);
    fireEvent.change(screen.getByLabelText("Identifiant"), { target: { value: " Ariane " } });
    fireEvent.change(screen.getByLabelText(/^Nom$/), { target: { value: "Ariane — rendez-vous" } });
    fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0]).toEqual({ id: "ariane", name: "Ariane — rendez-vous" });
  });

  it("refuse un identifiant que la contrainte SQL refuserait", () => {
    render(<ApplicationsPage />);
    fireEvent.change(screen.getByLabelText("Identifiant"), { target: { value: "1ariane" } });
    fireEvent.change(screen.getByLabelText(/^Nom$/), { target: { value: "Ariane" } });
    expect(screen.getByRole("button", { name: /Ajouter/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Identifiant invalide/)).toBeTruthy();
    expect(h.create).not.toHaveBeenCalled();
  });
});
