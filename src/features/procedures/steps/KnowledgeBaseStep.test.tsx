// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KnowledgeBaseStep } from "./KnowledgeBaseStep";

// Téléversement de documents : on court-circuite les hooks Supabase/TanStack Query
// (le comportement du stockage est couvert par les tests unitaires de `procedureStorage`).
vi.mock("@/features/procedures/useProcedureDocuments", () => ({
  useUploadProcedureDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveProcedureDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  createSignedDocumentUrl: vi.fn(),
}));
import { defaultKnowledgeBase, type KnowledgeBase } from "@/features/procedures/knowledgeBase";
import type { Procedure } from "@/features/procedures/useProcedures";

function makeProcedure(knowledgeBase: unknown = null): Procedure {
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
    integration_id: null,
    external_reference: null,
    partner_config: null,
    agent_description: null,
    user_description: null,
    user_communication: null,
    translations: null,
    requester_config: null,
    form_schema: null,
    knowledge_base: knowledgeBase as Procedure["knowledge_base"],
    communication_config: null,
    status: "brouillon",
    access_mode: "libre",
    created_at: null,
    updated_at: null,
  };
}

function renderStep(procedure: Procedure) {
  const onSubmit = vi.fn();
  render(<KnowledgeBaseStep formId="form-test" procedure={procedure} onSubmit={onSubmit} />);
  const submit = () => fireEvent.submit(document.getElementById("form-test")!);
  return { onSubmit, submit };
}

describe("KnowledgeBaseStep", () => {
  it("affiche les sections principales", () => {
    renderStep(makeProcedure(null));
    expect(screen.getByText("Consignes pour l'agent")).toBeTruthy();
    expect(screen.getByText("Texte d'aide pour l'agent")).toBeTruthy();
    expect(screen.getByText("Procédures")).toBeTruthy();
    // Sections « documents » avec téléversement (bucket privé Supabase).
    expect(screen.getByText("Documents d'aide agent")).toBeTruthy();
    expect(screen.getByText("Documents d'entraînement IA")).toBeTruthy();
  });

  it("émet une base vierge quand rien n'est saisi", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));
    submit();
    expect(onSubmit).toHaveBeenCalledWith(defaultKnowledgeBase());
  });

  it("saisit le texte d'aide et l'émet", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));
    fireEvent.change(screen.getByLabelText("Texte d'aide pour l'agent"), {
      target: { value: "Vérifier l'éligibilité." },
    });
    submit();
    expect(onSubmit.mock.calls[0][0].agentHelpText).toBe("Vérifier l'éligibilité.");
  });

  it("ajoute un lien utile agent et l'émet (les lignes vides sont retirées)", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un lien" }));
    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "https://service-public.fr" },
    });
    submit();
    const kb = onSubmit.mock.calls[0][0] as KnowledgeBase;
    expect(kb.agentLinks).toEqual([{ url: "https://service-public.fr", description: "" }]);
  });

  it("ajoute un garde-fou et l'émet", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un garde-fou" }));
    fireEvent.change(screen.getByPlaceholderText(/Ne jamais valider/i), {
      target: { value: "Ne pas décider sans pièce d'identité." },
    });
    submit();
    const kb = onSubmit.mock.calls[0][0] as KnowledgeBase;
    expect(kb.guardrails).toEqual(["Ne pas décider sans pièce d'identité."]);
  });

  it("charge une base existante et la ré-émet fidèlement", () => {
    const existing = {
      agentHelpText: "Aide X",
      faq: [{ question: "Q", answer: "A" }],
      guardrails: ["G"],
    };
    const { onSubmit, submit } = renderStep(makeProcedure(existing));
    submit();
    expect(onSubmit).toHaveBeenCalledWith({
      ...defaultKnowledgeBase(),
      agentHelpText: "Aide X",
      faq: [{ question: "Q", answer: "A" }],
      guardrails: ["G"],
    });
  });
});
