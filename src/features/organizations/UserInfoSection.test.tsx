// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserInfoSection } from "./UserInfoSection";
import { defaultUserInfo, hasUserInfoTab, type OrganizationUserInfo } from "./userInfo";
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

// Le Switch Radix mesure son pouce : jsdom n'a pas de ResizeObserver.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

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
    expect(screen.getByLabelText("Lundi — ouvert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeTruthy();
  });

  it("dit que tout est public, dès l'enregistrement", () => {
    render(<UserInfoSection organization={org()} />);
    expect(screen.getByText(/Tout ce qui est écrit ici est public, dès l'enregistrement/)).toBeTruthy();
  });

  it("⚠️ pas d'onglet sur un service interne : le portail ne l'affiche pas", () => {
    expect(hasUserInfoTab(org({ is_internal_service: true, parent_id: "org-racine" }))).toBe(false);
    expect(hasUserInfoTab(org())).toBe(true);
  });

  it("amorce le formulaire avec ce qui est enregistré, et dit de quand il date", () => {
    h.stored = {
      info: {
        ...defaultUserInfo(),
        openingHours: [
          { day: "monday", morningOpen: "09:00", morningClose: null, afternoonOpen: null, afternoonClose: "12:00" },
        ],
      },
      updatedAt: "2026-09-24T08:00:00Z",
    };
    render(<UserInfoSection organization={org()} />);

    expect((screen.getByLabelText("Lundi — ouverture") as HTMLInputElement).value).toBe("09:00");
    expect((screen.getByLabelText("Lundi — fermeture") as HTMLInputElement).value).toBe("12:00");
    // Un jour absent est fermé : pas de champ d'heure.
    expect(screen.queryByLabelText("Mardi — ouverture")).toBeNull();
    expect(screen.getByText(/Dernière mise à jour le 24 septembre 2026/)).toBeTruthy();
  });

  it("enregistre descriptif, horaires et FAQ d'un geste", () => {
    render(<UserInfoSection organization={org()} />);

    fireEvent.change(screen.getByLabelText("Descriptif"), { target: { value: "La mairie." } });
    fireEvent.click(screen.getByLabelText("Lundi — ouvert"));
    const set = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    set("Lundi — ouverture", "08:30");
    set("Lundi — fin de matinée", "12:00");
    set("Lundi — début d'après-midi", "13:30");
    set("Lundi — fermeture", "17:00");
    fireEvent.click(screen.getByLabelText("Mardi — ouvert"));
    fireEvent.change(screen.getByLabelText("Remarques sur les horaires"), {
      target: { value: "Fermé les jours fériés." },
    });
    // Recopier le lundi sur les autres jours ouverts.
    fireEvent.click(screen.getByRole("button", { name: /Recopier le lundi/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ajouter une question/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(h.mutate).toHaveBeenCalledTimes(1);
    const saved = h.mutate.mock.calls[0][0] as OrganizationUserInfo;
    expect(saved.description).toBe("La mairie.");
    const monday = {
      day: "monday",
      morningOpen: "08:30",
      morningClose: "12:00",
      afternoonOpen: "13:30",
      afternoonClose: "17:00",
    };
    expect(saved.openingHours).toEqual([monday, { ...monday, day: "tuesday" }]);
    expect(saved.openingHoursNotes).toBe("Fermé les jours fériés.");
    expect(saved.faq).toHaveLength(1);
  });

  it("refuse d'enregistrer un jour ouvert sans heure de fermeture, et dit lequel", () => {
    render(<UserInfoSection organization={org()} />);

    fireEvent.click(screen.getByLabelText("Mercredi — ouvert"));
    fireEvent.change(screen.getByLabelText("Mercredi — ouverture"), { target: { value: "09:00" } });
    // Pas d'erreur avant la première tentative.
    expect(screen.queryByText(/fermeture de l'après-midi est obligatoire/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("L'heure de fermeture de l'après-midi est obligatoire.")).toBeTruthy();
    expect(screen.getByText(/corrigez les jours signalés/)).toBeTruthy();
  });
});
