// @vitest-environment jsdom
//
// Régression : une démarche dont la catégorie choisie n'est PAS (encore, ou
// plus) dans la liste chargée — requête `useCategoriesQuery` en vol au premier
// rendu, catégorie supprimée depuis — laissait le <select required> sans
// option correspondante. Le navigateur bloquait alors SILENCIEUSEMENT le clic
// sur « Enregistrer et continuer » (validation HTML5 native, aucune erreur
// affichée) : le stepper ne semblait pas avancer. Voir `DescriptifStep.tsx`
// (`currentCategoryMissing`).
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { DescriptifStep } from "./DescriptifStep";
import type { Procedure } from "@/features/procedures/useProcedures";

// La catégorie de la démarche n'est pas dans le catalogue chargé (org sans
// cette catégorie, requête encore en vol, ou catégorie supprimée depuis).
vi.mock("@/features/categories/useCategories", () => ({
  useCategoriesQuery: () => ({ data: [], isLoading: true }),
}));
vi.mock("@/features/procedures/useProcedures", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/procedures/useProcedures")>()),
  useNextProcedureRank: () => ({ data: 1 }),
}));
vi.mock("@/features/languages/useOrganizationLanguages", () => ({
  useOrganizationLanguages: () => ({ data: ["fr"] }),
}));
vi.mock("@/features/languages/useTranslateLabels", () => ({
  useTranslateLabels: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

const procedure = {
  id: "proc-1",
  name: "Acte de naissance",
  organization_id: "org-1",
  category_id: "cat-en-vol",
  type: "externe",
  keywords: null,
  short_description: null,
  input_duration_minutes: null,
  order_index: 3,
  is_active_global: null,
  agent_description: null,
  user_description: null,
  user_communication: null,
  translations: null,
  requester_config: null,
  form_schema: null,
  knowledge_base: null,
  communication_config: null,
  status: "brouillon",
  created_at: null,
  updated_at: null,
} as unknown as Procedure;

describe("DescriptifStep — catégorie pas encore dans la liste chargée", () => {
  it("le <select required> reste valide (pas de blocage silencieux du submit)", () => {
    render(
      <DescriptifStep formId="f" organizationId="org-1" procedure={procedure} onSubmit={vi.fn()} />,
    );

    const select = document.getElementById("proc-category") as HTMLSelectElement;
    expect(select.value).toBe("cat-en-vol");
    expect(select.checkValidity()).toBe(true);
  });
});
