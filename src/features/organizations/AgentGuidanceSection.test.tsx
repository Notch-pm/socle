// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentGuidanceSection, AGENT_GUIDANCE_ROOT_ONLY_MESSAGE } from "./AgentGuidanceSection";
import { defaultAgentGuidance, MAX_GUIDELINES, type AgentGuidance } from "./agentGuidance";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  stored: null as { guidance: AgentGuidance; updatedAt: string | null } | null,
}));

vi.mock("@/features/organizations/useAgentGuidance", () => ({
  useAgentGuidance: (orgId: string | undefined) => ({
    // Le composant ne demande rien pour une sous-organisation.
    data: orgId ? h.stored : undefined,
    isLoading: false,
  }),
  useSaveAgentGuidance: () => ({
    mutate: h.mutate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
  }),
}));

function org(over: Partial<Organization> = {}): Organization {
  return { id: "org-racine", name: "ACCM", parent_id: null, ...over } as Organization;
}

beforeEach(() => {
  h.mutate.mockClear();
  h.stored = { guidance: defaultAgentGuidance(), updatedAt: null };
});

describe("AgentGuidanceSection", () => {
  it("renvoie une sous-organisation vers son organisation principale", () => {
    render(<AgentGuidanceSection organization={org({ id: "org-fille", parent_id: "org-racine" })} />);

    expect(screen.getByText(AGENT_GUIDANCE_ROOT_ONLY_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });

  it("amorce le formulaire avec ce qui est enregistré, et dit de quand il date", () => {
    h.stored = {
      guidance: {
        ...defaultAgentGuidance(),
        roleDescription: "Accueillir et orienter.",
        guidelines: [{ title: "Confidentialité", text: "Aucun dossier lu à voix haute." }],
      },
      updatedAt: "2026-09-19T08:00:00Z",
    };
    render(<AgentGuidanceSection organization={org()} />);

    expect((screen.getByLabelText("Rôle des agents") as HTMLTextAreaElement).value).toBe(
      "Accueillir et orienter.",
    );
    expect((screen.getByLabelText("Titre de la consigne") as HTMLInputElement).value).toBe(
      "Confidentialité",
    );
    expect(screen.getByText(/Dernière mise à jour le 19 septembre 2026/)).toBeTruthy();
  });

  it("ajoute une consigne et enregistre l'ensemble", () => {
    render(<AgentGuidanceSection organization={org()} />);

    fireEvent.change(screen.getByLabelText("Spécificités de l'accueil physique"), {
      target: { value: "Guichet ouvert de 8 h 30 à 12 h." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Ajouter une consigne/ }));
    fireEvent.change(screen.getByLabelText("Titre de la consigne"), {
      target: { value: "Pièce d'identité" },
    });
    fireEvent.change(screen.getByLabelText("Texte de la consigne"), {
      target: { value: "La vérifier avant tout dépôt." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(h.mutate).toHaveBeenCalledWith({
      ...defaultAgentGuidance(),
      physicalReception: "Guichet ouvert de 8 h 30 à 12 h.",
      guidelines: [{ title: "Pièce d'identité", text: "La vérifier avant tout dépôt." }],
    });
  });

  it("retire une consigne", () => {
    h.stored = {
      guidance: {
        ...defaultAgentGuidance(),
        guidelines: [
          { title: "A", text: "1" },
          { title: "B", text: "2" },
        ],
      },
      updatedAt: null,
    };
    render(<AgentGuidanceSection organization={org()} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Retirer cette consigne" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(h.mutate.mock.calls[0][0].guidelines).toEqual([{ title: "B", text: "2" }]);
  });

  it("n'offre plus d'ajout une fois le plafond de consignes atteint", () => {
    h.stored = {
      guidance: {
        ...defaultAgentGuidance(),
        guidelines: Array.from({ length: MAX_GUIDELINES }, (_, i) => ({ title: `C${i}`, text: "x" })),
      },
      updatedAt: null,
    };
    render(<AgentGuidanceSection organization={org()} />);

    expect(screen.queryByRole("button", { name: /Ajouter une consigne/ })).toBeNull();
  });
});
