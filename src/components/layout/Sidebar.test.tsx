// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RAIL, Sidebar } from "./Sidebar";
import { API_DOC_LINKS, apiDocLinkTitle } from "@/features/public-api-docs/apiDocLinks";

// Chemin depuis la racine du projet : sous jsdom, `import.meta.url` n'est pas
// une URL `file:`.
const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

function renderRail(path = "/") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

const referentiels = () => screen.getByRole("button", { name: "Référentiels" });

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
    // un lien ou une rubrique qui s'ouvre : aucune pastille, aucun ornement
    // légendé.
    const annonces = Array.from(rail.querySelectorAll("[title]"));
    expect(annonces.length).toBeGreaterThan(0);
    expect(
      annonces.every(
        (el) => el.tagName === "A" || (el.tagName === "BUTTON" && el.hasAttribute("aria-expanded")),
      ),
    ).toBe(true);
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

  it("ne porte plus les utilisateurs : ils sont dans les paramètres de l'en-tête", () => {
    renderRail();
    expect(screen.queryByRole("link", { name: /Utilisateurs/ })).toBeNull();
  });

  it("garde les rubriques fermées, leurs pages hors de vue", () => {
    renderRail();
    expect(referentiels().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Catégories" })).toBeNull();
  });

  it("ouvre une rubrique en bulle, sur ses pages", () => {
    renderRail();
    fireEvent.click(referentiels());
    expect(referentiels().getAttribute("aria-expanded")).toBe("true");
    expect(
      ["Catégories", "Types de pièce justificative", "Modèles de documents", "Quartiers"].map((name) =>
        screen.getByRole("link", { name }).getAttribute("href"),
      ),
    ).toEqual([
      "/referentiels/categories",
      "/referentiels/types-pieces",
      "/referentiels/modeles-documents",
      "/referentiels/quartiers",
    ]);
  });

  it("referme la bulle sur Échap et rend le focus à la rubrique", () => {
    renderRail();
    fireEvent.click(referentiels());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(referentiels().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(referentiels());
  });

  it("referme la bulle au clic dehors, et dès qu'on choisit une page", () => {
    renderRail();
    fireEvent.click(referentiels());
    fireEvent.mouseDown(document.body);
    expect(referentiels().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(referentiels());
    fireEvent.click(screen.getByRole("link", { name: "Quartiers" }));
    expect(referentiels().getAttribute("aria-expanded")).toBe("false");
  });

  it("marque la rubrique active quand on est sur l'une de ses pages", () => {
    renderRail("/referentiels/quartiers");
    expect(referentiels().hasAttribute("data-active")).toBe(true);
  });

  it("ne marque pas la rubrique ailleurs", () => {
    renderRail("/demarches");
    expect(referentiels().hasAttribute("data-active")).toBe(false);
  });

  it("ne pointe que vers des routes déclarées dans App.tsx", () => {
    // Un lien du rail vers une route disparue mènerait à une page blanche : les
    // URL ont changé le 2026-10-24 (navigation v2), sans redirection.
    const paths = RAIL.flatMap((entry) =>
      entry.kind === "link"
        ? [entry.to]
        : entry.kind === "group"
          ? entry.sections.flatMap((s) => s.items.map((item) => item.to))
          : [],
    );
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(appSource).toContain(`path="${path.slice(1)}"`);
    }
  });

  it("range les connaissances par destinataire", () => {
    renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Connaissances" }));
    expect(screen.getByText("Pour les agents")).toBeTruthy();
    expect(screen.getByText("Pour les usagers")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Attributions" }).getAttribute("href")).toBe(
      "/connaissances/attributions",
    );
  });

  it("n'ouvre qu'une rubrique à la fois", () => {
    renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Connaissances" }));
    fireEvent.mouseDown(referentiels());
    fireEvent.click(referentiels());
    expect(screen.getByRole("button", { name: "Connaissances" }).getAttribute("aria-expanded")).toBe("false");
    expect(referentiels().getAttribute("aria-expanded")).toBe("true");
  });

  it("range le catalogue et l'activation dans la rubrique Démarches", () => {
    // Le catalogue n'est pas marqué actif sur le tableau d'activation, qui vit
    // sous son chemin ; la rubrique l'est aussi dans l'éditeur d'une démarche.
    renderRail("/demarches/activation");
    const demarches = screen.getByRole("button", { name: "Démarches" });
    expect(demarches.hasAttribute("data-active")).toBe(true);
    fireEvent.click(demarches);
    expect(screen.getByRole("link", { name: "Catalogue des démarches" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Activation par organisme" }).getAttribute("aria-current")).toBe("page");
  });

  it("garde la rubrique Démarches active dans l'éditeur d'une démarche", () => {
    renderRail("/demarches/123");
    expect(screen.getByRole("button", { name: "Démarches" }).hasAttribute("data-active")).toBe(true);
  });

  it("ne marque pas l'éditeur du site actif sur la page Fréquentation", () => {
    // Elle vit sous son chemin : sans `end`, les deux entrées se diraient actives.
    renderRail("/site-de-demarches/frequentation");
    const site = screen.getByRole("button", { name: "Site de démarches" });
    expect(site.hasAttribute("data-active")).toBe(true);
    fireEvent.click(site);
    expect(screen.getByRole("link", { name: "Éditeur du site" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Fréquentation" }).getAttribute("aria-current")).toBe("page");
  });
});
