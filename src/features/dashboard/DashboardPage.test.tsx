// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { emptyAudience, parseAudience } from "./audience";
import { emptyDashboardStats, parseDashboardStats } from "./dashboardStats";

/**
 * Ce fichier teste la PAGE — le sélecteur d'organisation, les valeurs
 * affichées, l'aperçu de fréquentation (30 jours, renvoi au détail), et les
 * deux états qui ne doivent pas mentir : aucune collectivité visible, et
 * aucune visite mesurée. La période, les langues et les appareils vivent sur
 * la page Fréquentation (`AudiencePage.test.tsx`).
 *
 * ⚠️ Les GRAPHIQUES sont remplacés par un pantin : jsdom ne dessine rien, et
 * ApexCharts y échoue sur des mesures de SVG. Ce qui compte à leur place, c'est
 * QUE LEUR EST PASSÉ — les lignes du graphique par organisme.
 */
const h = vi.hoisted(() => ({
  organizations: [] as { id: string; name: string }[],
  orgsLoading: false,
  stats: null as unknown,
  statsLoading: false,
  audience: null as unknown,
  audienceLoading: false,
  chartProps: null as Record<string, unknown> | null,
  periods: [] as string[],
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

vi.mock("./useDashboard", () => ({
  useOrganizationDashboard: () => ({
    data: h.stats === null ? emptyDashboardStats() : parseDashboardStats(h.stats),
    isLoading: h.statsLoading,
  }),
  usePortalAudience: (_org: string | null, period: string) => {
    h.periods.push(period);
    return {
    data: {
      audience: h.audience === null ? emptyAudience() : parseAudience(h.audience),
      range: { from: "2026-09-06", to: "2026-09-12" },
    },
    isLoading: h.audienceLoading,
    };
  },
}));

vi.mock("./DashboardCharts", () => ({
  ActivationsChart: (props: Record<string, unknown>) => {
    h.chartProps = props;
    return <div data-testid="charts" />;
  },
  TrafficChart: () => <div data-testid="traffic" />,
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
  h.chartProps = null;
  h.periods = [];
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
    expect(h.chartProps?.rows).toEqual([
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

  it("n'est qu'un aperçu sur 30 jours, sans choix de période", async () => {
    render(<DashboardPage />);
    await screen.findByTestId("traffic");
    expect(new Set(h.periods)).toEqual(new Set(["30d"]));
    expect(screen.queryByRole("tab", { name: "7 jours" })).toBeNull();
  });

  it("renvoie au détail, sur la même collectivité", () => {
    render(<DashboardPage />);
    expect(screen.getByText("Voir le détail").closest("a")?.getAttribute("href")).toBe(
      "/site-de-demarches/frequentation?org=a",
    );
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
