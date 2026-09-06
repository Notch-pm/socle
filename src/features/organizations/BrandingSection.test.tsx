// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrandingSection, BRANDING_INHERIT_SWITCH_LABEL } from "./BrandingSection";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

// Requêtes court-circuitées : on vérifie ce que la section affiche et ce qu'elle
// demande d'enregistrer, pas les allers-retours Supabase.
const h = vi.hoisted(() => ({
  parent: null as Record<string, unknown> | null,
  save: vi.fn(),
}));

vi.mock("@/features/organizations/useBranding", () => ({
  useParentBranding: () => ({ data: h.parent, isLoading: false }),
  useSaveBranding: () => ({
    mutate: h.save,
    reset: () => {},
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
}));

// Primitives Radix (Switch) : polyfills absents de jsdom.
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

const parentBranding = {
  source_organization_id: "org-racine",
  source_organization_name: "ACCM",
  configured: true,
  logo_url: "https://accm.fr/logo.png",
  logo_white_url: "https://accm.fr/logo-blanc.svg",
  primary_color: "#123456",
  secondary_color: "#654321",
};

function org(over: Partial<Organization> = {}): Organization {
  return {
    id: "org-enfant",
    name: "Mairie de Fontvieille",
    parent_id: "org-racine",
    address: null,
    created_at: null,
    email: null,
    email_sender_name: null,
    email_sender_override: false,
    enabled_languages: ["fr"],
    logo_url: null,
    logo_white_url: null,
    primary_color: null,
    secondary_color: null,
    branding_inherit_parent: true,
    metadata: null,
    phone: null,
    slug: null,
    status: "active",
    type: null,
    ...over,
  };
}

const inheritSwitch = () =>
  screen.getByRole("switch", { name: BRANDING_INHERIT_SWITCH_LABEL });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

beforeEach(() => {
  h.parent = null;
  h.save.mockReset();
});

describe("BrandingSection — héritage de la charte", () => {
  it("organisation principale : aucun commutateur, charte directement saisissable", () => {
    render(
      <BrandingSection
        organization={org({
          parent_id: null,
          branding_inherit_parent: false,
          logo_url: "https://accm.fr/logo.png",
          primary_color: "#123456",
        })}
      />,
    );
    expect(screen.queryByRole("switch", { name: BRANDING_INHERIT_SWITCH_LABEL })).toBeNull();
    expect((screen.getByLabelText("Logo couleur (URL)") as HTMLInputElement).value).toBe(
      "https://accm.fr/logo.png",
    );
    save();
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ branding_inherit_parent: false, primary_color: "#123456" }),
    );
  });

  it("sous-organisation sans charte propre : hérite par défaut et nomme la source", () => {
    h.parent = parentBranding;
    render(<BrandingSection organization={org()} />);
    expect(inheritSwitch().getAttribute("aria-checked")).toBe("true");
    // Formulaire masqué tant que l'héritage est actif.
    expect(screen.queryByLabelText("Logo couleur (URL)")).toBeNull();
    expect(screen.getByText("ACCM")).toBeTruthy();
    // L'aperçu montre bien la charte du parent, pas du vide.
    expect(screen.getByText("#123456")).toBeTruthy();
  });

  it("aucune charte au-dessus : l'aperçu le dit au lieu de faire croire à un habillage", () => {
    h.parent = null;
    render(<BrandingSection organization={org()} />);
    expect(screen.getByText(/habillage par défaut/i)).toBeTruthy();
  });

  it("désactiver l'héritage ouvre la saisie et enregistre une charte propre", () => {
    h.parent = parentBranding;
    render(<BrandingSection organization={org()} />);
    fireEvent.click(inheritSwitch());
    fireEvent.change(screen.getByLabelText("Logo blanc (URL)"), {
      target: { value: "https://fontvieille.fr/blanc.svg" },
    });
    fireEvent.change(screen.getByLabelText("Couleur principale"), {
      target: { value: "#ABC" },
    });
    save();
    expect(h.save).toHaveBeenCalledWith({
      logo_url: null,
      logo_white_url: "https://fontvieille.fr/blanc.svg",
      // Normalisée : deux écritures de la même couleur ne doivent pas se lire
      // comme deux couleurs différentes en aval.
      primary_color: "#aabbcc",
      secondary_color: null,
      branding_inherit_parent: false,
    });
  });

  it("revenir à l'héritage CONSERVE la charte saisie (retour en arrière possible)", () => {
    h.parent = parentBranding;
    render(
      <BrandingSection
        organization={org({
          branding_inherit_parent: false,
          logo_url: "https://fontvieille.fr/logo.png",
          primary_color: "#0a0a0a",
        })}
      />,
    );
    expect(inheritSwitch().getAttribute("aria-checked")).toBe("false");
    fireEvent.click(inheritSwitch());
    save();
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({
        branding_inherit_parent: true,
        logo_url: "https://fontvieille.fr/logo.png",
        primary_color: "#0a0a0a",
      }),
    );
  });

  it("une couleur qui n'en est pas une bloque l'enregistrement au lieu d'être écrasée en null", () => {
    render(<BrandingSection organization={org({ parent_id: null, branding_inherit_parent: false })} />);
    fireEvent.change(screen.getByLabelText("Couleur secondaire"), {
      target: { value: "bleu marine" },
    });
    expect(screen.getByText(/Couleur invalide/i)).toBeTruthy();
    save();
    expect(h.save).not.toHaveBeenCalled();
  });
});
