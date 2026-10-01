// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttributionsSection } from "./AttributionsSection";
import { MAX_ATTRIBUTIONS_LENGTH } from "./attributions";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  requested: [] as Array<string | undefined>,
  stored: null as { attributions: string; updatedAt: string | null } | null,
}));

vi.mock("@/features/organizations/useAttributions", () => ({
  useAttributions: (orgId: string | undefined) => {
    h.requested.push(orgId);
    return { data: orgId ? h.stored : undefined, isLoading: false };
  },
  useSaveAttributions: () => ({
    mutate: h.mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
}));

function org(over: Partial<Organization> = {}): Organization {
  return { id: "org-racine", name: "Mairie", parent_id: null, is_internal_service: false, ...over } as Organization;
}

beforeEach(() => {
  h.mutate.mockClear();
  h.requested = [];
  h.stored = { attributions: "", updatedAt: null };
});

describe("AttributionsSection", () => {
  it("⚠️ s'édite sur un service interne — ce sont souvent eux qui instruisent", () => {
    render(
      <AttributionsSection
        organization={org({ id: "org-st", parent_id: "org-racine", is_internal_service: true })}
      />,
    );

    expect(h.requested).toContain("org-st");
    expect(screen.getByLabelText("Attributions")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
  });

  it("dit que le texte est interne, jamais affiché sur le site de démarches", () => {
    render(<AttributionsSection organization={org()} />);
    expect(screen.getByText(/jamais affiché sur le site de démarches/)).toBeTruthy();
  });

  it("borne la saisie à 2 000 caractères et compte ce qui est tapé", () => {
    render(<AttributionsSection organization={org()} />);
    const field = screen.getByLabelText("Attributions") as HTMLTextAreaElement;

    expect(field.maxLength).toBe(MAX_ATTRIBUTIONS_LENGTH);
    expect(screen.getByText("0 / 2000 caractères")).toBeTruthy();

    fireEvent.change(field, { target: { value: "Voirie" } });
    expect(screen.getByText("6 / 2000 caractères")).toBeTruthy();
  });

  it("enregistre le texte saisi", () => {
    render(<AttributionsSection organization={org()} />);
    fireEvent.change(screen.getByLabelText("Attributions"), {
      target: { value: "Traite : état civil.\nNe traite pas : urbanisme." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0][0]).toBe("Traite : état civil.\nNe traite pas : urbanisme.");
  });

  it("amorce le formulaire avec ce qui est enregistré, et dit de quand il date", () => {
    h.stored = { attributions: "Voirie, éclairage public.", updatedAt: "2026-10-01T08:00:00Z" };
    render(<AttributionsSection organization={org()} />);

    expect((screen.getByLabelText("Attributions") as HTMLTextAreaElement).value).toBe("Voirie, éclairage public.");
    expect(screen.getByText(/Dernière mise à jour le 1 octobre 2026/)).toBeTruthy();
  });
});
