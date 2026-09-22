// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { splitView, type AiShare } from "@/features/ai-usage/aiQuota";
import { PortalAssistantBudget } from "./PortalAssistantBudget";

const h = vi.hoisted(() => ({
  usage: vi.fn(),
}));

vi.mock("@/features/ai-usage/useAiUsage", () => ({
  useAiUsage: () => h.usage(),
}));

const share = (over: Partial<AiShare> = {}): AiShare => ({
  consumer: "nora",
  mode: "tokens",
  configuredTokens: 500_000,
  percent: null,
  effectiveTokens: 500_000,
  isActive: true,
  used: 40_000,
  reserved: 2_000,
  updatedAt: null,
  ...over,
});

function usageWith(plafond: number | null, s: AiShare | null) {
  return {
    data: { split: splitView({ plafond, share: s, totalUsed: 100_000, totalReserved: 2_000 }) },
    isLoading: false,
  };
}

function renderBudget(assistantEnabled: boolean) {
  return render(
    <MemoryRouter>
      <PortalAssistantBudget organizationId="org-1" assistantEnabled={assistantEnabled} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.usage.mockReset();
  h.usage.mockReturnValue(usageWith(2_000_000, null));
});

describe("PortalAssistantBudget — le résumé de la part, à côté de l'interrupteur", () => {
  it("⚠️ assistant ouvert SANS part : l'écran dit ce que cela risque", () => {
    renderBudget(true);
    expect(screen.getByText(/peut consommer tout le crédit IA de la collectivité/)).toBeTruthy();
  });

  it("assistant fermé sans part : invite à la poser avant l'ouverture", () => {
    renderBudget(false);
    expect(screen.getByText(/À poser avant d'ouvrir l'assistant au public/)).toBeTruthy();
  });

  it("dit la part en jetons, sa valeur effective et l'engagé du mois", () => {
    h.usage.mockReturnValue(usageWith(2_000_000, share()));
    renderBudget(true);
    expect(
      screen.getByText(/Part réservée : 500.000 jetons, soit 500.000 jetons par mois — 42.000 engagés/),
    ).toBeTruthy();
  });

  it("dit la part en pourcentage, résolue contre le plafond", () => {
    h.usage.mockReturnValue(usageWith(
      2_000_000,
      share({ mode: "percent", configuredTokens: null, percent: 25, effectiveTokens: 500_000 }),
    ));
    renderBudget(true);
    expect(screen.getByText(/25 % du plafond, soit 500.000 jetons par mois/)).toBeTruthy();
  });

  // Le réglage gouverne l'usage, pas la donnée : une part levée reste lisible.
  it("une part levée dit que sa valeur est conservée, et avertit si l'assistant est ouvert", () => {
    h.usage.mockReturnValue(usageWith(2_000_000, share({ isActive: false, effectiveTokens: null })));
    renderBudget(true);
    expect(screen.getByText(/Part levée — sa valeur \(500.000 jetons\) est conservée/)).toBeTruthy();
    expect(screen.getByText(/peut consommer tout le crédit IA/)).toBeTruthy();
  });

  // Un pourcentage sans plafond n'a rien à multiplier : il ne borne personne.
  it("un pourcentage sans plafond est dit SANS EFFET", () => {
    h.usage.mockReturnValue(usageWith(
      null,
      share({ mode: "percent", configuredTokens: null, percent: 25, effectiveTokens: null }),
    ));
    renderBudget(true);
    expect(screen.getByText(/aucun plafond n'est posé : elle est sans effet/)).toBeTruthy();
  });

  // ⚠️ Le seul écran qui écrit est la section IA : ici, un lien, jamais un bouton.
  it("renvoie vers la section IA pour régler la part, sans aucun chemin vers l'écriture", () => {
    renderBudget(true);
    expect(screen.getByRole("link", { name: "Régler la part" }).getAttribute("href")).toBe("/?section=ia");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
