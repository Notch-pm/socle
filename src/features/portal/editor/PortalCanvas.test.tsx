// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { createSection } from "@/features/portal/portalPage";
import { defaultPortalTheme } from "@/features/portal/portalTheme";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import type { Audience } from "@/features/procedures/requesterFields";
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
    organizationLogoUrl: null,
    organizationLogoWhiteUrl: null,
    theme: defaultPortalTheme(),
    branding: null,
    languages: ["fr"],
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
    statementWritten: false,
    mentionSelected: false,
    onSelectMention: vi.fn(),
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

/**
 * La place du sélecteur de langue dans la maquette.
 *
 * ⚠️ Il est DÉCORATIF, comme la nav et « Mon compte » : le canevas montre où il
 * se placera pour l'usager, il ne bascule pas la langue de l'aperçu.
 */
describe("PortalCanvas — la place du sélecteur de langue", () => {
  it("ne montre rien quand la collectivité n'a que le français", () => {
    // Montrer un sélecteur que ses usagers ne verront jamais serait un mensonge
    // de maquette.
    renderCanvas({ languages: ["fr"] });
    expect(screen.queryByTitle(/Fran\u00e7ais/)).toBeNull();
  });

  it("montre la pastille dès qu'une seconde langue est activée", () => {
    renderCanvas({ languages: ["fr", "en", "ar"] });
    const pill = screen.getByTitle("Français, Anglais, Arabe");
    expect(pill.textContent).toContain("Français");
    // Décoratif : pas un contrôle, donc rien à activer.
    expect(pill.tagName).toBe("SPAN");
  });

  it("la garde visible en mobile, contrairement à la nav", () => {
    // C'est le seul élément qu'un visiteur non francophone doit pouvoir
    // atteindre, et il le cherche d'abord sur son téléphone.
    renderCanvas({ languages: ["fr", "en"], device: "mobile" });
    expect(screen.getByTitle("Français, Anglais")).not.toBeNull();
  });
});

describe("PortalCanvas — le logo de la collectivité", () => {
  it("affiche le logo dans le bandeau quand l'organisation en a un", () => {
    // Le même repère que le portail : l'agent compose sa page sous l'identité
    // que verront ses usagers, pas sous une pastille générique.
    const { container } = renderCanvas({ organizationLogoUrl: "https://exemple.fr/logo.png" });
    const img = container.querySelector("header img");
    expect(img?.getAttribute("src")).toBe("https://exemple.fr/logo.png");
  });

  it("retombe sur la pastille sans logo", () => {
    const { container } = renderCanvas({ organizationLogoUrl: null });
    expect(container.querySelector("header img")).toBeNull();
  });

  it("retombe sur la pastille si l'image ne charge pas", () => {
    // `logo_url` est une URL libre : elle peut pointer vers un fichier disparu.
    // Une vignette cassée dans une maquette se lit comme un défaut de la page.
    const { container } = renderCanvas({ organizationLogoUrl: "https://exemple.fr/disparu.png" });
    const img = container.querySelector("header img") as HTMLImageElement;
    fireEvent.error(img);
    expect(container.querySelector("header img")).toBeNull();
  });
});

/**
 * Les deux filtres de la grille de démarches, tels que la maquette les montre.
 *
 * ⚠️ Ils sont DÉCORATIFS, comme la nav : le canevas montre la page, il ne la
 * fait pas fonctionner. Ce qui se vérifie ici, c'est leur PRÉSENCE — chacun ne
 * s'affiche que s'il y a de quoi choisir, et les deux se cumulent.
 */
describe("PortalCanvas — les filtres de la grille de démarches", () => {
  const proc = (id: string, audiences: Audience[], orgs: string[]): PortalCatalogueEntry => ({
    id,
    name: `Démarche ${id}`,
    shortDescription: null,
    visibility: "visible",
    organizations: orgs.map((name) => ({ id: name, name, handlingOrganizationId: null })),
    audiences,
  });

  const grid = (audienceFilter: boolean) => [
    { ...createSection("demarches"), id: "g", title: "Démarches les plus demandées", audienceFilter },
  ];

  it("montre « Je suis… » quand les démarches affichées visent plusieurs publics", () => {
    renderCanvas({
      sections: grid(true),
      catalogue: [proc("a", ["citoyen"], ["ACCM"]), proc("b", ["entreprise"], ["ACCM"])],
    });
    const pill = screen.getByTitle("Citoyen, Entreprise");
    expect(pill.textContent).toContain("Je suis");
  });

  it("ne le montre pas quand toutes visent le même public — un choix unique n'est pas un filtre", () => {
    renderCanvas({
      sections: grid(true),
      catalogue: [proc("a", ["citoyen"], ["ACCM"]), proc("b", ["citoyen"], ["ACCM"])],
    });
    expect(screen.queryByText(/Je suis/)).toBeNull();
  });

  it("ne le montre pas quand le bloc ne le propose pas, même si les publics diffèrent", () => {
    renderCanvas({
      sections: grid(false),
      catalogue: [proc("a", ["citoyen"], ["ACCM"]), proc("b", ["entreprise"], ["ACCM"])],
    });
    expect(screen.queryByText(/Je suis/)).toBeNull();
  });

  it("le cumule avec le filtre par organisme, il ne le remplace pas", () => {
    renderCanvas({
      sections: grid(true),
      catalogue: [proc("a", ["citoyen"], ["ACCM"]), proc("b", ["entreprise"], ["Arles"])],
    });
    expect(screen.getByTitle("Citoyen, Entreprise")).toBeTruthy();
    expect(screen.getByTitle("ACCM, Arles").textContent).toContain("Tous les organismes");
  });
});

describe("PortalCanvas — bloc texte et image", () => {
  it("rend l'image avec sa description, et respecte l'ordre choisi", () => {
    const section = {
      ...createSection("texte-image"),
      id: "ti",
      title: "Nos équipements",
      body: "La piscine est ouverte toute l'année.",
      imageUrl: "https://exemple.fr/piscine.jpg",
      alt: "La piscine municipale",
      layout: "image-first" as const,
    };
    const { container } = renderCanvas({ sections: [section] });
    const img = container.querySelector('img[src="https://exemple.fr/piscine.jpg"]');
    expect(img?.getAttribute("alt")).toBe("La piscine municipale");
    // L'ordre est porté par `order-first` : il vaut côte à côte ET empilé.
    expect(img?.closest("div")?.className).toContain("order-first");
  });

  it("montre la place de l'image tant qu'aucune adresse n'est saisie", () => {
    // Un bloc à moitié vide se lirait comme un bloc cassé.
    renderCanvas({ sections: [{ ...createSection("texte-image"), id: "ti" }] });
    expect(screen.getByText(/Adresse de l'image à renseigner/)).toBeTruthy();
  });
});

describe("PortalCanvas — la mention d'accessibilité", () => {
  const withMention = (patch: Partial<ReturnType<typeof defaultPortalTheme>["accessibility"]>) => {
    const theme = defaultPortalTheme();
    return { ...theme, accessibility: { ...theme.accessibility, ...patch } };
  };

  it("se pose sous la dernière section, pied de page composé compris", () => {
    const footer = { ...createSection("footer"), id: "f", title: "Pied composé" };
    renderCanvas({
      sections: [...sections, footer],
      theme: withMention({ declaration: "Accessibilité : partiellement conforme" }),
      previewing: true,
    });
    expect(visualOrder("Accessibilité : partiellement conforme", "Pied composé")).toEqual([
      "Pied composé",
      "Accessibilité : partiellement conforme",
    ]);
  });

  it("⚠️ le lien n'apparaît que si la déclaration est rédigée — comme sur le site", () => {
    const theme = withMention({ declaration: "Partiellement conforme" });
    const { unmount } = renderCanvas({ theme, previewing: true, statementWritten: false });
    expect(screen.queryByText("Déclaration d'accessibilité")).toBeNull();
    unmount();

    renderCanvas({ theme, previewing: true, statementWritten: true });
    expect(screen.getByText("Déclaration d'accessibilité")).toBeTruthy();
  });

  it("masquée, elle disparaît de l'aperçu mais reste cliquable en édition", () => {
    const theme = withMention({ declarationEnabled: false, declaration: "Partiellement conforme" });
    const { unmount } = renderCanvas({ theme, previewing: true, statementWritten: true });
    expect(screen.queryByText(/Partiellement conforme/)).toBeNull();
    unmount();

    const onSelectMention = vi.fn();
    renderCanvas({ theme, onSelectMention });
    fireEvent.click(screen.getByRole("button", { name: /Mention d'accessibilité masquée/ }));
    expect(onSelectMention).toHaveBeenCalledTimes(1);
  });
});
