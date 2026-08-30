// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProcedureEditor } from "./ProcedureEditor";

// Démarche servie par le mock de useProcedure + espions de mutation (hissés car
// les factories de vi.mock sont évaluées avant le corps du module).
const h = vi.hoisted(() => {
  const procedure = {
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
    translations: null,
    requester_config: null,
    form_schema: null,
    knowledge_base: null,
    communication_config: null,
    status: "brouillon",
    created_at: null,
    updated_at: null,
  };
  return {
    procedure,
    mutateUpdate: vi.fn(
      (_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    ),
    mutateCreate: vi.fn(),
  };
});

// Hooks Supabase/TanStack Query court-circuités (mêmes motifs que les tests d'étapes).
vi.mock("@/features/procedures/useProcedures", () => ({
  PROCEDURE_TYPES: [
    { value: "externe", label: "Externe" },
    { value: "interne", label: "Interne" },
  ],
  useProcedure: () => ({ data: h.procedure, isLoading: false, isError: false }),
  useNextProcedureRank: () => ({ data: 1 }),
  useCreateProcedure: () => ({ mutate: h.mutateCreate, isPending: false, error: null }),
  useUpdateProcedure: () => ({ mutate: h.mutateUpdate, isPending: false, error: null }),
}));
vi.mock("@/features/categories/useCategories", () => ({
  useCategoriesQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/features/document-types/useDocumentTypes", () => ({
  useDocumentTypesForOrg: () => ({ data: [] }),
}));
vi.mock("@/features/procedures/useProcedureDocuments", () => ({
  useUploadProcedureDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveProcedureDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  createSignedDocumentUrl: vi.fn(),
}));

// Primitives Radix (Switch) : polyfills absents de jsdom.
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

function renderEditor(initialStep: number) {
  const onStepChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <ProcedureEditor
      procedureId="proc-1"
      initialStep={initialStep}
      onClose={vi.fn()}
      onCreated={onCreated}
      onStepChange={onStepChange}
    />,
  );
  return { onStepChange, onCreated };
}

beforeEach(() => {
  h.mutateUpdate.mockClear();
  h.mutateCreate.mockClear();
});

describe("ProcedureEditor — pied de page du stepper", () => {
  it("« Enregistrer » enregistre sans avancer et confirme sur place", () => {
    const { onStepChange } = renderEditor(1);

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(h.mutateUpdate).toHaveBeenCalledTimes(1);
    // Toujours sur l'étape « Informations demandeur ».
    expect(onStepChange).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: /Activer le public Citoyens/i })).toBeTruthy();
    // Confirmation visible (pas de navigation → il faut un retour visuel).
    expect(screen.getByRole("status").textContent).toContain("Enregistré");
  });

  it("« Enregistrer et continuer » enregistre puis avance d'une étape", () => {
    const { onStepChange } = renderEditor(1);

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et continuer" }));

    expect(h.mutateUpdate).toHaveBeenCalledTimes(1);
    expect(onStepChange).toHaveBeenCalledWith(2);
    // L'étape Demandeur n'est plus affichée.
    expect(screen.queryByRole("switch", { name: /Activer le public Citoyens/i })).toBeNull();
  });

  it("étape « Communication » : enregistre le bloc visibilité et avance", () => {
    const { onStepChange } = renderEditor(3);

    fireEvent.click(screen.getByRole("switch", { name: "Visible sur le portail" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer et continuer" }));

    expect(h.mutateUpdate).toHaveBeenCalledTimes(1);
    expect(h.mutateUpdate.mock.calls[0][0]).toEqual({
      id: "proc-1",
      communication_config: {
        visibility: {
          portalVisible: false,
          publicationPeriodEnabled: true,
          publicationStart: null,
          publicationEnd: null,
        },
      },
    });
    expect(onStepChange).toHaveBeenCalledWith(4);
  });

  it("dernière étape : « Enregistrer » seul (rien à continuer)", () => {
    const { onStepChange } = renderEditor(4);

    expect(screen.queryByRole("button", { name: "Enregistrer et continuer" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(h.mutateUpdate).toHaveBeenCalledTimes(1);
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it("une démarche en brouillon porte le tag dans l'en-tête", () => {
    renderEditor(0);
    expect(screen.getByText("Brouillon")).toBeTruthy();
  });

  it("bout du stepper sur un brouillon : propose la mise en production", () => {
    renderEditor(4);

    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("actuellement à l'état brouillon");

    // Le premier enregistrement (l'étape), puis le passage en production.
    fireEvent.click(screen.getByRole("button", { name: "Passer en production" }));
    expect(h.mutateUpdate).toHaveBeenCalledTimes(2);
    expect(h.mutateUpdate.mock.calls[1][0]).toEqual({ id: "proc-1", status: "production" });
  });

  it("enregistrer une étape intermédiaire ne propose rien", () => {
    renderEditor(1);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("navigation Précédent / stepper : notifie le parent du changement d'étape", () => {
    const { onStepChange } = renderEditor(1);

    fireEvent.click(screen.getByRole("button", { name: "Précédent" }));
    expect(onStepChange).toHaveBeenCalledWith(0);
  });
});
