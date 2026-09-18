// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormulaireStep } from "./FormulaireStep";
import type { FormSchema } from "@/features/procedures/formSchema";
import type { Procedure } from "@/features/procedures/useProcedures";

// Catalogue de types de pièce : on court-circuite l'appel réseau TanStack Query.
vi.mock("@/features/document-types/useDocumentTypes", () => ({
  useDocumentTypesForOrg: () => ({
    data: [
      { id: "dt-1", name: "Justificatif de domicile", organization_id: "org-1", created_at: null },
    ],
  }),
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

function makeProcedure(formSchema: unknown = null): Procedure {
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
    form_schema: formSchema as Procedure["form_schema"],
    knowledge_base: null,
    communication_config: null,
    status: "brouillon",
    access_mode: "libre",
    created_at: null,
    updated_at: null,
  };
}

function renderStep(procedure: Procedure) {
  const onSubmit = vi.fn();
  render(<FormulaireStep formId="form-test" procedure={procedure} onSubmit={onSubmit} />);
  const submit = () => fireEvent.submit(document.getElementById("form-test")!);
  return { onSubmit, submit };
}

describe("FormulaireStep — construction et émission du schéma", () => {
  it("émet un schéma vide versionné quand rien n'est ajouté", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));
    submit();
    expect(onSubmit).toHaveBeenCalledWith({ version: 1, content: [] });
  });

  it("ajoute un champ depuis la palette (clic) et l'émet", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));

    // Clic sur l'item de palette « Cases à cocher » → ajouté à la fin.
    fireEvent.click(screen.getByRole("button", { name: "Cases à cocher" }));
    fireEvent.change(screen.getByLabelText("Libellé du champ"), { target: { value: "Loisirs" } });

    submit();

    const schema = onSubmit.mock.calls[0][0] as FormSchema;
    expect(schema.content).toHaveLength(1);
    expect(schema.content[0]).toMatchObject({ type: "checkboxes", label: "Loisirs", options: [] });
  });

  it("ajoute une pièce justificative typée depuis la palette (un seul fichier par défaut)", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));
    fireEvent.click(screen.getByRole("button", { name: "Pièce justificative" }));
    // Le type de pièce est obligatoire : on le choisit dans le catalogue.
    fireEvent.change(screen.getByLabelText("Type de pièce justificative"), {
      target: { value: "dt-1" },
    });
    submit();
    const schema = onSubmit.mock.calls[0][0] as FormSchema;
    expect(schema.content[0]).toMatchObject({
      type: "attachment",
      maxFiles: 1,
      documentTypeId: "dt-1",
    });
  });

  it("bloque l'enregistrement d'une pièce justificative sans type, puis l'autorise une fois typée", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));
    fireEvent.click(screen.getByRole("button", { name: "Pièce justificative" }));

    // Sans type sélectionné → soumission bloquée + alerte visible.
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/chaque pièce justificative doit avoir un type/i)).toBeTruthy();

    // Une fois le type choisi → l'enregistrement passe.
    fireEvent.change(screen.getByLabelText("Type de pièce justificative"), {
      target: { value: "dt-1" },
    });
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("ajoute une section depuis la palette", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));

    fireEvent.click(screen.getByRole("button", { name: "Section" }));
    fireEvent.change(screen.getByLabelText("Titre de la section"), {
      target: { value: "Coordonnées" },
    });

    submit();

    const schema = onSubmit.mock.calls[0][0] as FormSchema;
    expect(schema.content).toHaveLength(1);
    expect(schema.content[0]).toMatchObject({ kind: "section", title: "Coordonnées", fields: [] });
  });

  it("charge un schéma existant (champ racine + section avec champs) et le ré-émet fidèlement", () => {
    const existing: FormSchema = {
      version: 1,
      content: [
        { id: "f0", key: "nom", type: "text", label: "Nom", maxLength: 40, placeholder: "Votre nom" },
        {
          id: "s1",
          kind: "section",
          title: "Coordonnées",
          fields: [{ id: "f1", key: "email", type: "email", label: "Courriel", required: true }],
        },
      ],
    };
    const { onSubmit, submit } = renderStep(makeProcedure(existing));
    submit();
    expect(onSubmit.mock.calls[0][0]).toEqual(existing);
  });
});
