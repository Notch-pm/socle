// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SectionInspector } from "./SectionInspector";

const h = { remove: vi.fn() };
const CONTACT = { name: "ACCM", address: "1 place", phone: null, email: null };
import { createSection, MAX_SHORTCUTS, type PortalSection } from "@/features/portal/portalPage";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";

// Primitives Radix (Switch) : polyfills absents de jsdom.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

function entry(over: Partial<PortalCatalogueEntry> = {}): PortalCatalogueEntry {
  return {
    id: "p1",
    name: "Acte de naissance",
    shortDescription: "Délai 3 jours",
    visibility: "visible",
    organizations: [{ id: "org-1", name: "ACCM" }],
    audiences: ["citoyen"],
    ...over,
  };
}

// La traduction automatique passe par TanStack Query ; son comportement est
// testé dans `TranslationFields.test.tsx`. Ici, on ne vérifie que sa PRÉSENCE.
vi.mock("@/features/languages/useTranslateLabels", () => ({
  useTranslateLabels: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

// Pas de `@testing-library/jest-dom` dans ce dépôt : assertions sur le DOM brut.
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

function renderInspector(
  section: PortalSection,
  catalogue: PortalCatalogueEntry[] = [entry()],
  languages: readonly string[] = ["fr"],
) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(
    <SectionInspector
      section={section}
      index={1}
      total={4}
      contact={CONTACT}
      languages={languages}
      organizationId="org-1"
        onRemove={h.remove}
        catalogue={catalogue}
      onChange={onChange}
      onClose={onClose}
    />,
  );
  return { onChange, onClose };
}

describe("SectionInspector — démarches", () => {
  it("épingle une démarche : onChange reçoit l'id ajouté à pinned", () => {
    const section = { ...createSection("demarches"), pinned: [] } as PortalSection;
    const { onChange } = renderInspector(section, [entry({ id: "p1" }), entry({ id: "p2", name: "Urbanisme" })]);

    fireEvent.click(screen.getAllByRole("button", { name: /Épingler/ })[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ pinned: ["p1"] });
  });

  it("change le nombre de colonnes via le segmenté", () => {
    const section = { ...createSection("demarches"), columns: 3 } as PortalSection;
    const { onChange } = renderInspector(section);

    fireEvent.click(screen.getByRole("tab", { name: "4" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ columns: 4 }));
  });

  it("affiche le motif d'une démarche non visible, mais la garde sélectionnable", () => {
    const section = { ...createSection("demarches"), pinned: [] } as PortalSection;
    renderInspector(section, [entry({ id: "p1", visibility: "brouillon" })]);

    expect(screen.getByText("Brouillon")).toBeTruthy();
    const button = screen.getByRole("button", { name: /Acte de naissance/ });
    expect(isDisabled(button)).toBe(false);
  });
});

describe("SectionInspector — filtre « Je suis… » de la grille", () => {
  it("se bascule, et se cumule avec le filtre par organisme au lieu de le remplacer", () => {
    const section = { ...createSection("demarches"), audienceFilter: false } as PortalSection;
    const { onChange } = renderInspector(section);

    fireEvent.click(screen.getByLabelText(/Filtre/));

    // Seul `audienceFilter` bouge : rien de ce qui concerne les organismes.
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ audienceFilter: true }));
  });
});

describe("SectionInspector — texte et image", () => {
  it("change l'ordre des deux moitiés", () => {
    const section = createSection("texte-image") as PortalSection;
    const { onChange } = renderInspector(section);

    fireEvent.click(screen.getByRole("tab", { name: "Image puis texte" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ layout: "image-first" }));
  });

  it("signale une adresse d'image que la page n'acceptera pas", () => {
    // Le parseur l'écarterait en silence au rechargement : mieux vaut le dire
    // au moment où elle se tape.
    const section = { ...createSection("texte-image"), imageUrl: "javascript:alert(1)" } as PortalSection;
    renderInspector(section);
    expect(screen.getByText(/Adresse attendue/)).toBeTruthy();
  });

  it("ne signale rien tant que le champ est vide — une image est facultative", () => {
    renderInspector(createSection("texte-image"));
    expect(screen.queryByText(/Adresse attendue/)).toBeNull();
  });

  it("annonce son titre comme facultatif", () => {
    renderInspector(createSection("texte-image"));
    expect(screen.getByLabelText(/Titre \(facultatif\)/)).toBeTruthy();
  });
});

describe("SectionInspector — recherche", () => {
  it("bascule l'affichage des démarches fréquentes", () => {
    const section = { ...createSection("recherche"), showShortcuts: false } as PortalSection;
    const { onChange } = renderInspector(section);

    fireEvent.click(screen.getByLabelText("Démarches fréquentes"));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showShortcuts: true }));
  });

  it("désactive les raccourcis restants au-delà de la limite", () => {
    const catalogue = Array.from({ length: MAX_SHORTCUTS + 2 }, (_, i) =>
      entry({ id: `p${i}`, name: `Démarche ${i}` }),
    );
    const section = {
      ...createSection("recherche"),
      showShortcuts: true,
      shortcuts: catalogue.slice(0, MAX_SHORTCUTS).map((c) => c.id),
    } as PortalSection;
    renderInspector(section, catalogue);

    // Les 4 déjà choisies restent cliquables (pour être retirées) ; les 2 en trop sont désactivées.
    const remaining = catalogue.slice(MAX_SHORTCUTS);
    for (const item of remaining) {
      expect(isDisabled(screen.getByRole("button", { name: new RegExp(item.name) }))).toBe(true);
    }
    const picked = catalogue.slice(0, MAX_SHORTCUTS);
    for (const item of picked) {
      expect(isDisabled(screen.getByRole("button", { name: new RegExp(item.name) }))).toBe(false);
    }
    expect(screen.getByText(/Limite de 4 atteinte/)).toBeTruthy();
  });
});

describe("SectionInspector — actus", () => {
  it("annonce que les actualités ne sont pas encore éditables", () => {
    renderInspector(createSection("actus"));
    expect(screen.getByText(/Bientôt disponible — les actualités ne sont pas encore éditables/)).toBeTruthy();
  });
});

describe("SectionInspector — commun", () => {
  it("affiche la position de la section sur la page", () => {
    renderInspector(createSection("texte"));
    expect(screen.getByText("Position 2 / 4 sur la page")).toBeTruthy();
  });

  it("ferme le panneau au clic sur la croix", () => {
    const { onClose } = renderInspector(createSection("texte"));
    fireEvent.click(screen.getByLabelText("Fermer le panneau"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("SectionInspector — retirer la section", () => {
  it("propose de supprimer la section, y compris quand elle n'est pas éditable", () => {
    h.remove.mockReset();
    render(
      <SectionInspector
        section={createSection("actus")}
        index={0}
        total={1}
        catalogue={[]}
        contact={CONTACT}
        languages={["fr"]}
        organizationId="org-1"
        onChange={vi.fn()}
        onRemove={h.remove}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Supprimer la section/ }));
    expect(h.remove).toHaveBeenCalledTimes(1);
  });
});

/**
 * La traduction des textes d'un bloc.
 *
 * Le comportement du composant de saisie (ne remplit que le vide, ne persiste
 * rien) est testé dans `TranslationFields.test.tsx` ; ce qui compte ici, c'est
 * qu'il n'apparaisse QUE là où il a du sens.
 */
describe("SectionInspector — traductions des textes", () => {
  it("n'affiche rien quand la collectivité est monolingue", () => {
    // Le garde est ici, pas dans `TranslationFields` : un canevas n'explique
    // pas un réglage qui vit ailleurs, il n'affiche rien.
    renderInspector(createSection("texte"), [], ["fr"]);
    expect(screen.queryByText(/Traductions/)).toBeNull();
  });

  it("propose la traduction dès qu'une seconde langue est activée", () => {
    renderInspector(createSection("texte"), [], ["fr", "en", "br"]);
    expect(screen.getByText("Traductions — 2 langues")).not.toBeNull();
  });

  it("ne propose que les textes que le bloc porte vraiment", () => {
    // Une grille de démarches n'a qu'un titre : proposer un paragraphe
    // demanderait de traduire un champ français qui n'existe pas.
    renderInspector(createSection("demarches"), [], ["fr", "en"]);
    expect(screen.getByText("Traductions — 1 langue")).not.toBeNull();
    expect(screen.queryByLabelText("Paragraphe")).toBeNull();
  });
});
