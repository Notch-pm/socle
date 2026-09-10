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
    // Tout ce qui s'annonce dans le rail (les tuiles portent un `title`) est
    // un lien : aucune pastille, aucun ornement légendé.
    const annonces = Array.from(rail.querySelectorAll("[title]"));
    expect(annonces.length).toBeGreaterThan(0);
    expect(annonces.every((el) => el.tagName === "A")).toBe(true);
    expect(screen.queryByText("Socle")).toBeNull();
  });
});
