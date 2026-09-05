// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DomainsSection } from "./DomainsSection";
import type { OrganizationDomain } from "./useOrganizationDomains";

// Requêtes court-circuitées : on vérifie ce que la section affiche et ce qu'elle
// demande d'enregistrer, pas les allers-retours Supabase.
const h = vi.hoisted(() => ({
  domains: [] as Record<string, unknown>[],
  create: vi.fn(),
  remove: vi.fn(),
  setPrimary: vi.fn(),
}));

vi.mock("@/features/organizations/useOrganizationDomains", () => ({
  UNIQUE_VIOLATION: "23505",
  useOrganizationDomains: () => ({ data: h.domains, isLoading: false, isError: false }),
  useCreateOrganizationDomain: () => ({ mutate: h.create, isPending: false }),
  useDeleteOrganizationDomain: () => ({ mutate: h.remove, isPending: false }),
  useSetPrimaryOrganizationDomain: () => ({ mutate: h.setPrimary, isPending: false }),
}));

const ORG = "org-1";

function domain(over: Partial<OrganizationDomain> = {}): OrganizationDomain {
  return {
    id: "dom-1",
    organization_id: ORG,
    hostname: "nantes.edilumen.fr",
    is_primary: true,
    created_at: "2026-09-05T00:00:00Z",
    ...over,
  };
}

const input = () => screen.getByLabelText(/Nouveau domaine/);
const add = () => fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));

function type(value: string) {
  fireEvent.change(input(), { target: { value } });
}

beforeEach(() => {
  h.domains = [];
  h.create.mockReset();
  h.remove.mockReset();
  h.setPrimary.mockReset();
});

describe("DomainsSection — ajout", () => {
  it("enregistre la forme normalisée, pas la saisie", () => {
    // L'unicité porte sur la forme canonique : envoyer la saisie brute ferait
    // dépendre l'acceptation de la façon dont on a tapé.
    render(<DomainsSection organizationId={ORG} />);
    type("  HTTPS://Nantes.Edilumen.FR/  ");
    add();

    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0]).toMatchObject({
      organization_id: ORG,
      hostname: "nantes.edilumen.fr",
    });
  });

  it("montre la forme qui sera stockée quand elle diffère de la saisie", () => {
    render(<DomainsSection organizationId={ORG} />);
    type("NANTES.Edilumen.fr");
    expect(screen.getByText("nantes.edilumen.fr")).toBeTruthy();
  });

  it("fait du premier domaine le domaine canonique", () => {
    // Sans cela, une collectivité qui n'en déclare qu'un n'aurait aucun
    // domaine à écrire dans ses liens.
    render(<DomainsSection organizationId={ORG} />);
    type("nantes.edilumen.fr");
    add();
    expect(h.create.mock.calls[0][0].is_primary).toBe(true);
  });

  it("n'en fait pas le canonique quand il en existe déjà un", () => {
    h.domains = [domain()];
    render(<DomainsSection organizationId={ORG} />);
    type("demarches.nantes.fr");
    add();
    expect(h.create.mock.calls[0][0].is_primary).toBe(false);
  });

  it("refuse une saisie invalide sans rien envoyer", () => {
    render(<DomainsSection organizationId={ORG} />);
    type("localhost");
    add();

    expect(h.create).not.toHaveBeenCalled();
    expect(screen.getByText(/PORTAL_DEV_DOMAIN_SUFFIX/)).toBeTruthy();
  });

  it("explique un domaine déjà pris sans dire à qui", () => {
    // L'unicité est GLOBALE : le domaine peut appartenir à une collectivité que
    // cet administrateur n'a pas le droit de voir. Le message dit quoi faire,
    // pas qui le détient.
    h.create.mockImplementation((_input, opts) => opts.onError({ code: "23505" }));
    render(<DomainsSection organizationId={ORG} />);
    type("nantes.edilumen.fr");
    add();

    const message = screen.getByText(/déjà rattaché à une collectivité/);
    expect(message.textContent).toMatch(/administrateur de la plateforme/);
    expect(message.textContent).not.toMatch(/org-/);
  });
});

describe("DomainsSection — liste", () => {
  it("dit ce qu'implique l'absence de domaine", () => {
    // « Aucun élément » ne renseignerait pas : ici, aucune ligne veut dire que
    // le portail de cette collectivité n'est joignable par personne.
    render(<DomainsSection organizationId={ORG} />);
    expect(screen.getByText(/n'est accessible par aucune adresse/)).toBeTruthy();
  });

  it("distingue le domaine canonique et permet d'en changer", () => {
    h.domains = [
      domain(),
      domain({ id: "dom-2", hostname: "demarches.nantes.fr", is_primary: false }),
    ];
    render(<DomainsSection organizationId={ORG} />);

    // Un seul badge « Principal », et le bouton n'est proposé que sur l'autre.
    expect(screen.getAllByText("Principal")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Définir principal/ }));
    expect(h.setPrimary).toHaveBeenCalledWith({ id: "dom-2", organizationId: ORG });
  });

  it("ouvre le portail du domaine dans un nouvel onglet", () => {
    h.domains = [domain()];
    render(<DomainsSection organizationId={ORG} />);
    const link = screen.getByRole("link", { name: /nantes\.edilumen\.fr/ });
    expect(link.getAttribute("href")).toBe("https://nantes.edilumen.fr");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("annonce la conséquence avant de retirer un domaine", () => {
    h.domains = [domain()];
    render(<DomainsSection organizationId={ORG} />);
    fireEvent.click(screen.getByTitle("Supprimer"));

    expect(screen.getByText(/n'atteindront plus vos démarches/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }));
    expect(h.remove.mock.calls[0][0]).toBe("dom-1");
  });

  it("prévient que le Socle ne configure aucun DNS", () => {
    // Le ticket « j'ai ajouté le domaine et ça ne répond pas » se prévient ici.
    render(<DomainsSection organizationId={ORG} />);
    expect(screen.getByText(/pointer vers le portail dans votre configuration DNS/)).toBeTruthy();
  });
});
