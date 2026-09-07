// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TranslationFields } from "./TranslationFields";
import type { TranslationInput } from "@/features/languages/translations";
import type {
  TranslateLabelsInput,
  TranslateLabelsResult,
} from "@/features/languages/useTranslateLabels";

/**
 * Ce que cet écran doit garantir, et que le serveur ne peut pas garantir à sa
 * place : la traduction automatique **complète**, elle n'écrase pas. Un agent
 * qui a relu et corrigé une traduction ne doit pas la voir disparaître parce
 * qu'il a cliqué sur un bouton dont le libellé ne promettait rien de tel.
 */

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as Error | null,
}));

vi.mock("@/features/languages/useTranslateLabels", () => ({
  useTranslateLabels: () => ({
    mutate: h.mutate,
    isPending: h.isPending,
    isError: h.isError,
    error: h.error,
  }),
}));

// Primitives Radix (AlertDialog) : polyfills absents de jsdom.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/**
 * Les vrais appelants posent leur état par fonction : l'enveloppe fait pareil,
 * sans quoi le test validerait une composition que la production ne fait pas.
 */
function Harness({
  initial = {},
  label = "Demande d'acte de naissance",
  enabled = ["fr", "en", "es"],
}: {
  initial?: TranslationInput;
  label?: string;
  enabled?: string[];
}) {
  const [value, setValue] = React.useState<TranslationInput>(initial);
  return (
    <TranslationFields
      enabled={enabled}
      value={value}
      onChange={(code, name) => setValue((current) => ({ ...current, [code]: name }))}
      idPrefix="t"
      organizationId="org-1"
      sourceLabel={label}
      kind="procedure"
    />
  );
}

/** Déclenche le `onSuccess` du dernier `mutate` avec la réponse donnée. */
function answerWith(translations: Record<string, string>, missing: string[] = []) {
  const [, options] = h.mutate.mock.calls.at(-1) as [
    TranslateLabelsInput,
    { onSuccess: (r: TranslateLabelsResult) => void },
  ];
  // Le succès arrive hors du cycle React : `act` fait passer la mise à jour
  // d'état avant les assertions.
  act(() => options.onSuccess({ translations, missing }));
}

function lastInput(): TranslateLabelsInput {
  return (h.mutate.mock.calls.at(-1) as [TranslateLabelsInput])[0];
}

const translateButton = () => screen.getByRole("button", { name: /Traduire automatiquement/ });

beforeEach(() => {
  h.mutate.mockReset();
  h.isPending = false;
  h.isError = false;
  h.error = null;
});

describe("TranslationFields — traduction automatique", () => {
  it("ne propose rien quand la collectivité n'a que le français", () => {
    render(<Harness enabled={["fr"]} />);
    expect(screen.queryByRole("button", { name: /Traduire/ })).toBeNull();
  });

  it("attend le libellé français avant de pouvoir traduire", () => {
    render(<Harness label="   " />);
    expect((translateButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("ne demande QUE les langues encore vides", () => {
    render(<Harness initial={{ en: "Birth certificate request" }} />);
    fireEvent.click(translateButton());
    expect(lastInput().codes).toEqual(["es"]);
  });

  it("pose les traductions reçues dans les champs, sans toucher aux autres", () => {
    render(<Harness initial={{ en: "Relu par un agent" }} />);
    fireEvent.click(translateButton());
    answerWith({ es: "Solicitud de partida de nacimiento" });

    expect((screen.getByLabelText("Anglais") as HTMLInputElement).value)
      .toBe("Relu par un agent");
    expect((screen.getByLabelText("Espagnol") as HTMLInputElement).value)
      .toBe("Solicitud de partida de nacimiento");
  });

  it("dit ce qui a été traduit, et ce qui ne l'a pas été", () => {
    render(<Harness />);
    fireEvent.click(translateButton());
    answerWith({ en: "Birth certificate request" }, ["es"]);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Anglais");
    expect(status.textContent).toContain("relisez avant d'enregistrer");
    expect(status.textContent).toContain("Espagnol");
  });

  it("ne propose plus que « Tout retraduire » quand tout est rempli", () => {
    render(<Harness initial={{ en: "A", es: "B" }} />);
    expect(screen.queryByRole("button", { name: /Traduire automatiquement/ })).toBeNull();
    const retranslate = screen.getByRole("button", { name: "Tout retraduire" });
    expect((retranslate as HTMLButtonElement).disabled).toBe(false);
  });

  it("ne retraduit tout qu'après confirmation, et sur toutes les langues", () => {
    render(<Harness initial={{ en: "A", es: "B" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Tout retraduire" }));
    // La confirmation est ouverte : rien n'est encore parti.
    expect(h.mutate).not.toHaveBeenCalled();

    // Deux boutons portent ce nom une fois la confirmation ouverte : celui qui
    // l'ouvre, et celui qui valide. Le dernier rendu est celui du dialogue.
    const buttons = screen.getAllByRole("button", { name: "Tout retraduire" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(lastInput().codes).toEqual(["en", "es"]);
  });

  it("affiche le message français du refus (crédit épuisé, cadence…)", () => {
    h.isError = true;
    h.error = new Error("Crédit IA épuisé pour ce mois-ci.");
    render(<Harness />);
    expect(screen.getByRole("alert").textContent).toContain("Crédit IA épuisé");
  });

  it("transmet le libellé nettoyé et la nature de la ligne", () => {
    render(<Harness label="  Demande d'acte  " />);
    fireEvent.click(translateButton());
    expect(lastInput().label).toBe("Demande d'acte");
    expect(lastInput().kind).toBe("procedure");
    expect(lastInput().organizationId).toBe("org-1");
  });
});
