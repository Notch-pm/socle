// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { quotaView, splitView, type AiShare } from "@/features/ai-usage/aiQuota";
import type { AiUsage } from "@/features/ai-usage/useAiUsage";
import { AiShareDialog } from "./AiShareDialog";

const h = vi.hoisted(() => ({
  set: vi.fn(),
}));

vi.mock("@/features/ai-usage/useAiUsage", () => ({
  ASSISTANT_CONSUMER: "nora",
  useSetAiShare: () => ({ mutateAsync: h.set, isPending: false }),
}));

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

const share = (over: Partial<AiShare> = {}): AiShare => ({
  consumer: "nora",
  mode: "percent",
  configuredTokens: null,
  percent: 25,
  effectiveTokens: 500_000,
  isActive: true,
  used: 0,
  reserved: 0,
  updatedAt: null,
  ...over,
});

function usage(plafond: number | null, s: AiShare | null): AiUsage {
  return {
    organizationId: "org-1",
    period: "2026-09",
    isActive: plafond !== null,
    updatedAt: null,
    configuredLimit: plafond,
    view: quotaView({ limit: plafond, used: 0, reserved: 0 }),
    byConsumer: [],
    shares: s ? [s] : [],
    split: splitView({ plafond, share: s, totalUsed: 0, totalReserved: 0 }),
  };
}

const SWITCH = "Réserver une part à l'assistant du portail usagers";

function renderDialog(u: AiUsage) {
  const onOpenChange = vi.fn();
  render(<AiShareDialog organizationId="org-1" usage={u} open onOpenChange={onOpenChange} />);
  return onOpenChange;
}

beforeEach(() => {
  h.set.mockReset();
  h.set.mockResolvedValue(undefined);
});

describe("AiShareDialog — la répartition du plafond", () => {
  it("pose une part en pourcentage pour l'application nora, et montre l'aperçu vivant", async () => {
    const onOpenChange = renderDialog(usage(2_000_000, null));
    fireEvent.click(screen.getByRole("switch", { name: SWITCH }));
    fireEvent.change(screen.getByLabelText("Part de l'assistant (%)"), { target: { value: "25" } });
    expect(screen.getByTestId("share-preview").textContent).toMatch(/usagers 500.000 · agents 1.500.000/);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(h.set).toHaveBeenCalledWith({
        organizationId: "org-1",
        consumer: "nora",
        isActive: true,
        percent: 25,
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("pose une part en jetons — espaces et séparateurs tolérés", async () => {
    renderDialog(usage(2_000_000, null));
    fireEvent.click(screen.getByRole("switch", { name: SWITCH }));
    fireEvent.click(screen.getByRole("tab", { name: "Jetons" }));
    fireEvent.change(screen.getByLabelText("Part de l'assistant (jetons)"), { target: { value: "500 000" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(h.set).toHaveBeenCalledWith(
        expect.objectContaining({ consumer: "nora", isActive: true, tokens: 500_000 }),
      ),
    );
    expect(h.set.mock.calls[0][0]).not.toHaveProperty("percent");
  });

  // ⚠️ Le réglage gouverne l'usage, pas la donnée : couper renvoie la valeur
  // ET le mode enregistrés, avec `isActive: false`.
  it("couper l'interrupteur CONSERVE valeur et mode", async () => {
    renderDialog(usage(2_000_000, share()));
    const sw = screen.getByRole("switch", { name: SWITCH });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(h.set).toHaveBeenCalledWith({
        organizationId: "org-1",
        consumer: "nora",
        isActive: false,
        percent: 25,
      }),
    );
  });

  it("sans part enregistrée, couper n'envoie rien", async () => {
    const onOpenChange = renderDialog(usage(2_000_000, null));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(h.set).not.toHaveBeenCalled();
  });

  it("refuse une saisie illisible ou un pourcentage hors 1..99, sans rien envoyer", () => {
    renderDialog(usage(2_000_000, null));
    fireEvent.click(screen.getByRole("switch", { name: SWITCH }));
    fireEvent.change(screen.getByLabelText("Part de l'assistant (%)"), { target: { value: "cent" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByRole("alert").textContent).toMatch(/entre 1 et 99/);
    fireEvent.change(screen.getByLabelText("Part de l'assistant (%)"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByRole("alert").textContent).toMatch(/entre 1 et 99/);
    expect(h.set).not.toHaveBeenCalled();
  });

  // Les cas limites sont DITS, pas interdits : la base les rend inoffensifs.
  it("dit qu'un pourcentage sans plafond est sans effet, et qu'une part en jetons peut tout prendre", () => {
    renderDialog(usage(null, null));
    fireEvent.click(screen.getByRole("switch", { name: SWITCH }));
    expect(screen.getByTestId("share-preview").textContent).toMatch(/sans effet/);

    fireEvent.click(screen.getByRole("tab", { name: "Jetons" }));
    fireEvent.change(screen.getByLabelText("Part de l'assistant (jetons)"), { target: { value: "300000" } });
    expect(screen.getByTestId("share-preview").textContent).toMatch(/agents resteraient illimités/);
  });

  it("avertit quand une part en jetons prend tout le plafond", () => {
    renderDialog(usage(2_000_000, null));
    fireEvent.click(screen.getByRole("switch", { name: SWITCH }));
    fireEvent.click(screen.getByRole("tab", { name: "Jetons" }));
    fireEvent.change(screen.getByLabelText("Part de l'assistant (jetons)"), { target: { value: "2000000" } });
    expect(screen.getByText(/il ne resterait rien aux agents/)).toBeTruthy();
  });

  it("affiche tel quel le refus du serveur", async () => {
    h.set.mockRejectedValue(new Error("Le plafond d'utilisation IA est réservé au super administrateur."));
    renderDialog(usage(2_000_000, null));
    fireEvent.click(screen.getByRole("switch", { name: SWITCH }));
    fireEvent.change(screen.getByLabelText("Part de l'assistant (%)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/réservé au super administrateur/));
  });
});
