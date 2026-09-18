// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { DemandeurStep } from "./DemandeurStep";
import type { RequesterConfig } from "@/features/procedures/requesterFields";
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
function makeProcedure(requesterConfig: unknown = null): Procedure {
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
    user_communication: null,
    translations: null,
    requester_config: requesterConfig as Procedure["requester_config"],
    form_schema: null,
    knowledge_base: null,
    communication_config: null,
    status: "brouillon",
    access_mode: "libre",
    created_at: null,
    updated_at: null,
  };
}

/** Rend l'étape et renvoie l'espion onSubmit + un déclencheur de soumission. */
function renderStep(procedure: Procedure) {
  const onSubmit = vi.fn();
  render(<DemandeurStep formId="demandeur-test" procedure={procedure} onSubmit={onSubmit} />);
  const submit = () => fireEvent.submit(document.getElementById("demandeur-test")!);
  return { onSubmit, submit };
}

describe("DemandeurStep — enregistrement de la configuration", () => {
  it("part d'une config vierge : publics désactivés, aucun champ affiché", () => {
    renderStep(makeProcedure(null));
    // Aucun public activé → aucun contrôle d'état de champ visible.
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(
      screen.getByRole("switch", { name: /Activer le public Citoyens/i }).getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("transmet la config construite (public activé + champ passé à Obligatoire)", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));

    // Activer « Citoyens » → ses champs apparaissent.
    fireEvent.click(screen.getByRole("switch", { name: /Activer le public Citoyens/i }));

    // Passer « Courriel » à Obligatoire.
    const courriel = screen.getByRole("radiogroup", { name: /Courriel/i });
    fireEvent.click(within(courriel).getByRole("radio", { name: "Obligatoire" }));

    submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const config = onSubmit.mock.calls[0][0] as RequesterConfig;
    expect(config.citoyen.enabled).toBe(true);
    expect(config.citoyen.fields.courriel).toBe("obligatoire");
    // Champ non touché → reste masqué.
    expect(config.citoyen.fields.prenoms).toBe("masque");
    // Autres publics inchangés.
    expect(config.entreprise.enabled).toBe(false);
    expect(config.association.enabled).toBe(false);
  });

  it("charge une config existante et la ré-émet fidèlement à la soumission", () => {
    const { onSubmit, submit } = renderStep(
      makeProcedure({
        entreprise: { enabled: true, fields: { siret: "obligatoire", courriel: "visible" } },
      }),
    );

    // Le public Entreprises doit être pré-activé.
    expect(
      screen.getByRole("switch", { name: /Activer le public Entreprises/i }).getAttribute("aria-checked"),
    ).toBe("true");

    submit();

    const config = onSubmit.mock.calls[0][0] as RequesterConfig;
    expect(config.entreprise.enabled).toBe(true);
    expect(config.entreprise.fields.siret).toBe("obligatoire");
    expect(config.entreprise.fields.courriel).toBe("visible");
    // Champ non stocké → défaut masqué.
    expect(config.entreprise.fields.adresse).toBe("masque");
    expect(config.citoyen.enabled).toBe(false);
  });

  it("désactiver un public masque ses champs sans perdre la sélection des autres", () => {
    const { onSubmit, submit } = renderStep(makeProcedure(null));

    const citoyenSwitch = screen.getByRole("switch", { name: /Activer le public Citoyens/i });
    fireEvent.click(citoyenSwitch); // on
    fireEvent.click(citoyenSwitch); // off

    // Plus aucun champ affiché pour Citoyens.
    expect(screen.queryByRole("radiogroup")).toBeNull();

    submit();
    const config = onSubmit.mock.calls[0][0] as RequesterConfig;
    expect(config.citoyen.enabled).toBe(false);
  });
});
