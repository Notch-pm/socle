// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { EmailTemplatesManager } from "./EmailTemplatesManager";
import { resolveEmailTemplates, type EmailTemplateDefaultRow } from "./emailTemplates";

const ORG = "org-1";

const defaults: EmailTemplateDefaultRow[] = [
  {
    key: "debut_instruction",
    name: "Courriel de début d'instruction",
    description: null,
    subject: "Votre demande {{demande.reference}} est en cours de traitement",
    body: "Bonjour,",
    application_ids: ["iris"],
    variables: ["demande.reference"],
    position: 20,
  },
  {
    key: "accuse_reception",
    name: "Accusé de réception de la demande",
    description: null,
    subject: "Nous avons bien reçu votre demande",
    body: "Bonjour,",
    application_ids: ["iris"],
    variables: [],
    position: 10,
  },
];

const h = vi.hoisted(() => ({
  templates: [] as unknown[],
  reset: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/features/email-templates/useEmailTemplates", () => ({
  UNIQUE_VIOLATION: "23505",
  useEmailTemplates: () => ({ data: h.templates, isLoading: false, isError: false }),
  useSaveSystemEmailTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetSystemEmailTemplate: () => ({ mutate: h.reset, isPending: false }),
  useCreateEmailTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEmailTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEmailTemplate: () => ({ mutate: h.remove, isPending: false }),
}));

vi.mock("@/features/superadmin/organizations/useOrganizationsAdmin", () => ({
  useAllOrganizations: () => ({
    data: [
      { id: "org-1", name: "Ville de Démo", parent_id: null },
      { id: "svc-1", name: "Voirie", parent_id: "org-1" },
      { id: "autre", name: "Autre collectivité", parent_id: null },
    ],
  }),
}));

vi.mock("@/features/superadmin/applications/useApplications", () => ({
  useApplications: () => ({
    data: [
      { id: "clara", name: "Clara", scope: "abonnement" },
      { id: "iris", name: "Iris", scope: "abonnement" },
      { id: "socle", name: "Socle", scope: "plateforme" },
    ],
  }),
}));

beforeEach(() => {
  h.reset.mockReset();
  h.remove.mockReset();
  h.templates = resolveEmailTemplates(
    ORG,
    defaults,
    [
      {
        id: "o1",
        organization_id: ORG,
        system_key: "debut_instruction",
        name: null,
        description: null,
        subject: "Prise en charge",
        body: "Bonjour,",
        updated_at: "2026-11-12T10:00:00Z",
      },
      {
        id: "c1",
        organization_id: ORG,
        system_key: null,
        name: "Invitation",
        description: null,
        subject: "Vous êtes invité",
        body: "Bonjour,",
        updated_at: "2026-11-12T10:00:00Z",
      },
    ],
    [{ email_template_id: "c1", application_id: "clara" }],
    [{ email_template_id: "c1", organization_id: "svc-1" }],
  );
});

function rowOf(name: string) {
  return screen.getByText(name).closest("tr") as HTMLElement;
}

describe("EmailTemplatesManager", () => {
  it("un tableau : titre du courriel, applications qui l'utilisent", () => {
    render(<EmailTemplatesManager organizationId={ORG} />);
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toContain("Titre du courriel");
    expect(headers).toContain("Applications");
    expect(within(rowOf("Accusé de réception de la demande")).getByText("iris")).toBeTruthy();
    expect(within(rowOf("Invitation")).getByText("clara")).toBeTruthy();
  });

  it("un courriel système ne se supprime jamais", () => {
    render(<EmailTemplatesManager organizationId={ORG} />);
    for (const name of ["Accusé de réception de la demande", "Courriel de début d'instruction"]) {
      const row = rowOf(name);
      expect(within(row).getByTitle("Modifier")).toBeTruthy();
      expect(within(row).queryByTitle("Supprimer")).toBeNull();
    }
  });

  it("un courriel système modifié se rétablit ; un intact n'en propose pas", () => {
    render(<EmailTemplatesManager organizationId={ORG} />);
    expect(within(rowOf("Accusé de réception de la demande")).queryByTitle("Rétablir le texte d'origine")).toBeNull();
    fireEvent.click(within(rowOf("Courriel de début d'instruction")).getByTitle("Rétablir le texte d'origine"));
    fireEvent.click(screen.getByRole("button", { name: "Rétablir" }));
    expect(h.reset).toHaveBeenCalledWith("o1", expect.anything());
  });

  it("un modèle créé se supprime, après confirmation", () => {
    render(<EmailTemplatesManager organizationId={ORG} />);
    fireEvent.click(within(rowOf("Invitation")).getByTitle("Supprimer"));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(h.remove).toHaveBeenCalledWith("c1", expect.anything());
  });

  it("le dialogue d'un courriel système verrouille titre et applications", () => {
    render(<EmailTemplatesManager organizationId={ORG} />);
    fireEvent.click(within(rowOf("Accusé de réception de la demande")).getByTitle("Modifier"));
    expect(screen.getByText("Titre et applications ne se modifient pas.")).toBeTruthy();
    expect(screen.queryByLabelText(/^Titre/)).toBeNull();
    expect((screen.getByLabelText(/^Objet/) as HTMLInputElement).value).toBe(
      "Nous avons bien reçu votre demande",
    );
  });

  it("un nouveau modèle propose les applications abonnables, pas le Socle", () => {
    render(<EmailTemplatesManager organizationId={ORG} />);
    fireEvent.click(screen.getByRole("button", { name: /Nouveau modèle/ }));
    expect(screen.getByLabelText("Clara")).toBeTruthy();
    expect(screen.getByLabelText("Iris")).toBeTruthy();
    expect(screen.queryByLabelText("Socle")).toBeNull();
  });
});

describe("EmailTemplatesManager — organismes", () => {
  it("le tableau dit dans combien d'organismes un modèle créé est proposé", () => {
    render(<EmailTemplatesManager organizationId={ORG} />);
    expect(within(rowOf("Invitation")).getByText("1 organisme")).toBeTruthy();
  });

  it("le dialogue propose l'arbre de la collectivité, et seulement lui, avec les cases cochées", () => {
    render(<EmailTemplatesManager organizationId={ORG} />);
    fireEvent.click(within(rowOf("Invitation")).getByTitle("Modifier"));
    expect((screen.getByLabelText("Voirie") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Ville de Démo") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText("Autre collectivité")).toBeNull();
  });

  it("un courriel système n'a pas de cases d'organismes (il vaut partout)", () => {
    render(<EmailTemplatesManager organizationId={ORG} />);
    fireEvent.click(within(rowOf("Accusé de réception de la demande")).getByTitle("Modifier"));
    expect(screen.queryByText("Organismes où il est proposé")).toBeNull();
  });
});
