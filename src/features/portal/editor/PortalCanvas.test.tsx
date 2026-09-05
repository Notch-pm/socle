// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { createSection } from "@/features/portal/portalPage";
import { PortalCanvas, type PortalCanvasProps } from "./PortalCanvas";

// jsdom n'a pas de ResizeObserver ; le canevas s'en sert pour la mise à
// l'échelle, qui n'est pas ce qu'on teste ici.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const sections = [
  { ...createSection("recherche"), id: "a", title: "Recherche A" },
  { ...createSection("demarches"), id: "b", title: "Grille B" },
  { ...createSection("texte"), id: "c", title: "Texte C" },
];

function renderCanvas(over: Partial<PortalCanvasProps> = {}) {
  const props: PortalCanvasProps = {
    organizationName: "ACCM",
    sections,
    device: "bureau",
    selectedId: null,
    catalogue: [],
    paletteOpen: false,
    previewing: false,
    dropIndex: null,
    dropLabel: null,
    onSelect: vi.fn(),
    onShift: vi.fn(),
    onRemove: vi.fn(),
    onOpenPalette: vi.fn(),
    ...over,
  };
  return render(
    <DndContext>
      <PortalCanvas {...props} />
    </DndContext>,
  );
}

/**
 * Les textes donnés, dans l'ordre où le document les affiche. Comparer des
 * positions dans le texte du corps ne présume rien des balises que les
 * sections emploient pour leurs titres.
 */
function visualOrder(...texts: string[]): string[] {
  const body = document.body.textContent ?? "";
  return [...texts]
    .map((text) => ({ text, at: body.indexOf(text) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(({ text }) => text);
}

describe("PortalCanvas — l'ombre de dépôt", () => {
  it("n'existe pas hors d'un glisser", () => {
    renderCanvas();
    expect(screen.queryByText(/déposer ici/)).toBeNull();
  });

  it("se dessine à l'index de destination, entre les sections", () => {
    // Index 1 = entre la première et la deuxième section : c'est là que le
    // bloc tombera, et c'est là qu'on doit le voir.
    renderCanvas({ dropIndex: 1, dropLabel: "Bandeau texte" });
    const shadow = screen.getByText("Bandeau texte — déposer ici");
    expect(shadow.getAttribute("aria-hidden")).toBe("true");
    expect(visualOrder("Recherche A", "Grille B", "Texte C", "Bandeau texte — déposer ici")).toEqual([
      "Recherche A",
      "Bandeau texte — déposer ici",
      "Grille B",
      "Texte C",
    ]);
  });

  it("se dessine après la dernière section quand la destination est la fin", () => {
    renderCanvas({ dropIndex: sections.length, dropLabel: "Espace usager" });
    expect(visualOrder("Recherche A", "Grille B", "Texte C", "Espace usager — déposer ici")).toEqual([
      "Recherche A",
      "Grille B",
      "Texte C",
      "Espace usager — déposer ici",
    ]);
  });

  it("nomme ce qui va tomber, pas seulement où", () => {
    renderCanvas({ dropIndex: 0, dropLabel: "Grille de démarches" });
    expect(screen.getByText("Grille de démarches — déposer ici")).toBeTruthy();
  });
});
