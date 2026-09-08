// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlatformSettingsPage } from "./PlatformSettingsPage";

const h = vi.hoisted(() => ({
  settings: {
    id: true,
    portal_domain_suffix: null as string | null,
    portal_cname_target: null as string | null,
    default_ai_monthly_tokens: null as number | null,
    updated_at: "2026-09-08T00:00:00Z",
    updated_by: null,
  },
  save: vi.fn(),
  provision: vi.fn(),
}));

vi.mock("./usePlatformSettings", () => ({
  usePlatformSettings: () => ({ data: h.settings, isLoading: false, isError: false }),
  useSavePlatformSettings: () => ({ mutate: h.save, isPending: false, isSuccess: false, error: null }),
  useProvisionExistingRoots: () => ({ mutate: h.provision, isPending: false, error: null }),
}));

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  h.save.mockReset();
  h.provision.mockReset();
  h.settings = { ...h.settings, portal_domain_suffix: null, portal_cname_target: null, default_ai_monthly_tokens: null };
});

describe("PlatformSettingsPage", () => {
  it("reflète les réglages en place", () => {
    h.settings = { ...h.settings, portal_domain_suffix: "demarches.edilumen.fr", default_ai_monthly_tokens: 2_000_000 };
    render(<PlatformSettingsPage />);
    expect(field(/Zone des sous-domaines/).value).toBe("demarches.edilumen.fr");
    expect(field(/Plafond IA par défaut/).value).toBe("2000000");
  });

  it("envoie la forme normalisée, et NULL pour une case vide", () => {
    render(<PlatformSettingsPage />);
    fireEvent.change(field(/Zone des sous-domaines/), { target: { value: " Demarches.Edilumen.FR. " } });
    fireEvent.change(field(/Plafond IA par défaut/), { target: { value: "1 500 000" } });
    fireEvent.click(screen.getByRole("button", { name: /^Enregistrer$/ }));

    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.save.mock.calls[0][0]).toEqual({
      portal_domain_suffix: "demarches.edilumen.fr",
      portal_cname_target: null,
      default_ai_monthly_tokens: 1_500_000,
    });
  });

  it("n'envoie rien et nomme le défaut quand une valeur ne passerait pas", () => {
    render(<PlatformSettingsPage />);
    fireEvent.change(field(/Zone des sous-domaines/), { target: { value: "localhost" } });
    fireEvent.click(screen.getByRole("button", { name: /^Enregistrer$/ }));
    expect(h.save).not.toHaveBeenCalled();
    expect(screen.getByText(/localhost/)).toBeTruthy();
  });

  it("raconte ce que le provisioning a ajouté", () => {
    h.provision.mockImplementation((_vars, opts) =>
      opts.onSuccess({ organizations: 2, roles: 8, quotas: 1, domains: 2 }),
    );
    render(<PlatformSettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Rejouer le provisioning/ }));
    expect(screen.getByText(/2 organisations principales parcourues/)).toBeTruthy();
    expect(screen.getByText(/8 rôles de contact, 1 plafond IA, 2 sous-domaines ajoutés/)).toBeTruthy();
  });
});
