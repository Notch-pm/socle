// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommunicationStep } from "./CommunicationStep";
import type { Procedure } from "@/features/procedures/useProcedures";

// jsdom n'implémente pas la capture de pointeur utilisée par certaines primitives Radix.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// Radix Switch mesure sa taille via ResizeObserver, absent de jsdom.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/** Démarche minimale mais complète pour piloter le composant. */
function makeProcedure(communicationConfig: unknown = null): Procedure {
  return {
    id: "proc-1",
    name: "Démarche test",
    organization_id: "org-1",
    category_id: null,
    type: "externe",
    keywords: null,
    short_description: null,
    input_duration_minutes: null,
    order_index: null,
    is_active_global: null,
    agent_description: null,
    user_description: null,
    translations: null,
    requester_config: null,
    form_schema: null,
    knowledge_base: null,
    communication_config: communicationConfig as Procedure["communication_config"],
    status: "brouillon",
    created_at: null,
    updated_at: null,
  };
}

function renderStep(procedure: Procedure) {
  const onSubmit = vi.fn();
  render(<CommunicationStep formId="communication-test" procedure={procedure} onSubmit={onSubmit} />);
  const submit = () => fireEvent.submit(document.getElementById("communication-test")!);
  return { onSubmit, submit };
}

const portalSwitch = () => screen.getByRole("switch", { name: "Visible sur le portail" });
const periodSwitch = () =>
  screen.getByRole("switch", { name: "Limiter la publication à une période" });
const startInput = () =>
  screen.getByLabelText(/Date de début de publication/) as HTMLInputElement;
const endInput = () => screen.getByLabelText(/Date de fin de publication/) as HTMLInputElement;

describe("CommunicationStep — bloc Visibilité", () => {
  it("démarche jamais paramétrée : les deux commutateurs sont actifs, sans dates", () => {
    renderStep(makeProcedure(null));

    expect(portalSwitch().getAttribute("aria-checked")).toBe("true");
    expect(periodSwitch().getAttribute("aria-checked")).toBe("true");
    expect(startInput().value).toBe("");
    expect(endInput().value).toBe("");
  });

  it("relit les paramètres enregistrés", () => {
    renderStep(
      makeProcedure({
        visibility: {
          portalVisible: false,
          publicationPeriodEnabled: true,
          publicationStart: "2026-09-01",
          publicationEnd: "2026-12-31",
        },
      }),
    );

    expect(portalSwitch().getAttribute("aria-checked")).toBe("false");
    expect(startInput().value).toBe("2026-09-01");
    expect(endInput().value).toBe("2026-12-31");
  });

  it("les dates n'apparaissent que si la publication est limitée à une période", () => {
    renderStep(makeProcedure(null));

    fireEvent.click(periodSwitch());
    expect(screen.queryByLabelText(/Date de début de publication/)).toBeNull();
    expect(screen.queryByLabelText(/Date de fin de publication/)).toBeNull();
  });

  it("transmet les paramètres saisis", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));

    fireEvent.click(portalSwitch());
    fireEvent.change(startInput(), { target: { value: "2026-09-01" } });
    fireEvent.change(endInput(), { target: { value: "2026-12-31" } });
    submit();

    expect(onSubmit).toHaveBeenCalledWith({
      visibility: {
        portalVisible: false,
        publicationPeriodEnabled: true,
        publicationStart: "2026-09-01",
        publicationEnd: "2026-12-31",
      },
    });
  });

  it("refuse d'enregistrer une période dont la fin précède le début", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));

    fireEvent.change(startInput(), { target: { value: "2026-12-31" } });
    fireEvent.change(endInput(), { target: { value: "2026-09-01" } });
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/doit suivre la date de début/)).toBeTruthy();
  });

  it("désactiver la période conserve les dates (retour en arrière possible)", () => {
    const { onSubmit, submit } = renderStep(
      makeProcedure({
        visibility: {
          portalVisible: true,
          publicationPeriodEnabled: true,
          publicationStart: "2026-09-01",
          publicationEnd: "2026-12-31",
        },
      }),
    );

    fireEvent.click(periodSwitch());
    submit();

    expect(onSubmit).toHaveBeenCalledWith({
      visibility: {
        portalVisible: true,
        publicationPeriodEnabled: false,
        publicationStart: "2026-09-01",
        publicationEnd: "2026-12-31",
      },
    });
  });
});
