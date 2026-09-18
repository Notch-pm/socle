// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommunicationStep } from "./CommunicationStep";
import type { Procedure } from "@/features/procedures/useProcedures";

// Catalogue de documents : on court-circuite l'appel réseau TanStack Query.
// Trois entrées couvrant les deux groupes (interne/externe -> Documents,
// courrier -> Courriers).
vi.mock("@/features/documents/useDocumentTemplates", () => ({
  useDocumentTemplatesForOrg: () => ({
    data: [
      { id: "tpl-doc", name: "Notice explicative", type: "interne", file_name: "notice.docx",
        organization_id: "org-1", description: null, file_path: "org-1/notice.docx",
        created_at: null, updated_at: null },
      { id: "tpl-doc2", name: "Formulaire de recours", type: "externe", file_name: "recours.odt",
        organization_id: "org-1", description: null, file_path: "org-1/recours.odt",
        created_at: null, updated_at: null },
      { id: "tpl-lettre", name: "Lettre de refus", type: "courrier", file_name: "refus.docx",
        organization_id: "org-1", description: null, file_path: "org-1/refus.docx",
        created_at: null, updated_at: null },
    ],
    isLoading: false,
  }),
}));

// jsdom n'implémente pas la capture de pointeur utilisée par certaines primitives Radix.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// Radix Switch mesure sa taille via ResizeObserver, absent de jsdom.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/** Démarche minimale mais complète pour piloter le composant. */
function makeProcedure(communicationConfig: unknown = null): Procedure {
  return {
    id: "proc-1",
    name: "Démarche test",
    organization_id: "org-1",
    category_id: null,
    type: "externe",
    keywords: null,
    short_description: null,
    input_duration_minutes: null,
    order_index: null,
    is_active_global: null,
    agent_description: null,
    user_description: null,
    user_communication: null,
    translations: null,
    requester_config: null,
    form_schema: null,
    knowledge_base: null,
    communication_config: communicationConfig as Procedure["communication_config"],
    status: "brouillon",
    access_mode: "libre",
    created_at: null,
    updated_at: null,
  };
}

function renderStep(procedure: Procedure) {
  const onSubmit = vi.fn();
  render(<CommunicationStep formId="communication-test" procedure={procedure} onSubmit={onSubmit} />);
  const submit = () => fireEvent.submit(document.getElementById("communication-test")!);
  return { onSubmit, submit };
}

const portalSwitch = () => screen.getByRole("switch", { name: "Visible sur le portail" });
const periodSwitch = () =>
  screen.getByRole("switch", { name: "Limiter la publication à une période" });
const startInput = () =>
  screen.getByLabelText(/Date de début de publication/) as HTMLInputElement;
const endInput = () => screen.getByLabelText(/Date de fin de publication/) as HTMLInputElement;

describe("CommunicationStep — bloc Visibilité", () => {
  it("démarche jamais paramétrée : les deux commutateurs sont actifs, sans dates", () => {
    renderStep(makeProcedure(null));

    expect(portalSwitch().getAttribute("aria-checked")).toBe("true");
    expect(periodSwitch().getAttribute("aria-checked")).toBe("true");
    expect(startInput().value).toBe("");
    expect(endInput().value).toBe("");
  });

  it("relit les paramètres enregistrés", () => {
    renderStep(
      makeProcedure({
        visibility: {
          portalVisible: false,
          publicationPeriodEnabled: true,
          publicationStart: "2026-09-01",
          publicationEnd: "2026-12-31",
        },
      }),
    );

    expect(portalSwitch().getAttribute("aria-checked")).toBe("false");
    expect(startInput().value).toBe("2026-09-01");
    expect(endInput().value).toBe("2026-12-31");
  });

  it("les dates n'apparaissent que si la publication est limitée à une période", () => {
    renderStep(makeProcedure(null));

    fireEvent.click(periodSwitch());
    expect(screen.queryByLabelText(/Date de début de publication/)).toBeNull();
    expect(screen.queryByLabelText(/Date de fin de publication/)).toBeNull();
  });

  it("transmet les paramètres saisis", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));

    fireEvent.click(portalSwitch());
    fireEvent.change(startInput(), { target: { value: "2026-09-01" } });
    fireEvent.change(endInput(), { target: { value: "2026-12-31" } });
    submit();

    expect(onSubmit).toHaveBeenCalledWith({
      visibility: {
        portalVisible: false,
        publicationPeriodEnabled: true,
        publicationStart: "2026-09-01",
        publicationEnd: "2026-12-31",
      },
      documents: { restrictVisibility: false, documents: [], letters: [] },
    });
  });

  it("refuse d'enregistrer une période dont la fin précède le début", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));

    fireEvent.change(startInput(), { target: { value: "2026-12-31" } });
    fireEvent.change(endInput(), { target: { value: "2026-09-01" } });
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/doit suivre la date de début/)).toBeTruthy();
  });

  it("désactiver la période conserve les dates (retour en arrière possible)", () => {
    const { onSubmit, submit } = renderStep(
      makeProcedure({
        visibility: {
          portalVisible: true,
          publicationPeriodEnabled: true,
          publicationStart: "2026-09-01",
          publicationEnd: "2026-12-31",
        },
      }),
    );

    fireEvent.click(periodSwitch());
    submit();

    expect(onSubmit).toHaveBeenCalledWith({
      visibility: {
        portalVisible: true,
        publicationPeriodEnabled: false,
        publicationStart: "2026-09-01",
        publicationEnd: "2026-12-31",
      },
      documents: { restrictVisibility: false, documents: [], letters: [] },
    });
  });
});

describe("CommunicationStep — bloc Documents et courriers", () => {
  const addDocumentSelect = () =>
    screen.getByLabelText("Ajouter dans « Documents »") as HTMLSelectElement;
  const addLetterSelect = () =>
    screen.getByLabelText("Ajouter dans « Courriers »") as HTMLSelectElement;
  const addButtons = () => screen.getAllByRole("button", { name: /Ajouter/ });

  function optionsOf(select: HTMLSelectElement) {
    return [...select.options].filter((o) => o.value !== "").map((o) => o.textContent);
  }

  it("range les courriers à part des documents", () => {
    renderStep(makeProcedure(null));
    expect(optionsOf(addDocumentSelect())).toEqual([
      "Notice explicative",
      "Formulaire de recours",
    ]);
    expect(optionsOf(addLetterSelect())).toEqual(["Lettre de refus"]);
  });

  it("le bouton reste inactif tant qu'aucun document n'est choisi", () => {
    renderStep(makeProcedure(null));
    for (const b of addButtons()) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("ajoute un document et le retire de ce qui reste à proposer", () => {
    renderStep(makeProcedure(null));
    fireEvent.change(addDocumentSelect(), { target: { value: "tpl-doc" } });
    fireEvent.click(addButtons()[0]);

    expect(screen.getByText("Notice explicative")).toBeTruthy();
    expect(optionsOf(addDocumentSelect())).toEqual(["Formulaire de recours"]);
  });

  it("désactive le sélecteur quand tout le groupe est pris", () => {
    // « Les boutons ne sont actifs que s'il existe des éléments non sélectionnés. »
    renderStep(
      makeProcedure({
        documents: { letters: [{ id: "tpl-lettre", visibility: "toujours" }] },
      }),
    );
    const select = addLetterSelect();
    expect(select.disabled).toBe(true);
    expect(select.options[0].textContent).toBe("Tout est déjà sélectionné");
  });

  it("retire un document sélectionné", () => {
    const { onSubmit, submit } = renderStep(
      makeProcedure({ documents: { documents: [{ id: "tpl-doc", visibility: "toujours" }] } }),
    );
    fireEvent.click(screen.getByTitle("Retirer « Notice explicative »"));
    submit();
    expect(onSubmit.mock.calls[0][0].documents.documents).toEqual([]);
  });

  it("n'affiche les conditions que si la restriction est active", () => {
    renderStep(
      makeProcedure({ documents: { documents: [{ id: "tpl-doc", visibility: "toujours" }] } }),
    );
    expect(screen.queryByLabelText("Visibilité de « Notice explicative »")).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Restreindre la visibilité selon l'issue" }));
    expect(screen.getByLabelText("Visibilité de « Notice explicative »")).toBeTruthy();
  });

  it("permet une condition différente par document (acceptation et refus)", () => {
    // Le cas qui justifie la restriction par document plutôt que globale.
    const { onSubmit, submit } = renderStep(
      makeProcedure({
        documents: {
          restrictVisibility: true,
          documents: [{ id: "tpl-doc2", visibility: "toujours" }],
          letters: [{ id: "tpl-lettre", visibility: "toujours" }],
        },
      }),
    );

    fireEvent.change(screen.getByLabelText("Visibilité de « Formulaire de recours »"), {
      target: { value: "positive" },
    });
    fireEvent.change(screen.getByLabelText("Visibilité de « Lettre de refus »"), {
      target: { value: "negative" },
    });
    submit();

    const { documents } = onSubmit.mock.calls[0][0];
    expect(documents.documents[0].visibility).toBe("positive");
    expect(documents.letters[0].visibility).toBe("negative");
  });

  it("désactiver la restriction conserve les conditions saisies", () => {
    const { onSubmit, submit } = renderStep(
      makeProcedure({
        documents: {
          restrictVisibility: true,
          letters: [{ id: "tpl-lettre", visibility: "negative" }],
        },
      }),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Restreindre la visibilité selon l'issue" }));
    submit();

    const { documents } = onSubmit.mock.calls[0][0];
    expect(documents.restrictVisibility).toBe(false);
    expect(documents.letters[0].visibility).toBe("negative");
  });

  it("ignore une sélection dont le document a disparu du catalogue", () => {
    renderStep(
      makeProcedure({ documents: { documents: [{ id: "supprime", visibility: "toujours" }] } }),
    );
    // Rien n'est affiché pour la référence morte : l'écran montre ce que l'API servira.
    expect(screen.getAllByText("Aucun élément sélectionné.").length).toBeGreaterThan(0);
  });
});
