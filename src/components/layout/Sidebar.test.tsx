// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { API_DOC_LINKS, apiDocLinkTitle } from "@/features/public-api-docs/apiDocLinks";

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

  it("ferme le rail sur les documentations d'API, en nouvel onglet", () => {
    // Elles sortent de l'application : un nouvel onglet (on ne quitte pas un
    // paramétrage en cours pour lire un contrat), annoncé dans l'intitulé, et
    // le pied du rail plutôt que le groupe de navigation.
    renderRail();
    const links = screen.getAllByRole("link");
    const docs = API_DOC_LINKS.map((link) =>
      screen.getByRole("link", { name: apiDocLinkTitle(link) }),
    );

    docs.forEach((doc, i) => {
      expect(doc.getAttribute("href")).toBe(API_DOC_LINKS[i].path);
      expect(doc.getAttribute("target")).toBe("_blank");
      expect(doc.getAttribute("rel")).toBe("noreferrer");
    });
    // Les derniers du rail, après toutes les entrées de navigation.
    expect(links.slice(-docs.length)).toEqual(docs);
  });
});
