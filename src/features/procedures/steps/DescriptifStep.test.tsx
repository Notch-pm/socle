// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DescriptifStep } from "./DescriptifStep";
import type { Procedure } from "@/features/procedures/useProcedures";

// Hooks Supabase/TanStack Query court-circuités (même motif que les autres
// tests d'étapes). La collectivité a activé le français, l'anglais et le breton.
vi.mock("@/features/categories/useCategories", () => ({
  useCategoriesQuery: () => ({
    data: [{ id: "cat-1", name: "État civil", organization_id: "org-1", icon: null }],
    isLoading: false,
  }),
}));
vi.mock("@/features/procedures/useProcedures", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/procedures/useProcedures")>()),
  useNextProcedureRank: () => ({ data: 1 }),
}));
vi.mock("@/features/languages/useOrganizationLanguages", () => ({
  useOrganizationLanguages: () => ({ data: ["fr", "en", "br"] }),
}));
// Traduction automatique : le bouton est ici, son comportement est testé dans
// `TranslationFields.test.tsx`. Ce qui compte ici, c'est ce qui est ENREGISTRÉ.
vi.mock("@/features/languages/useTranslateLabels", () => ({
  useTranslateLabels: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const procedure = {
  id: "proc-1",
  name: "Acte de naissance",
  organization_id: "org-1",
  category_id: "cat-1",
  type: "externe",
  keywords: null,
  short_description: null,
  input_duration_minutes: null,
  order_index: 3,
  is_active_global: null,
  agent_description: null,
  user_description: null,
  user_communication: null,
  // « oc » n'est plus dans les langues actives : sa traduction doit survivre.
  translations: { en: { name: "Birth certificate" }, oc: { name: "Acte de naissença" } },
  requester_config: null,
  form_schema: null,
  knowledge_base: null,
  communication_config: null,
  status: "brouillon",
  access_mode: "libre",
  created_at: null,
  updated_at: null,
} as unknown as Procedure;

function renderStep() {
  const onSubmit = vi.fn();
  render(
    <DescriptifStep
      formId="f"
      organizationId="org-1"
      procedure={procedure}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

/** Les champs d'une langue vivent dans son groupe : « Libellé » y est unique. */
function cell(language: string, field: string): HTMLInputElement | HTMLTextAreaElement {
  return within(screen.getByRole("group", { name: language })).getByLabelText(field) as
    | HTMLInputElement
    | HTMLTextAreaElement;
}

describe("DescriptifStep — traductions", () => {
  it("propose le libellé ET le descriptif court par langue active, sauf le français", () => {
    renderStep();

    expect(cell("Anglais", "Libellé").value).toBe("Birth certificate");
    expect(cell("Anglais", "Descriptif court").value).toBe("");
    expect(cell("Breton", "Libellé").value).toBe("");
    // Le français, ce sont les champs du dessus, pas une traduction.
    expect(screen.queryByRole("group", { name: "Français" })).toBeNull();
  });

  it("enregistre les traductions saisies et conserve celles d'une langue désactivée", () => {
    const onSubmit = renderStep();

    fireEvent.change(cell("Breton", "Libellé"), { target: { value: "Testeni ganedigezh" } });
    fireEvent.change(cell("Anglais", "Descriptif court"), {
      target: { value: "To get a copy of your birth certificate." },
    });
    fireEvent.submit(document.querySelector("form")!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].translations).toEqual({
      en: {
        name: "Birth certificate",
        short_description: "To get a copy of your birth certificate.",
      },
      br: { name: "Testeni ganedigezh" },
      oc: { name: "Acte de naissença" },
    });
  });

  it("ne stocke pas une traduction effacée", () => {
    const onSubmit = renderStep();

    fireEvent.change(cell("Anglais", "Libellé"), { target: { value: "  " } });
    fireEvent.submit(document.querySelector("form")!);

    expect(onSubmit.mock.calls[0][0].translations).toEqual({
      oc: { name: "Acte de naissença" },
    });
  });
});

describe("DescriptifStep — accès libre ou usagers authentifiés", () => {
  it("relit l'accès enregistré et le renvoie tel quel si on n'y touche pas", () => {
    const onSubmit = renderStep();

    const select = screen.getByLabelText(/Accès/) as HTMLSelectElement;
    expect(select.value).toBe("libre");
    fireEvent.submit(document.querySelector("form")!);
    expect(onSubmit.mock.calls[0][0].access_mode).toBe("libre");
  });

  it("enregistre la restriction choisie par l'agent", () => {
    const onSubmit = renderStep();

    fireEvent.change(screen.getByLabelText(/Accès/), { target: { value: "authentifie" } });
    fireEvent.submit(document.querySelector("form")!);

    expect(onSubmit.mock.calls[0][0].access_mode).toBe("authentifie");
  });

  it("une colonne jamais réglée se lit « accès libre », jamais un champ vide", () => {
    // Le défaut inverse fermerait un catalogue que personne n'a déclaré fermé.
    const onSubmit = vi.fn();
    render(
      <DescriptifStep
        formId="f2"
        organizationId="org-1"
        procedure={{ ...procedure, access_mode: null } as unknown as Procedure}
        onSubmit={onSubmit}
      />,
    );
    expect((screen.getByLabelText(/Accès/) as HTMLSelectElement).value).toBe("libre");
  });
});
