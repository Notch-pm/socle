// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PortalEditor } from "./PortalEditor";
import { defaultPortalPage, type ContactSource } from "@/features/portal/portalPage";
import { defaultPortalTheme, type PortalTheme } from "@/features/portal/portalTheme";
import { defaultPortalContent } from "@/features/portal/portalContent";

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
  const onThemeChange = vi.fn();
  const onStatementChange = vi.fn();
  const onPublish = vi.fn();
  const onDiscard = vi.fn();
  const onClose = vi.fn();
  render(
    <PortalEditor
      organizationName="Ville de Sainte-Colombe"
      organizationLogoUrl={null}
      organizationLogoWhiteUrl={null}
      branding={null}
      organizationId="org-1"
      languages={["fr"]}
      page={defaultPortalPage()}
      onChange={onChange}
      theme={defaultPortalTheme()}
      onThemeChange={onThemeChange}
      statement={defaultPortalContent()}
      onStatementChange={onStatementChange}
      catalogue={[]}
      contact={CONTACT}
      statusLine="Brouillon enregistré à 14:32"
      onPublish={onPublish}
      onDiscard={onDiscard}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onChange, onThemeChange, onStatementChange, onPublish, onDiscard, onClose };
}

function openView(name: "Composition" | "Contenus" | "Thème") {
  const nav = screen.getByRole("tablist", { name: "Vue de l'éditeur" });
  fireEvent.click(within(nav).getByRole("tab", { name }));
}

describe("PortalEditor — en-tête", () => {
  it("affiche le nom de l'organisation et la ligne de statut", () => {
    renderEditor();
    expect(screen.getByText(/Site de démarches — Ville de Sainte-Colombe/)).toBeTruthy();
    expect(screen.getByText("Brouillon enregistré à 14:32")).toBeTruthy();
  });

  it("les trois vues sont ouvertes : Composition, Contenus et Thème", () => {
    renderEditor();
    const nav = screen.getByRole("tablist", { name: "Vue de l'éditeur" });
    for (const name of ["Composition", "Contenus", "Thème"]) {
      expect(within(nav).getByRole("tab", { name }).getAttribute("aria-disabled")).toBeNull();
    }
  });

  it("l'onglet Thème ouvre les réglages, et le canevas reste celui de la page", () => {
    renderEditor();
    const nav = screen.getByRole("tablist", { name: "Vue de l'éditeur" });
    fireEvent.click(within(nav).getByRole("tab", { name: "Thème" }));

    expect(screen.getByRole("complementary", { name: "Réglages du thème" })).toBeTruthy();
    // La page composée est toujours là — on règle son apparence, pas une
    // maquette d'exemple.
    expect(screen.getByText("Trouvez votre démarche")).toBeTruthy();
    // Plus d'édition de composition : ni palette, ni bouton d'ajout.
    expect(screen.queryByRole("button", { name: "Ajouter une section" })).toBeNull();
  });

  it("un réglage du thème remonte au parent, la page n'est pas touchée", () => {
    const { onThemeChange, onChange } = renderEditor();
    const nav = screen.getByRole("tablist", { name: "Vue de l'éditeur" });
    fireEvent.click(within(nav).getByRole("tab", { name: "Thème" }));

    fireEvent.click(screen.getByRole("tab", { name: "Arrondis" }));
    expect(onThemeChange).toHaveBeenCalledTimes(1);
    expect(onThemeChange.mock.calls[0][0].shapes.radius).toBe("round");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("« Aperçu gros texte » ne remonte RIEN : c'est une simulation, pas un réglage du site", () => {
    const { onThemeChange } = renderEditor();
    const nav = screen.getByRole("tablist", { name: "Vue de l'éditeur" });
    fireEvent.click(within(nav).getByRole("tab", { name: "Thème" }));

    fireEvent.click(screen.getByRole("switch", { name: "Aperçu gros texte" }));
    expect(onThemeChange).not.toHaveBeenCalled();
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

describe("PortalEditor — mention d'accessibilité", () => {
  it("la bande du bas du canevas ouvre l'inspecteur de la mention", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Mention d'accessibilité vide/ }));
    expect(screen.getByRole("region", { name: "Réglages de la mention d'accessibilité" })).toBeTruthy();
    // Ce n'est pas une section : pas de position sur la page.
    expect(screen.queryByText(/sur la page/)).toBeNull();
  });

  it("ses réglages remontent dans le THÈME, la composition n'est pas touchée", () => {
    const { onThemeChange, onChange } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Mention d'accessibilité vide/ }));

    fireEvent.change(screen.getByLabelText("Texte de la mention"), {
      target: { value: "Accessibilité : partiellement conforme" },
    });
    const next: PortalTheme = onThemeChange.mock.calls[0][0];
    expect(next.accessibility.declaration).toBe("Accessibilité : partiellement conforme");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("⚠️ Suppr avec la mention sélectionnée ne retire aucune section", () => {
    const { onChange } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Mention d'accessibilité vide/ }));
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sans déclaration rédigée, le lien est annoncé comme en attente, et mène à Contenus", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /Mention d'accessibilité vide/ }));
    expect(screen.getByText(/le lien n'apparaîtra sur le site/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Rédiger la déclaration/ }));
    expect(screen.getByRole("heading", { name: "Déclaration d'accessibilité" })).toBeTruthy();
  });

  it("une mention masquée garde ses champs, masqués et non effacés", () => {
    const theme = defaultPortalTheme();
    renderEditor({
      theme: {
        ...theme,
        accessibility: { ...theme.accessibility, declarationEnabled: false, declaration: "Audit" },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Mention d'accessibilité masquée/ }));
    expect(screen.queryByLabelText("Texte de la mention")).toBeNull();
    expect(screen.getByRole("switch", { name: "Afficher la mention" })).toBeTruthy();
  });
});

describe("PortalEditor — contenus", () => {
  it("« Partir du modèle RGAA » remplit la déclaration au nom de la collectivité", () => {
    const { onStatementChange, onThemeChange } = renderEditor();
    openView("Contenus");

    fireEvent.click(screen.getByRole("button", { name: /Partir du modèle RGAA/ }));
    const body: string = onStatementChange.mock.calls[0][0].body;
    expect(body).toContain("Ville de Sainte-Colombe s'engage");
    expect(body).toContain("accueil@sainte-colombe.fr");
    expect(onThemeChange).not.toHaveBeenCalled();
  });

  it("⚠️ un texte déjà écrit n'est remplacé par le modèle qu'après confirmation", () => {
    const { onStatementChange } = renderEditor({ statement: { body: "Mon texte" } });
    openView("Contenus");

    fireEvent.click(screen.getByRole("button", { name: /Repartir du modèle RGAA/ }));
    expect(onStatementChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remplacer" }));
    expect(onStatementChange).toHaveBeenCalledTimes(1);
  });

  it("la saisie remonte au parent", () => {
    const { onStatementChange } = renderEditor();
    openView("Contenus");
    fireEvent.change(screen.getByLabelText("Texte de la déclaration"), {
      target: { value: "# État de conformité" },
    });
    expect(onStatementChange).toHaveBeenCalledWith({ body: "# État de conformité" });
  });

  it("« Régler la mention » ramène à la composition, mention ouverte", () => {
    renderEditor();
    openView("Contenus");
    fireEvent.click(screen.getByRole("button", { name: /Régler la mention/ }));
    expect(screen.getByRole("region", { name: "Réglages de la mention d'accessibilité" })).toBeTruthy();
  });

  it("ni appareil ni aperçu : un texte long ne se prévisualise pas par écran", () => {
    renderEditor();
    openView("Contenus");
    expect(screen.queryByRole("tablist", { name: "Appareil" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Prévisualiser" })).toBeNull();
    // Publier et Annuler restent : ils valent pour tout le site.
    expect(screen.getByRole("button", { name: "Publier" })).toBeTruthy();
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
