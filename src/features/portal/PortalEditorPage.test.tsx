// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AUTOSAVE_DELAY_MS, PortalEditorPage } from "./PortalEditorPage";
import { defaultPortalPage, type PortalPage } from "./portalPage";
import { defaultPortalTheme, type PortalTheme } from "./portalTheme";
import { defaultPortalContent, type PortalContent } from "./portalContent";
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
  themeRow: null as Record<string, unknown> | null,
  statementRow: null as Record<string, unknown> | null,
  ensure: vi.fn(),
  ensureTheme: vi.fn(),
  ensureStatement: vi.fn(),
  save: vi.fn(),
  saveTheme: vi.fn(),
  saveStatement: vi.fn(),
  publish: vi.fn(),
  publishTheme: vi.fn(),
  publishStatement: vi.fn(),
  discard: vi.fn(),
  discardTheme: vi.fn(),
  discardStatement: vi.fn(),
  navigate: vi.fn(),
  edits: 0,
  themeEdits: 0,
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
  usePublishPortalPage: () => ({
    mutate: h.publish,
    mutateAsync: h.publish,
    isPending: false,
    isError: false,
    reset: () => {},
  }),
  useDiscardDraft: () => ({
    mutate: h.discard,
    mutateAsync: h.discard,
    isPending: false,
    isError: false,
    reset: () => {},
  }),
}));

// Le thème vit dans sa propre table, mais dans le même éditeur : mêmes gestes,
// même minuteur, même publication.
vi.mock("@/features/portal/usePortalTheme", () => ({
  usePortalTheme: () => ({ data: h.themeRow, isLoading: false }),
  useEnsurePortalTheme: () => ({ mutate: h.ensureTheme, isIdle: true, isError: false }),
  useSaveThemeDraft: () => ({ mutate: h.saveTheme, isPending: false, isError: false }),
  usePublishPortalTheme: () => ({
    mutate: h.publishTheme,
    mutateAsync: h.publishTheme,
    isPending: false,
    isError: false,
    reset: () => {},
  }),
  useDiscardThemeDraft: () => ({
    mutate: h.discardTheme,
    mutateAsync: h.discardTheme,
    isPending: false,
    isError: false,
    reset: () => {},
  }),
}));

// Les contenus (la déclaration d'accessibilité) : même motif, troisième table.
vi.mock("@/features/portal/usePortalContent", () => ({
  usePortalContent: () => ({ data: h.statementRow, isLoading: false }),
  useEnsurePortalContent: () => ({ mutate: h.ensureStatement, isIdle: true, isError: false }),
  useSaveContentDraft: () => ({ mutate: h.saveStatement, isPending: false, isError: false }),
  usePublishPortalContent: () => ({
    mutate: h.publishStatement,
    mutateAsync: h.publishStatement,
    isPending: false,
    isError: false,
    reset: () => {},
  }),
  useDiscardContentDraft: () => ({
    mutate: h.discardStatement,
    mutateAsync: h.discardStatement,
    isPending: false,
    isError: false,
    reset: () => {},
  }),
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
    const editTheme = () => {
      h.themeEdits += 1;
      props.onThemeChange({
        ...props.theme,
        shapes: { ...props.theme.shapes, radius: h.themeEdits % 2 === 0 ? "round" : "square" },
      });
    };
    return (
      <div>
        <span data-testid="status">{props.statusLine}</span>
        <button type="button" onClick={edit}>modifier</button>
        <button type="button" onClick={editTheme}>régler le thème</button>
        <button
          type="button"
          onClick={() => props.onStatementChange({ body: props.statement.body + "x" })}
        >
          écrire la déclaration
        </button>
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

function statementRowFor(draft: PortalContent, published: PortalContent | null = null) {
  return {
    id: "content-1",
    organization_id: "org-1",
    slug: "accessibilite",
    draft,
    published,
    published_at: published ? "2026-09-01T10:00:00Z" : null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
  };
}

function themeRowFor(draft: PortalTheme, published: PortalTheme | null = null) {
  return {
    id: "theme-1",
    organization_id: "org-1",
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
  h.themeRow = themeRowFor(defaultPortalTheme());
  h.statementRow = statementRowFor(defaultPortalContent());
  h.edits = 0;
  h.themeEdits = 0;
  h.ensure.mockReset();
  h.ensureTheme.mockReset();
  h.ensureStatement.mockReset();
  h.save.mockReset();
  h.saveTheme.mockReset();
  h.saveStatement.mockReset();
  h.publish.mockReset().mockResolvedValue(undefined);
  h.publishTheme.mockReset().mockResolvedValue(undefined);
  h.publishStatement.mockReset().mockResolvedValue(undefined);
  h.discard.mockReset().mockResolvedValue(defaultPortalPage());
  h.discardTheme.mockReset().mockResolvedValue(defaultPortalTheme());
  h.discardStatement.mockReset().mockResolvedValue(defaultPortalContent());
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

  it("crée aussi le thème s'il n'existe pas encore", () => {
    h.themeRow = null;
    render(<PortalEditorPage variant="superadmin" />);
    expect(h.ensureTheme).toHaveBeenCalledWith("org-1");
  });

  it("crée aussi la déclaration d'accessibilité si elle n'existe pas encore", () => {
    h.statementRow = null;
    render(<PortalEditorPage variant="superadmin" />);
    expect(h.ensureStatement).toHaveBeenCalledWith({
      organizationId: "org-1",
      slug: "accessibilite",
    });
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

  it("un réglage de thème n'écrit QUE le thème, et vice-versa", () => {
    render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "régler le thème" }));
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(h.saveTheme).toHaveBeenCalledTimes(1);
    expect(h.saveTheme.mock.calls[0][0]).toMatchObject({ id: "theme-1" });
    expect(h.save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "modifier" }));
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.saveTheme).toHaveBeenCalledTimes(1);
  });

  it("la déclaration a sa propre écriture, dans le même minuteur", () => {
    render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "écrire la déclaration" }));
    fireEvent.click(screen.getByRole("button", { name: "écrire la déclaration" }));
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(h.saveStatement).toHaveBeenCalledTimes(1);
    expect(h.saveStatement.mock.calls[0][0]).toEqual({ id: "content-1", draft: { body: "xx" } });
    expect(h.save).not.toHaveBeenCalled();
    expect(h.saveTheme).not.toHaveBeenCalled();
  });

  it("écrit ce qui reste en attente quand on quitte l'éditeur", () => {
    const { unmount } = render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "modifier" }));
    unmount();
    expect(h.save).toHaveBeenCalledTimes(1);
  });
});

describe("PortalEditorPage — publication", () => {
  it("demande confirmation, puis publie le DERNIER état, sauvegarde en attente comprise", async () => {
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

  it("publier, c'est publier SON SITE : la composition, le thème ET la déclaration", async () => {
    render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "régler le thème" }));
    fireEvent.click(screen.getByRole("button", { name: "écrire la déclaration" }));
    fireEvent.click(screen.getByRole("button", { name: "publier" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    });

    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(h.publishTheme).toHaveBeenCalledTimes(1);
    expect(h.publishTheme.mock.calls[0][0]).toMatchObject({ id: "theme-1" });
    expect(h.publishTheme.mock.calls[0][0].draft.shapes.radius).toBe("square");
    expect(h.publishStatement).toHaveBeenCalledTimes(1);
    expect(h.publishStatement.mock.calls[0][0]).toEqual({ id: "content-1", draft: { body: "x" } });
    // Le minuteur est coupé : la déclaration en attente est partie avec la publication.
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    });
    expect(h.saveStatement).not.toHaveBeenCalled();
  });

  it("une publication à moitié faite laisse la modale ouverte", async () => {
    h.publishTheme.mockRejectedValue(new Error("refus RLS"));
    render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "publier" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    });

    // Le bouton de la modale est toujours là : c'est d'ici que l'agent reprend.
    expect(screen.getByRole("button", { name: "Publier" })).toBeTruthy();
  });
});

describe("PortalEditorPage — annulation", () => {
  it("rend le brouillon à la dernière publication, sans toucher à published", async () => {
    h.row = rowFor(defaultPortalPage(), defaultPortalPage());
    h.themeRow = themeRowFor(defaultPortalTheme(), defaultPortalTheme());
    render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "annuler" }));
    expect(screen.getByText(/reviendra à la dernière version publiée/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Annuler les modifications" }));
    });
    expect(h.discard).toHaveBeenCalledTimes(1);
    expect(h.discard.mock.calls[0][0]).toMatchObject({ id: "page-1" });
    expect(h.discard.mock.calls[0][0].published).not.toBeNull();
    // Le thème revient avec elle : annuler, c'est annuler ce qu'on voit.
    expect(h.discardTheme).toHaveBeenCalledTimes(1);
    expect(h.discardTheme.mock.calls[0][0]).toMatchObject({ id: "theme-1" });
    // Et la déclaration aussi.
    expect(h.discardStatement).toHaveBeenCalledTimes(1);
    expect(h.discardStatement.mock.calls[0][0]).toMatchObject({ id: "content-1" });
  });

  it("prévient que sans publication, le brouillon reviendra au défaut", () => {
    render(<PortalEditorPage variant="superadmin" />);
    fireEvent.click(screen.getByRole("button", { name: "annuler" }));
    expect(screen.getByText(/au thème par défaut/)).toBeTruthy();
  });
});
