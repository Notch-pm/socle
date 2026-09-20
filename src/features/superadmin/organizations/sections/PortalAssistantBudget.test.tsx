// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PortalAssistantBudget } from "./PortalAssistantBudget";

const h = vi.hoisted(() => ({
  quota: { configuredLimit: null as number | null, isActive: false, used: 0, reserved: 0 },
  set: vi.fn(),
}));

vi.mock("@/features/ai-usage/useConsumerQuota", () => ({
  useConsumerQuota: () => ({ data: h.quota, isLoading: false }),
  useSetConsumerQuota: () => ({ mutateAsync: h.set, isPending: false }),
}));

beforeEach(() => {
  h.quota = { configuredLimit: null, isActive: false, used: 0, reserved: 0 };
  h.set.mockReset();
  h.set.mockResolvedValue(undefined);
});

const input = () => screen.getByLabelText("Borne mensuelle (jetons)") as HTMLInputElement;

describe("PortalAssistantBudget", () => {
  it("⚠️ assistant ouvert SANS borne : l'écran dit ce que cela risque", () => {
    render(<PortalAssistantBudget organizationId="org-1" assistantEnabled />);
    expect(screen.getByText(/peut consommer tout le crédit IA de la collectivité/)).toBeTruthy();
  });

  it("assistant fermé sans borne : invite à la poser avant l'ouverture", () => {
    render(<PortalAssistantBudget organizationId="org-1" assistantEnabled={false} />);
    expect(screen.getByText(/À poser avant d'ouvrir l'assistant au public/)).toBeTruthy();
  });

  it("pose la borne pour l'application nora — espaces et séparateurs tolérés", async () => {
    render(<PortalAssistantBudget organizationId="org-1" assistantEnabled />);
    fireEvent.change(input(), { target: { value: "500 000" } });
    fireEvent.click(screen.getByRole("button", { name: "Poser la borne" }));
    await waitFor(() =>
      expect(h.set).toHaveBeenCalledWith({
        organizationId: "org-1",
        consumer: "nora",
        limitTokens: 500000,
        isActive: true,
      }),
    );
  });

  it("refuse une borne nulle ou illisible, sans rien envoyer", () => {
    render(<PortalAssistantBudget organizationId="org-1" assistantEnabled />);
    fireEvent.change(input(), { target: { value: "zéro" } });
    fireEvent.click(screen.getByRole("button", { name: "Poser la borne" }));
    expect(screen.getByRole("alert").textContent).toMatch(/strictement positif/);
    expect(h.set).not.toHaveBeenCalled();
  });

  it("dit ce qui est engagé ce mois-ci sous une borne active", () => {
    h.quota = { configuredLimit: 500000, isActive: true, used: 40000, reserved: 2000 };
    render(<PortalAssistantBudget organizationId="org-1" assistantEnabled />);
    expect(screen.getByText(/Bornée à 500.000 jetons par mois — 42.000 engagés/)).toBeTruthy();
    expect(input().value).toBe("500000");
  });

  it("⚠️ lever la borne CONSERVE sa valeur — la rétablir est un geste, pas une ressaisie", async () => {
    h.quota = { configuredLimit: 500000, isActive: true, used: 0, reserved: 0 };
    render(<PortalAssistantBudget organizationId="org-1" assistantEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Lever la borne" }));
    await waitFor(() =>
      expect(h.set).toHaveBeenCalledWith(
        expect.objectContaining({ limitTokens: 500000, isActive: false }),
      ),
    );
  });

  it("propose de rétablir une borne levée", () => {
    h.quota = { configuredLimit: 500000, isActive: false, used: 0, reserved: 0 };
    render(<PortalAssistantBudget organizationId="org-1" assistantEnabled />);
    expect(screen.getByRole("button", { name: "Rétablir la borne" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lever la borne" })).toBeNull();
  });

  it("affiche tel quel le refus du serveur", async () => {
    h.set.mockRejectedValue(new Error("Le plafond d'utilisation IA est réservé au super administrateur."));
    render(<PortalAssistantBudget organizationId="org-1" assistantEnabled />);
    fireEvent.change(input(), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Poser la borne" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/réservé au super administrateur/));
  });
});
