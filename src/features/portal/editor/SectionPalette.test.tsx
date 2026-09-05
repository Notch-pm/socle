// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionPalette } from "./SectionPalette";
import { createContactSection, createSection, type ContactSource } from "@/features/portal/portalPage";

const CONTACT: ContactSource = {
  name: "Mairie de Sainte-Colombe",
  address: "1 place de la Mairie",
  phone: "04 78 00 00 00",
  email: "accueil@sainte-colombe.fr",
};

function renderPalette(onAdd = vi.fn()) {
  render(
    <SectionPalette open onOpenChange={vi.fn()} contact={CONTACT} onAdd={onAdd} />,
  );
  return { onAdd };
}

describe("SectionPalette", () => {
  it("ajoute un bandeau texte au clic", () => {
    const { onAdd } = renderPalette();
    fireEvent.click(screen.getByRole("button", { name: /Bandeau texte/ }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const added = onAdd.mock.calls[0][0];
    // L'id est généré (aléatoire) : on compare le reste, fidèle à `createSection`.
    const { id: _id, ...expected } = createSection("texte");
    expect(added).toMatchObject(expected);
    expect(typeof added.id).toBe("string");
    expect(added.id.length).toBeGreaterThan(0);
  });

  it("désactive le bloc Actualités, indisponible", () => {
    renderPalette();
    const button = screen.getByRole("button", { name: /Actualités/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("title")).toBe("Bientôt disponible");

    fireEvent.click(button);
  });

  it("pré-remplit le bandeau « Contact et horaires » depuis l'organisation", () => {
    const { onAdd } = renderPalette();
    fireEvent.click(screen.getByRole("button", { name: /Contact et horaires/ }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const added = onAdd.mock.calls[0][0];
    expect(added.kind).toBe("texte");
    expect(added).toMatchObject({
      title: "Mairie de Sainte-Colombe",
      body: createContactSection(CONTACT).body,
    });
  });

  it("replie la palette en un bouton rond quand elle est fermée", () => {
    render(<SectionPalette open={false} onOpenChange={vi.fn()} contact={CONTACT} onAdd={vi.fn()} />);
    expect(screen.queryByText("Blocs")).toBeNull();
    expect(screen.getByRole("button", { name: /Ouvrir la palette/ })).toBeTruthy();
  });
});
