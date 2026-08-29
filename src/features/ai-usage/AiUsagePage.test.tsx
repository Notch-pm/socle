// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiUsagePage } from "./AiUsagePage";
import { AiUsageOverview } from "./AiUsageOverview";
import { quotaView } from "./aiQuota";

// Les hooks sont court-circuités : ce qui est vérifié ici, c'est ce que l'écran
// MONTRE et ce qu'il n'offre pas — pas la lecture Supabase, déjà gardée par le
// RLS et par ses propres tests SQL.
const h = vi.hoisted(() => ({
  roots: vi.fn(),
  usage: vi.fn(),
  events: vi.fn(),
}));

vi.mock("@/features/ai-usage/useAdminRootOrganizations", () => ({
  useAdminRootOrganizations: () => h.roots(),
}));

vi.mock("@/features/ai-usage/useAiUsage", () => ({
  useAiUsage: (...args: unknown[]) => h.usage(...args),
  useAiUsageEvents: (...args: unknown[]) => h.events(...args),
}));

const usageData = (limit: number | null, used: number, reserved = 0) => ({
  data: {
    organizationId: "org-1",
    period: "2026-08",
    isActive: limit !== null,
    updatedAt: limit === null ? null : "2026-08-29T10:00:00Z",
    view: quotaView({ limit, used, reserved }),
    byConsumer: [{ consumer: "iris", feature: "assistant-instruction", calls: 3, tokens: 42_000 }],
  },
  isLoading: false,
  isError: false,
});

beforeEach(() => {
  h.roots.mockReset();
  h.usage.mockReset();
  h.events.mockReset();
  h.roots.mockReturnValue({
    data: [{ id: "org-1", name: "ACCM" }],
    isLoading: false,
    isError: false,
  });
  h.usage.mockReturnValue(usageData(2_000_000, 500_000));
  h.events.mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe("AiUsagePage — consultation par l'administrateur", () => {
  it("affiche la jauge et la ventilation par application de sa collectivité", () => {
    render(<AiUsagePage />);

    expect(h.usage).toHaveBeenCalledWith("org-1");
    expect(screen.getByText("Consommation IA")).toBeTruthy();
    const gauge = screen.getByRole("progressbar", { name: "Consommation de jetons IA" });
    // 500 000 engagés sur 2 000 000 → 25 %.
    expect(gauge.getAttribute("aria-valuenow")).toBe("25");
    expect(screen.getByText("500 000 / 2 000 000")).toBeTruthy();
    expect(screen.getByText("iris")).toBeTruthy();
  });

  it("n'offre AUCUN chemin vers l'écriture : le plafond se négocie, il ne se sert pas", () => {
    render(<AiUsagePage />);

    expect(screen.queryByRole("button", { name: /Modifier/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Retirer le plafond/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Pas un seul bouton sur la page : c'est la définition de « consultation ».
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("masque le sélecteur quand l'utilisateur n'administre qu'une organisation", () => {
    render(<AiUsagePage />);
    expect(screen.queryByLabelText("Organisation")).toBeNull();
  });

  it("propose un sélecteur au-delà d'une organisation, et interroge celle qu'on choisit", () => {
    h.roots.mockReturnValue({
      data: [{ id: "org-1", name: "ACCM" }, { id: "org-2", name: "Ville de Test" }],
      isLoading: false,
      isError: false,
    });
    render(<AiUsagePage />);

    const select = screen.getByLabelText("Organisation");
    fireEvent.change(select, { target: { value: "org-2" } });
    expect(h.usage).toHaveBeenLastCalledWith("org-2");
  });

  it("dit franchement que la page n'est pas la sienne quand aucune racine n'est administrée", () => {
    h.roots.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<AiUsagePage />);

    expect(
      screen.getByText("Cette page est réservée aux administrateurs d'une organisation principale."),
    ).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("annonce l'illimité sans plafond configuré, plutôt qu'une jauge à zéro", () => {
    h.usage.mockReturnValue(usageData(null, 120_000));
    render(<AiUsagePage />);

    expect(screen.getByText(/Aucun plafond configuré/)).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("AiUsageOverview — la commande de réglage est un apport de l'appelant", () => {
  it("rend l'action quand l'écran qui écrit la fournit", () => {
    render(
      <AiUsageOverview organizationId="org-1" action={<button type="button">Modifier</button>} />,
    );
    expect(screen.getByRole("button", { name: "Modifier" })).toBeTruthy();
  });
});
