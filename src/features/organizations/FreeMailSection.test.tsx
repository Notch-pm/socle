// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FreeMailSection } from "./FreeMailSection";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

const h = vi.hoisted(() => ({
  settings: { enabled: false, title: null as string | null, updatedAt: null as string | null },
  applications: ["nora", "clara"] as string[],
  mutate: vi.fn(),
}));

vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ session: null, profile: { id: "user-1" }, loading: false, signOut: vi.fn() }),
}));

vi.mock("@/features/organizations/useFreeMail", () => ({
  FREE_MAIL_CLOSED: { enabled: false, title: null, updatedAt: null },
  useFreeMailSettings: () => ({ data: h.settings, isLoading: false }),
  useRootApplications: () => ({ data: h.applications, isLoading: false }),
  useSaveFreeMail: () => ({
    mutate: h.mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const SWITCH = "Permettre aux usagers d'envoyer un courrier libre à cet organisme depuis le site";
const ORG = { id: "org-1", name: "Mairie annexe", parent_id: "racine", is_internal_service: false } as Organization;

beforeEach(() => {
  h.settings = { enabled: false, title: null, updatedAt: null };
  h.applications = ["nora", "clara"];
  h.mutate.mockReset();
});

describe("FreeMailSection", () => {
  it("aucune ligne = fermé, titre vide avec le libellé par défaut en placeholder", () => {
    render(<FreeMailSection organization={ORG} />);
    expect(screen.getByLabelText(SWITCH).getAttribute("aria-checked")).toBe("false");
    const title = screen.getByLabelText("Titre") as HTMLInputElement;
    expect(title.value).toBe("");
    expect(title.placeholder).toBe("Envoyer un courrier libre");
    expect(title.maxLength).toBe(80);
  });

  it("ouvre d'un geste en gardant le titre ENREGISTRÉ", () => {
    h.settings = { enabled: false, title: "Écrire à la mairie", updatedAt: null };
    render(<FreeMailSection organization={ORG} />);
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Brouillon non enregistré" } });
    fireEvent.click(screen.getByLabelText(SWITCH));
    expect(h.mutate).toHaveBeenCalledWith({ enabled: true, title: "Écrire à la mairie", updatedBy: "user-1" });
  });

  it("enregistre le titre saisi sans toucher à l'interrupteur", () => {
    h.settings = { enabled: true, title: null, updatedAt: null };
    render(<FreeMailSection organization={ORG} />);
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "  Nous écrire  " } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le titre" }));
    expect(h.mutate).toHaveBeenCalledWith({ enabled: true, title: "  Nous écrire  ", updatedBy: "user-1" });
  });

  it("⚠️ sans Clara (ou sans Nora), dit pourquoi et ne propose aucune bascule", () => {
    h.applications = ["nora"];
    render(<FreeMailSection organization={ORG} />);
    expect(screen.queryByLabelText(SWITCH)).toBeNull();
    expect(screen.getByRole("note").textContent).toContain("abonnée à Clara");
  });
});
