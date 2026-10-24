// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  roots: [] as { id: string; name: string }[],
  procedures: [] as Array<Record<string, unknown>>,
  requested: [] as Array<string | undefined>,
}));

vi.mock("@/features/procedures/useWritableRootOrganizations", () => ({
  useWritableRootOrganizations: () => ({ data: h.roots, isLoading: false, isError: false }),
}));
vi.mock("@/features/procedures/useProcedures", () => ({
  useProceduresForOrg: (orgId: string | undefined) => {
    h.requested.push(orgId);
    return { data: h.procedures, isLoading: false };
  },
}));
vi.mock("@/features/categories/useCategories", () => ({
  useCategoriesQuery: () => ({ data: [{ id: "cat-ec", name: "État civil" }] }),
}));

import { ProcedureKnowledgePage } from "./ProcedureKnowledgePage";

const COMPLETE = {
  agentHelpText: "Aide.",
  faq: [{ question: "Q ?", answer: "R." }],
  aiSources: [{ url: "https://exemple.fr", description: "" }],
  guardrails: ["Ne pas promettre."],
};

function renderPage(path = "/connaissances/demarches") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ProcedureKnowledgePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.roots = [{ id: "ville", name: "Ville" }];
  h.procedures = [
    { id: "p1", name: "Acte de naissance", category_id: "cat-ec", knowledge_base: COMPLETE },
    { id: "p2", name: "Signalement voirie", category_id: null, knowledge_base: null },
  ];
  h.requested = [];
});

describe("ProcedureKnowledgePage", () => {
  it("dit l'état de chaque base, colonne par colonne", () => {
    renderPage();
    const complete = screen.getByRole("row", { name: /Acte de naissance/ });
    expect(complete.textContent).toContain("État civil");
    expect(complete.textContent).toContain("1 question");
    expect(screen.getByRole("row", { name: /Signalement voirie/ }).textContent).toContain("Vide");
    expect(screen.getByText("1 sur 2 complète")).toBeTruthy();
  });

  it("mène à l'étape « Base de connaissances » de l'éditeur de démarche", () => {
    renderPage();
    // Sixième étape du stepper, `?step=` à base 0.
    expect(screen.getByRole("link", { name: "Compléter la base de « Signalement voirie »" }).getAttribute("href")).toBe(
      "/demarches/p2?step=5",
    );
    expect(screen.getByRole("link", { name: "Ouvrir la base de « Acte de naissance »" })).toBeTruthy();
  });

  it("ne garde que les bases à compléter, sur demande", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Seulement les bases à compléter"));
    expect(screen.queryByRole("row", { name: /Acte de naissance/ })).toBeNull();
    expect(screen.getByRole("row", { name: /Signalement voirie/ })).toBeTruthy();
  });

  it("le dit quand tout est complet", () => {
    h.procedures = [h.procedures[0]];
    renderPage();
    fireEvent.click(screen.getByLabelText("Seulement les bases à compléter"));
    expect(screen.getByText("Toutes les bases sont complètes.")).toBeTruthy();
  });

  it("suit la collectivité demandée par l'URL", () => {
    h.roots = [
      { id: "ville", name: "Ville" },
      { id: "agglo", name: "Agglo" },
    ];
    renderPage("/connaissances/demarches?org=agglo");
    expect(h.requested.at(-1)).toBe("agglo");
  });

  it("annonce un catalogue vide", () => {
    h.procedures = [];
    renderPage();
    expect(screen.getByText("Aucune démarche dans le catalogue de cette organisation.")).toBeTruthy();
  });
});
