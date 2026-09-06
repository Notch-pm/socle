// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguagesSection, LANGUAGES_ROOT_ONLY_MESSAGE } from "./LanguagesSection";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

const h = vi.hoisted(() => ({ mutate: vi.fn(), enabled: ["fr", "en"] }));

vi.mock("@/features/languages/useOrganizationLanguages", () => ({
  useOrganizationLanguages: (orgId: string | undefined) => ({
    // Le composant ne demande rien pour une sous-organisation.
    data: orgId ? h.enabled : undefined,
    isLoading: false,
  }),
  useSaveOrganizationLanguages: () => ({
    mutate: h.mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
}));

function org(over: Partial<Organization> = {}): Organization {
  return {
    id: "org-racine",
    name: "ACCM",
    parent_id: null,
    address: null,
    created_at: null,
    email: null,
    email_sender_name: null,
    email_sender_override: false,
    enabled_languages: ["fr", "en"],
    logo_url: null,
    logo_white_url: null,
    primary_color: null,
    secondary_color: null,
    branding_inherit_parent: false,
    metadata: null,
    phone: null,
    slug: null,
    status: "active",
    type: null,
    ...over,
  } as Organization;
}

beforeEach(() => h.mutate.mockClear());

describe("LanguagesSection", () => {
  it("renvoie une sous-organisation vers son organisation principale", () => {
    render(<LanguagesSection organization={org({ id: "org-fille", parent_id: "org-racine" })} />);

    expect(screen.getByText(LANGUAGES_ROOT_ONLY_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });

  it("coche le français et interdit de le retirer", () => {
    render(<LanguagesSection organization={org()} />);

    const francais = screen.getByLabelText(/Français/) as HTMLInputElement;
    expect(francais.checked).toBe(true);
    expect(francais.disabled).toBe(true);
  });

  it("enregistre la sélection, français en tête et dans l'ordre du catalogue", () => {
    render(<LanguagesSection organization={org()} />);

    fireEvent.click(screen.getByLabelText(/Breton/));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(h.mutate).toHaveBeenCalledWith(["fr", "en", "br"]);
  });

  it("retire une langue décochée", () => {
    render(<LanguagesSection organization={org()} />);

    fireEvent.click(screen.getByLabelText(/Anglais/));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(h.mutate).toHaveBeenCalledWith(["fr"]);
  });

  it("filtre le catalogue sur la recherche", () => {
    render(<LanguagesSection organization={org()} />);

    fireEvent.change(screen.getByLabelText("Rechercher une langue"), {
      target: { value: "breton" },
    });

    expect(screen.getByLabelText(/Breton/)).toBeTruthy();
    expect(screen.queryByLabelText(/Corse/)).toBeNull();
  });
});
