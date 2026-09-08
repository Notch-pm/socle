// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CategoriesManager } from "./CategoriesManager";

const h = vi.hoisted(() => ({
  query: vi.fn(),
  categories: [] as Record<string, unknown>[],
  create: vi.fn(),
}));

vi.mock("@/features/categories/useCategories", () => ({
  useCategoriesQuery: (organizationId?: string) => {
    h.query(organizationId);
    return { data: h.categories, isLoading: false, isError: false };
  },
  useCreateCategory: () => ({ mutate: h.create, isPending: false }),
  useUpdateCategory: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Le dialogue a sa propre logique (langues, organisations) ; ici on vérifie
// seulement ce que le gestionnaire lui transmet.
vi.mock("@/features/categories/CategoryFormDialog", () => ({
  CategoryFormDialog: ({ open, fixedOrganizationId }: { open: boolean; fixedOrganizationId?: string }) =>
    open ? <div data-testid="dialog">{fixedOrganizationId ?? "libre"}</div> : null,
}));

vi.mock("@/features/languages/TranslatedIn", () => ({ TranslatedIn: () => null }));

beforeEach(() => {
  h.query.mockReset();
  h.categories = [];
  h.create.mockReset();
});

describe("CategoriesManager", () => {
  it("borne la liste et verrouille le dialogue sur l'organisation fournie", () => {
    render(<CategoriesManager organizationId="org-1" />);
    expect(h.query).toHaveBeenCalledWith("org-1");
    fireEvent.click(screen.getByRole("button", { name: /Nouvelle catégorie/ }));
    expect(screen.getByTestId("dialog").textContent).toBe("org-1");
  });

  it("laisse le choix de l'organisation quand aucune n'est fournie", () => {
    render(<CategoriesManager />);
    expect(h.query).toHaveBeenCalledWith(undefined);
    fireEvent.click(screen.getByRole("button", { name: /Nouvelle catégorie/ }));
    expect(screen.getByTestId("dialog").textContent).toBe("libre");
  });

  it("dit pourquoi une liste vide compte", () => {
    // Une démarche exige une catégorie : « aucune » n'est pas neutre.
    render(<CategoriesManager organizationId="org-1" />);
    expect(screen.getByText(/ne peut pas être créée sans catégorie/)).toBeTruthy();
  });

  it("liste les catégories", () => {
    h.categories = [
      { id: "c1", name: "État civil", icon: null, organization_id: "org-1", translations: {} },
      { id: "c2", name: "Urbanisme", icon: null, organization_id: "org-1", translations: {} },
    ];
    render(<CategoriesManager organizationId="org-1" />);
    expect(screen.getByText("État civil")).toBeTruthy();
    expect(screen.getByText("Urbanisme")).toBeTruthy();
  });
});
