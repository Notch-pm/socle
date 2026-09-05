// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VariablesDialog } from "./VariablesDialog";
import { DOCUMENT_VARIABLE_GROUPS } from "./documentVariables";

// Primitives Radix (Dialog) : polyfills absents de jsdom.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

function renderDialog() {
  render(<VariablesDialog open onOpenChange={() => {}} />);
}

describe("VariablesDialog", () => {
  it("rend les trois domaines de variables", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Usager" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Demande" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Organisme" })).toBeTruthy();
  });

  it("affiche chaque variable avec son titre et son jeton", () => {
    renderDialog();
    expect(screen.getByText("Adresse complète")).toBeTruthy();
    expect(screen.getByText("{{usager.adresse_complete}}")).toBeTruthy();
    expect(screen.getByText("Code de suivi")).toBeTruthy();
    expect(screen.getByText("{{demande.code_suivi}}")).toBeTruthy();
    expect(screen.getByText("Couleur principale")).toBeTruthy();
    expect(screen.getByText("{{organisme.couleur_principale}}")).toBeTruthy();
  });

  it("affiche un jeton par variable du catalogue", () => {
    renderDialog();
    for (const group of DOCUMENT_VARIABLE_GROUPS) {
      for (const variable of group.variables) {
        expect(screen.getByText(`{{${variable.key}}}`)).toBeTruthy();
      }
    }
  });

  it("présente les pièces comme un bloc répété, ouvert et refermé", () => {
    renderDialog();
    expect(screen.getByText("Pièces de la demande")).toBeTruthy();
    const sample = screen.getByText(/\{\{#demande\.pieces\}\}/);
    expect(sample.textContent).toContain("{{/demande.pieces}}");
    expect(sample.textContent).toContain("{{libelle}}");
    expect(sample.textContent).toContain("{{statut}}");
  });

  it("copie le jeton dans le presse-papiers", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Copier {{usager.nom}}" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("{{usager.nom}}"));
  });

  it("reste utilisable quand le presse-papiers est indisponible", async () => {
    // Contexte non sécurisé ou permission refusée : le jeton reste affiché et
    // sélectionnable à la main, le dialogue ne doit pas casser.
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Copier {{usager.nom}}" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByText("{{usager.nom}}")).toBeTruthy();
  });
});
