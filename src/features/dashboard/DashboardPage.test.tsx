// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { emptyAudience, parseAudience } from "./audience";
import { emptyDashboardStats, parseDashboardStats } from "./dashboardStats";

/**
 * Ce fichier teste la PAGE — le sélecteur d'organisation, les valeurs
 * affichées, la période, et les deux états qui ne doivent pas mentir : aucune
 * collectivité visible, et aucune visite mesurée.
 *
 * ⚠️ Les GRAPHIQUES sont remplacés par un pantin : jsdom ne dessine rien, et
 * ApexCharts y échoue sur des mesures de SVG. Ce qui compte à leur place, c'est
 * QUE LEUR EST PASSÉ — les lignes du graphique par organisme, et la décision
 * d'afficher ou non le camembert des langues.
 */
const h = vi.hoisted(() => ({
  organizations: [] as { id: string; name: string }[],
  orgsLoading: false,
  stats: null as unknown,
  statsLoading: false,
  audience: null as unknown,
  audienceLoading: false,
  languages: ["fr"] as string[],
  chartProps: null as Record<string, unknown> | null,
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/features/procedures/useWritableRootOrganizations", () => ({
  useWritableRootOrganizations: () => ({
    data: h.organizations,
    isLoading: h.orgsLoading,
    isError: false,
  }),
}));

vi.mock("@/features/languages/useOrganizationLanguages", () => ({
  useOrganizationLanguages: () => ({ data: h.languages }),
}));

vi.mock("./useDashboard", () => ({
  useOrganizationDashboard: () => ({
    data: h.stats === null ? emptyDashboardStats() : parseDashboardStats(h.stats),
    isLoading: h.statsLoading,
  }),
  usePortalAudience: () => ({
    data: {
      audience: h.audience === null ? emptyAudience() : parseAudience(h.audience),
      range: { from: "2026-09-06", to: "2026-09-12" },
    },
    isLoading: h.audienceLoading,
  }),
}));

vi.mock("./DashboardCharts", () => ({
  default: (props: Record<string, unknown>) => {
    h.chartProps = props;
    return <div data-testid="charts" />;
  },
}));

const STATS = {
  procedures: { total: 12, production: 5 },
  contacts: { total: 40, personne: 30, entreprise: 6, association: 3, administration: 1 },
  organizations: [
    { id: "a", name: "Ville", parent_id: null, enabled_procedures: 2 },
    { id: "b", name: "Urbanisme", parent_id: "a", is_internal_service: true, enabled_procedures: 7 },
  ],
};

const AUDIENCE = {
  days: [{ day: "2026-09-12", views: 16, visits: 7, deposits: 2 }],
  totals: { views: 16, visits: 7, deposits: 2, form_views: 5 },
  pages: [{ page: "accueil", views: 9 }],
  breakdown: [
    { dimension: "langue", value: "fr", views: 14, visits: 6 },
    { dimension: "appareil", value: "mobile", views: 11, visits: 5 },
  ],
};

beforeEach(() => {
  h.organizations = [{ id: "a", name: "Ville" }];
  h.orgsLoading = false;
  h.stats = STATS;
  h.statsLoading = false;
  h.audience = AUDIENCE;
  h.audienceLoading = false;
  h.languages = ["fr"];
  h.chartProps = null;
});

describe("les chiffres du référentiel", () => {
  it("affiche les cinq tuiles, avec leurs sous-lignes", async () => {
    render(<DashboardPage />);
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("5 en production · 7 en brouillon")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText("Fiches actives · dont 1 administration")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("mène de la tuile « Démarches » à l'écran des démarches", () => {
    render(<DashboardPage />);
    const link = screen.getByText("Démarches").closest("a");
    expect(link?.getAttribute("href")).toBe("/demarches");
  });

  it("passe au graphique les organismes qui portent des démarches", async () => {
    render(<DashboardPage />);
    await screen.findByTestId("charts");
    expect(h.chartProps?.activations).toEqual([
      { id: "b", name: "Urbanisme", count: 7 },
      { id: "a", name: "Ville", count: 2 },
    ]);
  });
});

describe("la fréquentation", () => {
  it("affiche les trois tuiles et le taux de dépôt", () => {
    render(<DashboardPage />);
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("16")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("soit 40 % des formulaires ouverts")).toBeTruthy();
  });

  // ⚠️ L'ÉTAT NORMAL tant que le portail ne mesure pas. L'écran le dit au lieu
  // de masquer la section : masquer ferait chercher un réglage qui n'existe pas.
  it("annonce l'absence de formulaire ouvert plutôt qu'un taux de 0 %", () => {
    h.audience = { totals: { views: 0, visits: 0, deposits: 0, form_views: 0 } };
    render(<DashboardPage />);
    expect(screen.getByText("Aucun formulaire ouvert")).toBeTruthy();
    expect(screen.queryByText(/0 % des formulaires/)).toBeNull();
  });

  it("rappelle la méthode de mesure, sans cookie", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/sans cookie/)).toBeTruthy();
    expect(screen.getByText(/pas un visiteur unique/)).toBeTruthy();
  });

  it("propose les trois périodes, 30 jours par défaut", () => {
    render(<DashboardPage />);
    for (const label of ["7 jours", "30 jours", "1 an"]) {
      expect(screen.getByRole("tab", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("tab", { name: "30 jours" }).getAttribute("aria-selected")).toBe("true");
  });

  it("change de période au clic", () => {
    render(<DashboardPage />);
    fireEvent.click(screen.getByRole("tab", { name: "7 jours" }));
    expect(screen.getByRole("tab", { name: "7 jours" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("le camembert des langues suit la collectivité", () => {
  // ⚠️ Un découpage à une seule part n'en est pas un : « 100 % français » sur
  // une collectivité monolingue occuperait une carte pour ne rien dire.
  it("n'est pas demandé quand la collectivité est monolingue", async () => {
    render(<DashboardPage />);
    await screen.findByTestId("charts");
    expect(h.chartProps?.multilingual).toBe(false);
  });

  it("l'est dès qu'une seconde langue est activée", async () => {
    h.languages = ["fr", "oc"];
    render(<DashboardPage />);
    await screen.findByTestId("charts");
    expect(h.chartProps?.multilingual).toBe(true);
  });
});

describe("le sélecteur d'organisation", () => {
  it("reste caché quand il n'y a qu'une collectivité", () => {
    render(<DashboardPage />);
    expect(screen.queryByLabelText("Organisation")).toBeNull();
  });

  it("apparaît dès la seconde, et change les chiffres affichés", () => {
    h.organizations = [{ id: "a", name: "Ville" }, { id: "b", name: "Agglo" }];
    render(<DashboardPage />);
    const select = screen.getByLabelText("Organisation") as HTMLSelectElement;
    expect(select.value).toBe("a");
    fireEvent.change(select, { target: { value: "b" } });
    expect((screen.getByLabelText("Organisation") as HTMLSelectElement).value).toBe("b");
  });
});

describe("les deux états qui ne doivent pas mentir", () => {
  it("montre un squelette pendant le chargement des organisations", () => {
    h.orgsLoading = true;
    const { container } = render(<DashboardPage />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText("Démarches")).toBeNull();
  });

  // ⚠️ Un membre rattaché seulement à des sous-organisations : afficher des
  // zéros les ferait passer pour la réalité.
  it("explique l'absence de collectivité au lieu d'afficher des zéros", () => {
    h.organizations = [];
    render(<DashboardPage />);
    expect(screen.getByText(/Aucune organisation principale/)).toBeTruthy();
    expect(screen.queryByText("Fréquentation du site de démarches")).toBeNull();
  });
});
