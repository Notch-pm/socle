// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SmtpSettingsSection, INHERIT_SWITCH_LABEL } from "./SmtpSettingsSection";

// Requêtes court-circuitées : on vérifie ce que la section affiche et ce qu'elle
// demande d'enregistrer, pas les allers-retours Supabase.
const h = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  parent: null as Record<string, unknown> | null,
  save: vi.fn(),
  sendTest: vi.fn(),
}));

vi.mock("@/features/superadmin/organizations/useSmtpSettings", () => ({
  useSmtpSettings: () => ({ data: h.settings, isLoading: false }),
  useParentSmtpSettings: () => ({ data: h.parent, isLoading: false }),
  useSaveSmtpSettings: () => ({
    mutate: h.save,
    isPending: false,
    isError: false,
    error: null,
  }),
  useSendTestEmail: () => ({
    mutate: h.sendTest,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

// Primitives Radix (Dialog, Switch) : polyfills absents de jsdom.
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

const ownSettings = {
  id: "smtp-1",
  host: "smtp.mairie.fr",
  port: 465,
  username: "mairie",
  password: "secret",
  from_email: "ne-pas-repondre@mairie.fr",
  from_name: "Mairie",
  use_tls: true,
  inherit_parent: false,
};

const parentSettings = {
  source_organization_id: "org-racine",
  source_organization_name: "ACCM",
  configured: true,
  host: "smtp.accm.fr",
  port: 587,
  username: "accm",
  from_email: "ne-pas-repondre@accm.fr",
  from_name: "ACCM",
  use_tls: true,
};

function renderSection(parentOrganizationId: string | null) {
  render(
    <SmtpSettingsSection organizationId="org-enfant" parentOrganizationId={parentOrganizationId} />,
  );
}

function inheritSwitch() {
  return screen.getByRole("switch", { name: INHERIT_SWITCH_LABEL });
}

function save() {
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
}

beforeEach(() => {
  h.settings = null;
  h.parent = null;
  h.save.mockReset();
  h.sendTest.mockReset();
});

describe("SmtpSettingsSection — héritage du relais", () => {
  it("organisation principale : aucun commutateur, formulaire directement saisissable", () => {
    h.settings = ownSettings;
    renderSection(null);
    expect(screen.queryByRole("switch", { name: INHERIT_SWITCH_LABEL })).toBeNull();
    expect((screen.getByLabelText("Hôte SMTP") as HTMLInputElement).value).toBe("smtp.mairie.fr");
    save();
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ inherit_parent: false }));
  });

  it("sous-organisation sans configuration : hérite par défaut et montre la source", () => {
    h.parent = parentSettings;
    renderSection("org-racine");
    expect(inheritSwitch().getAttribute("aria-checked")).toBe("true");
    // Formulaire masqué tant que l'héritage est actif.
    expect(screen.queryByLabelText("Hôte SMTP")).toBeNull();
    expect(screen.getByText("ACCM")).toBeTruthy();
    expect(screen.getByText("smtp.accm.fr:587")).toBeTruthy();
  });

  it("aucun relais au-dessus : l'absence d'envoi possible est signalée", () => {
    h.parent = null;
    renderSection("org-racine");
    expect(screen.getByRole("alert").textContent).toMatch(/aucun email ne partira/i);
  });

  it("désactiver l'héritage ouvre la saisie et enregistre une configuration propre", () => {
    h.parent = parentSettings;
    renderSection("org-racine");
    fireEvent.click(inheritSwitch());
    fireEvent.change(screen.getByLabelText("Hôte SMTP"), {
      target: { value: "smtp.annexe.fr" },
    });
    save();
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ inherit_parent: false, host: "smtp.annexe.fr" }),
    );
  });

  it("revenir à l'héritage conserve la configuration saisie (retour en arrière possible)", () => {
    h.settings = ownSettings;
    h.parent = parentSettings;
    renderSection("org-racine");
    expect(inheritSwitch().getAttribute("aria-checked")).toBe("false");
    fireEvent.click(inheritSwitch());
    save();
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ inherit_parent: true, host: "smtp.mairie.fr" }),
    );
  });
});
