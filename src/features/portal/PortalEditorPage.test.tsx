// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AUTOSAVE_DELAY_MS, PortalEditorPage } from "./PortalEditorPage";
import { defaultPortalPage, type PortalPage } from "./portalPage";
import type { PortalEditorProps } from "./PortalEditor";

/**
 * Ce fichier teste la PAGE — chargement, sauvegarde automatique, publication,
 * annulation — pas l'éditeur visuel, remplacé par un pantin qui expose ses
 * rappels sous forme de boutons. Ce qui compte ici est la promesse faite à
 * l'administrateur : ce qu'il tape est écrit tout seul, et jamais publié tout
 * seul.
 */
const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  ensure: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  discard: vi.fn(),
  navigate: vi.fn(),
  edits: 0,
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ orgId: "org-1" }),
  useNavigate: () => h.navigate,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

// La variante admin choisit l'organisation parmi les racines administrées ;
// les tests exercent la variante superadmin, où l'organisation vient de l'URL.
vi.mock("@/features/ai-usage/useAdminRootOrganizations", () => ({
  useAdminRootOrganizations: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/features/superadmin/organizations/useOrganizationsAdmin", () => ({
  useOrganization: () => ({
    data: { id: "org-1", name: "ACCM", parent_id: null, address: null, phone: null, email: null },
    isLoading: false,
  }),
  useAllOrganizations: () => ({ data: [] }),
}));

vi.mock("@/features/procedures/useProcedures", () => ({
  useProceduresForOrg: () => ({ data: [] }),
}));

vi.mock("@/features/organizations/useOrganizationProcedures", () => ({
  useEnabledProcedureBindings: () => ({ data: [] }),
}));

// Les langues de la collectivité : elles ne servent qu'à l'éditeur, qui est
// simulé ici — mais le hook part quand même en requête sans ce mock.
vi.mock("@/features/languages/useOrganizationLanguages", () => ({
  useOrganizationLanguages: () => ({ data: ["fr"] }),
}));

vi.mock("@/features/portal/usePortalPage", () => ({
  HOME_SLUG: "accueil",
  usePortalPage: () => ({ data: h.row, isLoading: false }),
  useEnsurePortalPage: () => ({ mutate: h.ensure, isIdle: true, isError: false }),
  useSaveDraft: () => ({ mutate: h.save, isPending: false, isError: false }),
  usePublishPortalPage: () => ({ mutate: h.publish, isPending: false, isError: false, reset: () => {} }),
  useDiscardDraft: () => ({ mutate: h.discard, isPending: false, isError: false, reset: () => {} }),
}));

// Le pantin : chaque clic « modifier » remonte une page avec un titre différent.
// Le compteur vit hors du rendu — une fermeture serait remise à zéro à chaque
// re-rendu provoqué par `onChange`, et enverrait trois fois « Titre 1 ».
vi.mock("@/features/portal/PortalEditor", () => ({
  PortalEditor: (props: PortalEditorProps) => {
    const edit = () => {
      h.edits += 1;
      const next: PortalPage = {
        ...props.page,
        sections: props.page.sections.map((s, i) => (i === 0 ? { ...s, title: "Titre " + h.edits } : s)),
      };
      props.onChange(next);
    };
    return (
      <div>
        <span data-testid="status">{props.statusLine}</span>
        <button type="button" onClick={edit}>modifier</button>
        <button type="button" onClick={props.onPublish}>publier</button>
        <button type="button" onClick={props.onDiscard}>annuler</button>
      </div>
    );
  },
}));

function rowFor(draft: PortalPage, published: PortalPage | null = null) {
  return {
    id: "page-1",
    organization_id: "org-1",
    slug: "accueil",
    draft,
    published,
    published_at: published ? "2026-09-01T10:00:00Z" : null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  h.row = rowFor(defaultPortalPage());
  h.edits = 0;
  h.ensure.mockReset();
  h.save.mockReset();
  h.publish.mockReset();
  h.discard.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PortalEditorPage — première ouverture", () => {
  it("crée la page si elle n'existe pas encore", () => {
    h.row = null;
    render(<PortalEditorPage variant="superadmin" />);
    expect(h.ensure).toHaveBeenCalledWith("org-1");
  });

  it("dit que la page n'a jamais été publiée", () => {
    render(<PortalEditorPage variant="superadmin" />);
    expect(screen.getByTestId("status").textContent).toMatch(/jamais publiée/);
  });
});

describe("PortalEditorPage — sauvegarde automatique", () => {
  it("une rafale de modifications ne produit qu'UNE écriture, avec le dernier état", () => {
    render(<PortalEditorPage variant="superadmin" />);
    const edit = screen.getByRole("button", { name: "modifier" });

    fireEvent.click(edit);
    fireEvent.click(edit);
    fireEvent.click(edit);
    expect(h.save).not.toHaveBeenCalled(); // rien ne part pendant la frappe

    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(h.save).toHaveBeenCalledTimes(1);
    const { draft } = h.save.mock.calls[0][0];
    expect(draft.sections[0].title).toBe("Titre 3");
  });

  it("n'écrit JAMAIS sur published — sauvegarder n'est pas publier", () => {
    render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "modifier" }));
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.save.mock.calls[0][0]).not.toHaveProperty("published");
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("écrit ce qui reste en attente quand on quitte l'éditeur", () => {
    const { unmount } = render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "modifier" }));
    unmount();
    expect(h.save).toHaveBeenCalledTimes(1);
  });
});

describe("PortalEditorPage — publication", () => {
  it("demande confirmation, puis publie le DERNIER état, sauvegarde en attente comprise", () => {
    render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "modifier" }));
    fireEvent.click(screen.getByRole("button", { name: "publier" }));

    // La modale est ouverte, rien n'est encore parti.
    expect(h.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));

    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(h.publish.mock.calls[0][0].draft.sections[0].title).toBe("Titre 1");
    // Le minuteur est coupé : la publication a déjà écrit le brouillon.
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(h.save).not.toHaveBeenCalled();
  });
});

describe("PortalEditorPage — annulation", () => {
  it("rend le brouillon à la dernière publication, sans toucher à published", () => {
    h.row = rowFor(defaultPortalPage(), defaultPortalPage());
    render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "annuler" }));
    expect(screen.getByText(/reviendra à la dernière composition publiée/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Annuler les modifications" }));
    expect(h.discard).toHaveBeenCalledTimes(1);
    expect(h.discard.mock.calls[0][0]).toMatchObject({ id: "page-1" });
    expect(h.discard.mock.calls[0][0].published).not.toBeNull();
  });

  it("prévient que sans publication, le brouillon reviendra au défaut", () => {
    render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "annuler" }));
    expect(screen.getByText(/composition par défaut/)).toBeTruthy();
  });
});
