// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { emptyAudience, parseAudience } from "./audience";

/**
 * La page Fréquentation (navigation v2). Graphiques remplacés par un pantin,
 * comme pour le tableau de bord : jsdom ne dessine rien.
 */
const h = vi.hoisted(() => ({
  organizations: [] as { id: string; name: string }[],
  audience: null as unknown,
  languages: ["fr"] as string[],
  chartProps: null as Record<string, unknown> | null,
  calls: [] as Array<[string | null, string]>,
}));

vi.mock("@/features/procedures/useWritableRootOrganizations", () => ({
  useWritableRootOrganizations: () => ({ data: h.organizations, isLoading: false, isError: false }),
}));
vi.mock("@/features/languages/useOrganizationLanguages", () => ({
  useOrganizationLanguages: () => ({ data: h.languages }),
}));
vi.mock("./useDashboard", () => ({
  usePortalAudience: (org: string | null, period: string) => {
    h.calls.push([org, period]);
    return {
      data: {
        audience: h.audience === null ? emptyAudience() : parseAudience(h.audience),
        range: { from: "2026-09-06", to: "2026-09-12" },
      },
      isLoading: false,
    };
  },
}));
vi.mock("./AudienceCharts", () => ({
  default: (props: Record<string, unknown>) => {
    h.chartProps = props;
    return <div data-testid="charts" />;
  },
}));

import { AudiencePage } from "./AudiencePage";

function renderPage(path = "/site-de-demarches/frequentation") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AudiencePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.organizations = [{ id: "a", name: "Ville" }];
  h.audience = {
    days: [{ day: "2026-09-12", views: 16, visits: 7, deposits: 2 }],
    totals: { views: 16, visits: 7, deposits: 2, form_views: 5 },
    pages: [{ page: "accueil", views: 9 }],
    breakdown: [{ dimension: "appareil", value: "mobile", views: 11, visits: 5 }],
  };
  h.languages = ["fr"];
  h.chartProps = null;
  h.calls = [];
});

describe("AudiencePage", () => {
  it("se range sous « Site de démarches » et rappelle la méthode de mesure", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Fréquentation" })).toBeTruthy();
    expect(screen.getByText(/Site de démarches/)).toBeTruthy();
    expect(screen.getByText(/pas un visiteur unique/)).toBeTruthy();
  });

  it("affiche les trois tuiles et le taux de dépôt", () => {
    renderPage();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("16")).toBeTruthy();
    expect(screen.getByText("soit 40 % des formulaires ouverts")).toBeTruthy();
  });

  it("propose les trois périodes, 30 jours par défaut, et en change au clic", () => {
    renderPage();
    for (const label of ["7 jours", "30 jours", "1 an"]) {
      expect(screen.getByRole("tab", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("tab", { name: "30 jours" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "7 jours" }));
    expect(h.calls.at(-1)).toEqual(["a", "7d"]);
  });

  // ⚠️ Un découpage à une seule part n'en est pas un : « 100 % français » sur
  // une collectivité monolingue occuperait une carte pour ne rien dire.
  it("n'affiche le camembert des langues que pour une collectivité multilingue", async () => {
    renderPage();
    await screen.findByTestId("charts");
    expect(h.chartProps?.multilingual).toBe(false);
  });

  it("l'affiche dès une seconde langue", async () => {
    h.languages = ["fr", "oc"];
    renderPage();
    await screen.findByTestId("charts");
    expect(h.chartProps?.multilingual).toBe(true);
  });

  it("ouvre la collectivité demandée par l'URL", () => {
    h.organizations = [
      { id: "a", name: "Ville" },
      { id: "b", name: "Agglo" },
    ];
    renderPage("/site-de-demarches/frequentation?org=b");
    expect((screen.getByLabelText("Organisation") as HTMLSelectElement).value).toBe("b");
    expect(h.calls.at(-1)?.[0]).toBe("b");
  });

  it("ignore une collectivité inconnue", () => {
    h.organizations = [
      { id: "a", name: "Ville" },
      { id: "b", name: "Agglo" },
    ];
    renderPage("/site-de-demarches/frequentation?org=disparue");
    expect((screen.getByLabelText("Organisation") as HTMLSelectElement).value).toBe("a");
  });

  it("explique l'absence de collectivité au lieu d'afficher des zéros", () => {
    h.organizations = [];
    renderPage();
    expect(screen.getByText(/Aucune organisation principale/)).toBeTruthy();
    expect(screen.queryByText("Visites")).toBeNull();
  });
});
