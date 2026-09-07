// @vitest-environment jsdom
import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { TranslationFields, type TranslationFieldSpec } from "./TranslationFields";
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
 *
 * La garde est **par case** (une langue × un champ) depuis que le descriptif
 * court se traduit lui aussi : un libellé relu ne protège pas le descriptif de
 * la même langue, et un descriptif rempli n'empêche pas de traduire le libellé.
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

const LABEL = "Demande d'acte de naissance";
const DESC = "Pour obtenir une copie de votre acte de naissance.";

/**
 * Les vrais appelants posent leur état par fonction : l'enveloppe fait pareil,
 * sans quoi le test validerait une composition que la production ne fait pas.
 */
function Harness({
  initial = {},
  label = LABEL,
  description = DESC,
  enabled = ["fr", "en", "es"],
  single = false,
}: {
  initial?: TranslationInput;
  label?: string;
  description?: string;
  enabled?: string[];
  /** Le cas des catégories : un seul texte traduisible. */
  single?: boolean;
}) {
  const [value, setValue] = React.useState<TranslationInput>(initial);
  const fields: TranslationFieldSpec[] = single
    ? [{ key: "name", label: "Libellé", source: label }]
    : [
      { key: "name", label: "Libellé", source: label },
      { key: "short_description", label: "Descriptif court", source: description, multiline: true },
    ];
  return (
    <TranslationFields
      enabled={enabled}
      value={value}
      onChange={(code, field, next) =>
        setValue((current) => ({ ...current, [code]: { ...current[code], [field]: next } }))
      }
      idPrefix="t"
      organizationId="org-1"
      fields={fields}
      kind="procedure"
    />
  );
}

/** Déclenche le `onSuccess` du dernier `mutate` avec la réponse donnée. */
function answerWith(
  translations: TranslateLabelsResult["translations"],
  missing: string[] = [],
) {
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

/** Les champs d'une langue vivent dans son groupe : « Libellé » y est unique. */
function cell(language: string, field: string): HTMLInputElement | HTMLTextAreaElement {
  return within(screen.getByRole("group", { name: language })).getByLabelText(field) as
    | HTMLInputElement
    | HTMLTextAreaElement;
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

  it("attend un texte français avant de pouvoir traduire", () => {
    render(<Harness label="   " description="  " />);
    expect((translateButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("propose un champ par texte et par langue, sauf le français", () => {
    render(<Harness initial={{ en: { name: "Birth certificate" } }} />);

    expect(cell("Anglais", "Libellé").value).toBe("Birth certificate");
    expect(cell("Anglais", "Descriptif court").value).toBe("");
    expect(cell("Espagnol", "Libellé").value).toBe("");
    expect(screen.queryByRole("group", { name: "Français" })).toBeNull();
  });

  it("ne demande QUE les langues encore incomplètes", () => {
    render(
      <Harness initial={{ en: { name: "Birth certificate", short_description: "Get a copy." } }} />,
    );
    fireEvent.click(translateButton());
    expect(lastInput().codes).toEqual(["es"]);
  });

  it("ne demande QUE les textes encore manquants quelque part", () => {
    // Les deux libellés sont relus, aucun descriptif ne l'est : inutile de
    // faire payer une seconde traduction des libellés.
    render(<Harness initial={{ en: { name: "Birth" }, es: { name: "Partida" } }} />);
    fireEvent.click(translateButton());
    expect(lastInput().fields.map((f) => f.key)).toEqual(["short_description"]);
    expect(lastInput().codes).toEqual(["en", "es"]);
  });

  it("pose les traductions reçues dans les cases vides, sans toucher aux autres", () => {
    render(<Harness initial={{ en: { name: "Relu par un agent" } }} />);
    fireEvent.click(translateButton());
    answerWith({
      en: { name: "Birth certificate request", short_description: "To get a copy." },
      es: { name: "Solicitud de partida", short_description: "Para obtener una copia." },
    });

    // Le libellé anglais était relu : la proposition ne l'écrase pas…
    expect(cell("Anglais", "Libellé").value).toBe("Relu par un agent");
    // …mais son descriptif, lui, était vide.
    expect(cell("Anglais", "Descriptif court").value).toBe("To get a copy.");
    expect(cell("Espagnol", "Libellé").value).toBe("Solicitud de partida");
  });

  it("dit ce qui a été traduit, et ce qui ne l'a pas été", () => {
    render(<Harness />);
    fireEvent.click(translateButton());
    answerWith({ en: { name: "Birth certificate request" } }, ["es"]);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Anglais");
    expect(status.textContent).toContain("relisez avant d'enregistrer");
    expect(status.textContent).toContain("Espagnol");
  });

  it("ne propose plus que « Tout retraduire » quand toutes les cases sont remplies", () => {
    render(
      <Harness
        initial={{
          en: { name: "A", short_description: "B" },
          es: { name: "C", short_description: "D" },
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: /Traduire automatiquement/ })).toBeNull();
    const retranslate = screen.getByRole("button", { name: "Tout retraduire" });
    expect((retranslate as HTMLButtonElement).disabled).toBe(false);
  });

  it("ne retraduit tout qu'après confirmation — toutes les langues, tous les textes", () => {
    render(
      <Harness
        initial={{
          en: { name: "A", short_description: "B" },
          es: { name: "C", short_description: "D" },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tout retraduire" }));
    // La confirmation est ouverte : rien n'est encore parti.
    expect(h.mutate).not.toHaveBeenCalled();

    // Deux boutons portent ce nom une fois la confirmation ouverte : celui qui
    // l'ouvre, et celui qui valide. Le dernier rendu est celui du dialogue.
    const buttons = screen.getAllByRole("button", { name: "Tout retraduire" });
    fireEvent.click(buttons[buttons.length - 1]);
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(lastInput().codes).toEqual(["en", "es"]);
    expect(lastInput().fields.map((f) => f.key)).toEqual(["name", "short_description"]);

    answerWith({ en: { name: "Birth", short_description: "Copy." } });
    expect(cell("Anglais", "Libellé").value).toBe("Birth");
    expect(cell("Anglais", "Descriptif court").value).toBe("Copy.");
  });

  it("affiche le message français du refus (crédit épuisé, cadence…)", () => {
    h.isError = true;
    h.error = new Error("Crédit IA épuisé pour ce mois-ci.");
    render(<Harness />);
    expect(screen.getByRole("alert").textContent).toContain("Crédit IA épuisé");
  });

  it("transmet les textes nettoyés et la nature de la ligne", () => {
    render(<Harness label="  Demande d'acte  " description="  Un résumé.  " />);
    fireEvent.click(translateButton());
    expect(lastInput().fields).toEqual([
      { key: "name", value: "Demande d'acte" },
      { key: "short_description", value: "Un résumé." },
    ]);
    expect(lastInput().kind).toBe("procedure");
    expect(lastInput().organizationId).toBe("org-1");
  });

  it("ne demande pas un texte français vide — il n'y a rien à traduire, ni à payer", () => {
    render(<Harness description="   " />);
    fireEvent.click(translateButton());
    expect(lastInput().fields.map((f) => f.key)).toEqual(["name"]);
  });

  it("garde l'étiquette de langue comme seule étiquette quand un texte est traduisible", () => {
    // Le cas des catégories : encadrer un champ unique n'ajouterait qu'une boîte.
    render(<Harness single />);
    expect((screen.getByLabelText("Anglais") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("group", { name: "Anglais" })).toBeNull();
  });
});
