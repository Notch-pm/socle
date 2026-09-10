// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";

function renderRail() {
  render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  it("ouvre le rail sur le tableau de bord", () => {
    // Rien au-dessus de lui : le rail commence par le point de départ de
    // l'application.
    renderRail();
    const dashboard = screen.getByRole("link", { name: "Tableau de bord" });
    expect(dashboard.getAttribute("href")).toBe("/");
    expect(screen.getAllByRole("link")[0]).toBe(dashboard);
  });

  it("ne porte rien d'autre que des entrées de navigation", () => {
    // Le produit se nomme dans l'en-tête ; une pastille de plus ici ne dirait
    // rien qui ne soit déjà dit, et repousserait la navigation d'un cran.
    renderRail();
    const rail = screen.getByRole("navigation", { name: "Navigation principale" });
    expect(rail.children).toHaveLength(screen.getAllByRole("link").length);
    expect(screen.queryByText("Socle")).toBeNull();
  });
});
