// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  // « oc » n'est plus dans les langues actives : sa traduction doit survivre.
  translations: { en: { name: "Birth certificate" }, oc: { name: "Acte de naissença" } },
  requester_config: null,
  form_schema: null,
  knowledge_base: null,
  communication_config: null,
  status: "brouillon",
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

describe("DescriptifStep — traductions du libellé", () => {
  it("propose un champ par langue active, sauf le français", () => {
    renderStep();

    expect((screen.getByLabelText("Anglais") as HTMLInputElement).value).toBe("Birth certificate");
    expect((screen.getByLabelText("Breton") as HTMLInputElement).value).toBe("");
    // Le français est le champ « Libellé de la démarche », pas une traduction.
    expect(screen.queryByLabelText("Français")).toBeNull();
  });

  it("enregistre les traductions saisies et conserve celles d'une langue désactivée", () => {
    const onSubmit = renderStep();

    fireEvent.change(screen.getByLabelText("Breton"), {
      target: { value: "Testeni ganedigezh" },
    });
    fireEvent.submit(document.querySelector("form")!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].translations).toEqual({
      en: { name: "Birth certificate" },
      br: { name: "Testeni ganedigezh" },
      oc: { name: "Acte de naissença" },
    });
  });

  it("ne stocke pas une traduction effacée", () => {
    const onSubmit = renderStep();

    fireEvent.change(screen.getByLabelText("Anglais"), { target: { value: "  " } });
    fireEvent.submit(document.querySelector("form")!);

    expect(onSubmit.mock.calls[0][0].translations).toEqual({
      oc: { name: "Acte de naissença" },
    });
  });
});
