// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserInfoSection, USER_INFO_INTERNAL_SERVICE_MESSAGE } from "./UserInfoSection";
import { defaultUserInfo, type OrganizationUserInfo } from "./userInfo";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  requested: [] as Array<string | undefined>,
  stored: null as { info: OrganizationUserInfo; updatedAt: string | null } | null,
}));

vi.mock("@/features/organizations/useUserInfo", () => ({
  useUserInfo: (orgId: string | undefined) => {
    h.requested.push(orgId);
    return { data: orgId ? h.stored : undefined, isLoading: false };
  },
  useSaveUserInfo: () => ({
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
  h.stored = { info: defaultUserInfo(), updatedAt: null };
});

describe("UserInfoSection", () => {
  it("s'édite aussi sur une sous-organisation — chaque annexe a ses horaires", () => {
    render(<UserInfoSection organization={org({ id: "org-annexe", parent_id: "org-racine" })} />);

    expect(h.requested).toContain("org-annexe");
    expect(screen.getByLabelText("Horaires d'accueil")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
  });

  it("dit que tout est public, dès l'enregistrement", () => {
    render(<UserInfoSection organization={org()} />);
    expect(screen.getByText(/Tout ce qui est écrit ici est public, dès l'enregistrement/)).toBeTruthy();
    expect(screen.queryByText(USER_INFO_INTERNAL_SERVICE_MESSAGE)).toBeNull();
  });

  it("prévient qu'un service interne n'est pas publié", () => {
    render(<UserInfoSection organization={org({ is_internal_service: true, parent_id: "org-racine" })} />);
    expect(screen.getByText(USER_INFO_INTERNAL_SERVICE_MESSAGE)).toBeTruthy();
  });

  it("amorce le formulaire avec ce qui est enregistré, et dit de quand il date", () => {
    h.stored = {
      info: { ...defaultUserInfo(), openingHours: "Lundi : 9 h – 12 h" },
      updatedAt: "2026-09-24T08:00:00Z",
    };
    render(<UserInfoSection organization={org()} />);

    expect((screen.getByLabelText("Horaires d'accueil") as HTMLTextAreaElement).value).toBe(
      "Lundi : 9 h – 12 h",
    );
    expect(screen.getByText(/Dernière mise à jour le 24 septembre 2026/)).toBeTruthy();
  });

  it("enregistre descriptif, horaires et FAQ d'un geste", () => {
    render(<UserInfoSection organization={org()} />);

    fireEvent.change(screen.getByLabelText("Descriptif"), { target: { value: "La mairie." } });
    fireEvent.change(screen.getByLabelText("Horaires d'accueil"), {
      target: { value: "Lundi au vendredi : 8 h 30 – 17 h" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Ajouter une question/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(h.mutate).toHaveBeenCalledTimes(1);
    const saved = h.mutate.mock.calls[0][0] as OrganizationUserInfo;
    expect(saved.description).toBe("La mairie.");
    expect(saved.openingHours).toBe("Lundi au vendredi : 8 h 30 – 17 h");
    expect(saved.faq).toHaveLength(1);
  });
});
