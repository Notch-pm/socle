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
  role: "super_admin" as string,
  platform: null as null | { portal_domain_suffix: string | null; portal_cname_target: string | null },
}));

vi.mock("@/features/organizations/useOrganizationDomains", () => ({
  UNIQUE_VIOLATION: "23505",
  useOrganizationDomains: () => ({ data: h.domains, isLoading: false, isError: false }),
  useCreateOrganizationDomain: () => ({ mutate: h.create, isPending: false }),
  useDeleteOrganizationDomain: () => ({ mutate: h.remove, isPending: false }),
  useSetPrimaryOrganizationDomain: () => ({ mutate: h.setPrimary, isPending: false }),
}));

// L'écriture est réservée au super administrateur (RLS) : le composant le
// reflète d'après le profil.
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({
    session: null,
    profile: { global_role: h.role },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/features/superadmin/platform/usePlatformSettings", () => ({
  usePlatformSettings: () => ({ data: h.platform, isLoading: false, isError: false }),
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
  h.role = "super_admin";
  h.platform = null;
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
    expect(screen.getByText(/simule un domaine réel/)).toBeTruthy();
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

describe("DomainsSection — plateforme", () => {
  it("nomme la cible CNAME quand la plateforme l'a réglée", () => {
    // Sans cible, l'administrateur sait qu'il doit pointer le domaine, pas où.
    h.platform = { portal_domain_suffix: null, portal_cname_target: "portail.edilumen.fr" };
    render(<DomainsSection organizationId={ORG} />);
    expect(screen.getByText("portail.edilumen.fr")).toBeTruthy();
    expect(screen.getByText(/enregistrement CNAME/)).toBeTruthy();
  });

  it("marque le sous-domaine fourni, et pas un domaine propre", () => {
    h.platform = { portal_domain_suffix: "demarches.edilumen.fr", portal_cname_target: null };
    h.domains = [
      domain({ hostname: "nantes.demarches.edilumen.fr" }),
      domain({ id: "dom-2", hostname: "demarches.nantes.fr", is_primary: false }),
    ];
    render(<DomainsSection organizationId={ORG} />);
    expect(screen.getAllByText("Sous-domaine fourni")).toHaveLength(1);
    expect(screen.getByText(/est fourni par la plateforme/)).toBeTruthy();
  });
});

describe("DomainsSection — administrateur de collectivité", () => {
  beforeEach(() => {
    h.role = "consultant";
  });

  it("lit ses domaines sans pouvoir en poser, en retirer ni en changer", () => {
    // Le RLS refuserait de toute façon : l'écran ne propose pas un geste qui
    // échouerait, il dit à qui s'adresser.
    h.domains = [
      domain(),
      domain({ id: "dom-2", hostname: "demarches.nantes.fr", is_primary: false }),
    ];
    render(<DomainsSection organizationId={ORG} />);

    expect(screen.queryByLabelText(/Nouveau domaine/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Définir principal/ })).toBeNull();
    expect(screen.queryByTitle("Supprimer")).toBeNull();
    expect(screen.getByText(/posés par l'éditeur de la plateforme/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /demarches\.nantes\.fr/ })).toBeTruthy();
  });
});
