// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { applyPreset, defaultPortalTheme, type PortalTheme } from "@/features/portal/portalTheme";
import type { ThemeBranding } from "@/features/portal/themeStyle";
import { ThemePanel } from "./ThemePanel";

// Radix Switch : polyfills absents de jsdom.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// L'ancien vert de la gamme (`#089b59`, foncé le 2026-09-18) : la charte type
// qui ne passe pas en texte sur blanc, et qu'un cran plus foncé sauve.
const CHARTE: ThemeBranding = { primaryColor: "#089b59", secondaryColor: "#ffcd57" };

function renderPanel(theme: PortalTheme = defaultPortalTheme(), branding = CHARTE) {
  const onChange = vi.fn();
  const onLargeTextChange = vi.fn();
  render(
    <ThemePanel
      theme={theme}
      branding={branding}
      onChange={onChange}
      largeText={false}
      onLargeTextChange={onLargeTextChange}
    />,
  );
  return { onChange, onLargeTextChange };
}

describe("ThemePanel — préréglages", () => {
  it("applique un préréglage entier d'un seul geste", () => {
    const { onChange } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Chaleureux/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({
      typography: { font: "nunito-sans", scale: "comfortable" },
      shapes: { radius: "round", shadow: "soft", density: "airy" },
    });
  });

  it("annonce « Personnalisé » quand le thème ne copie aucun préréglage", () => {
    // Les défauts n'en sont pas un : ils sont un point de départ, pas un choix.
    renderPanel();
    expect(screen.getByText("Personnalisé")).toBeTruthy();
  });

  it("nomme le préréglage quand le thème en est la copie exacte", () => {
    renderPanel(applyPreset(defaultPortalTheme(), "Contrasté"));
    expect(screen.getAllByText("Contrasté").length).toBeGreaterThan(0);
  });
});

describe("ThemePanel — en-tête", () => {
  it("les réglages du bandeau coloré n'apparaissent que s'il est coloré", () => {
    renderPanel();
    expect(screen.queryByRole("tablist", { name: "Couleur du bandeau" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Logo en version blanche" })).toBeNull();
  });

  it("les révèle quand le fond passe à la couleur", () => {
    renderPanel(applyPreset(defaultPortalTheme(), "Vitrine centrée"));
    expect(screen.getByRole("tablist", { name: "Couleur du bandeau" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Logo en version blanche" })).toBeTruthy();
  });

  it("un segment ne remonte QUE son réglage", () => {
    const theme = defaultPortalTheme();
    const { onChange } = renderPanel(theme);
    fireEvent.click(screen.getByRole("tab", { name: "Pilules" }));

    const next: PortalTheme = onChange.mock.calls[0][0];
    expect(next.header.menu).toBe("pills");
    expect(next.typography).toEqual(theme.typography);
    expect(next.shapes).toEqual(theme.shapes);
    expect(next.accessibility).toEqual(theme.accessibility);
  });
});

describe("ThemePanel — accessibilité", () => {
  it("⚠️ « Aperçu gros texte » ne touche PAS au thème : c'est une simulation", () => {
    const { onChange, onLargeTextChange } = renderPanel();
    fireEvent.click(screen.getByRole("switch", { name: "Aperçu gros texte" }));
    expect(onLargeTextChange).toHaveBeenCalledWith(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("la déclaration RGAA se saisit et remonte telle quelle", () => {
    const { onChange } = renderPanel();
    fireEvent.change(screen.getByLabelText(/Déclaration d'accessibilité/), {
      target: { value: "Conformité partielle" },
    });
    expect(onChange.mock.calls[0][0].accessibility.declaration).toBe("Conformité partielle");
  });
});

describe("ThemePanel — contrôle des contrastes", () => {
  it("mesure la charte réelle et propose le correctif qui marche", () => {
    // L'ancien vert de la gamme ne passe pas en texte sur blanc ; un cran
    // plus foncé suffit.
    const { onChange } = renderPanel();
    expect(screen.getAllByText("Insuffisant").length).toBeGreaterThan(0);

    const fix = screen.getAllByRole("button", { name: "Assombrir la couleur principale" });
    fireEvent.click(fix[fix.length - 1]);
    expect(onChange.mock.calls[0][0].accessibility.darkPrimary).toBe(true);
  });

  it("le correctif disparaît une fois appliqué, et la ligne devient conforme", () => {
    renderPanel({
      ...defaultPortalTheme(),
      accessibility: { ...defaultPortalTheme().accessibility, darkPrimary: true },
    });
    // Il ne reste que l'interrupteur du groupe Accessibilité, pas de bouton.
    expect(screen.queryByRole("button", { name: "Assombrir la couleur principale" })).toBeNull();
    expect(screen.getByRole("switch", { name: "Assombrir la couleur principale" })).toBeTruthy();
  });

  it("renvoie vers la charte graphique — le thème ne porte pas de couleur", () => {
    renderPanel();
    expect(screen.getByText(/onglet « Charte graphique »/)).toBeTruthy();
  });
});
