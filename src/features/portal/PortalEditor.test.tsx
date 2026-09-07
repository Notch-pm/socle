// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PortalEditor } from "./PortalEditor";
import { defaultPortalPage, type ContactSource } from "@/features/portal/portalPage";

// Primitives Radix (Switch, utilisé par l'inspecteur) : polyfills absents de jsdom.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const CONTACT: ContactSource = {
  name: "Mairie de Sainte-Colombe",
  address: "1 place de la Mairie",
  phone: "04 78 00 00 00",
  email: "accueil@sainte-colombe.fr",
};

function renderEditor(overrides: Partial<ComponentProps<typeof PortalEditor>> = {}) {
  const onChange = vi.fn();
  const onPublish = vi.fn();
  const onDiscard = vi.fn();
  const onClose = vi.fn();
  render(
    <PortalEditor
      organizationName="Ville de Sainte-Colombe"
      organizationId="org-1"
      languages={["fr"]}
      page={defaultPortalPage()}
      onChange={onChange}
      catalogue={[]}
      contact={CONTACT}
      statusLine="Brouillon enregistré à 14:32"
      onPublish={onPublish}
      onDiscard={onDiscard}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onChange, onPublish, onDiscard, onClose };
}

describe("PortalEditor — en-tête", () => {
  it("affiche le nom de l'organisation et la ligne de statut", () => {
    renderEditor();
    expect(screen.getByText(/Site de démarches — Ville de Sainte-Colombe/)).toBeTruthy();
    expect(screen.getByText("Brouillon enregistré à 14:32")).toBeTruthy();
  });

  it("les onglets Contenus et Thème sont indisponibles", () => {
    renderEditor();
    const nav = screen.getByRole("tablist", { name: "Vue de l'éditeur" });
    const contenus = within(nav).getByRole("tab", { name: "Contenus" });
    const theme = within(nav).getByRole("tab", { name: "Thème" });
    expect(contenus.getAttribute("aria-disabled")).toBe("true");
    expect(theme.getAttribute("aria-disabled")).toBe("true");
    expect(contenus.getAttribute("title")).toBe("Bientôt disponible");

    const composition = within(nav).getByRole("tab", { name: "Composition" });
    expect(composition.getAttribute("aria-disabled")).toBeNull();
  });

  it("appelle onPublish au clic sur Publier", () => {
    const { onPublish } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("appelle onDiscard au clic sur Annuler", () => {
    const { onDiscard } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Annuler/ }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("colore la ligne de statut en cas d'erreur", () => {
    renderEditor({ statusLine: "Échec de l'enregistrement", statusIsError: true });
    expect(screen.getByText("Échec de l'enregistrement").className).toMatch(/destructive/);
  });
});

describe("PortalEditor — canevas et sélection", () => {
  it("la sélection d'un bloc ouvre l'inspecteur", () => {
    renderEditor();
    expect(screen.queryByText("Titre affiché")).toBeNull();

    // La page par défaut ouvre sur une section « Recherche de démarche ».
    fireEvent.click(screen.getByText("Vos démarches en ligne, 24 h/24"));

    expect(screen.getByText("Titre affiché")).toBeTruthy();
    expect(screen.getByText(/Position 1 \/ 4 sur la page/)).toBeTruthy();
  });
});

describe("PortalEditor — aperçu", () => {
  it("masque la palette pendant la prévisualisation", () => {
    renderEditor();
    expect(screen.getByText("Blocs")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Prévisualiser" }));

    expect(screen.queryByText("Blocs")).toBeNull();
    expect(screen.getByRole("button", { name: "Quitter l'aperçu" })).toBeTruthy();
  });
});
