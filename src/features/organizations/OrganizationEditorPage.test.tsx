// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

const h = vi.hoisted(() => ({
  orgs: [] as Organization[],
  generalProps: [] as Array<{ withEmailSender?: boolean }>,
}));

vi.mock("@/features/superadmin/organizations/useOrganizationsAdmin", async () => {
  const real = await vi.importActual<typeof import("@/features/superadmin/organizations/orgTree")>(
    "@/features/superadmin/organizations/orgTree",
  );
  return {
    ...real,
    useAllOrganizations: () => ({ data: h.orgs }),
    useOrganization: (id: string | undefined) => ({
      data: h.orgs.find((o) => o.id === id),
      isLoading: false,
    }),
  };
});
// Les sections ont leurs propres tests : ici, seul compte ce que la page monte.
vi.mock("@/features/organizations/OrganizationInfoTab", () => ({
  GeneralInfoForm: (props: { withEmailSender?: boolean }) => {
    h.generalProps.push(props);
    return <p>Formulaire général</p>;
  },
  ChildOrganizations: () => <p>Liste des sous-organisations</p>,
  EmailSenderForm: () => <p>Formulaire expéditeur</p>,
}));
vi.mock("@/features/superadmin/organizations/sections/SmtpSettingsSection", () => ({
  SmtpSettingsSection: () => <p>Serveur SMTP</p>,
}));
vi.mock("@/features/organizations/OrganizationProceduresTab", () => ({
  OrganizationProceduresTab: () => <p>Activation des démarches</p>,
}));
vi.mock("@/features/organizations/BrandingSection", () => ({ BrandingSection: () => <p>Charte</p> }));
vi.mock("@/features/organizations/DomainsSection", () => ({ DomainsSection: () => <p>Domaines</p> }));
vi.mock("@/features/languages/LanguagesSection", () => ({ LanguagesSection: () => <p>Langues</p> }));
vi.mock("@/features/organizations/FreeMailSection", () => ({ FreeMailSection: () => <p>Courrier libre</p> }));

import { OrganizationEditorPage } from "./OrganizationEditorPage";

const org = (id: string, name: string, parent_id: string | null = null, is_internal_service = false) =>
  ({ id, name, parent_id, is_internal_service }) as Organization;

function renderEditor(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/organisations/:orgId" element={<OrganizationEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const menu = () => screen.getByRole("navigation", { name: "Sections de l'organisation" });

beforeEach(() => {
  h.orgs = [org("ville", "Ville"), org("annexe", "Annexe", "ville"), org("ec", "État civil", "ville", true)];
  h.generalProps = [];
});

describe("OrganizationEditorPage", () => {
  it("ouvre les informations générales, sans l'expéditeur", () => {
    renderEditor("/organisations/ville");
    expect(screen.getByText("Formulaire général")).toBeTruthy();
    expect(h.generalProps.at(-1)?.withEmailSender).toBe(false);
    expect(screen.getByText("Organisation principale")).toBeTruthy();
  });

  it("range l'expéditeur avec le serveur SMTP", () => {
    renderEditor("/organisations/ville?section=emails");
    expect(screen.getByText("Formulaire expéditeur")).toBeTruthy();
    expect(screen.getByText("Serveur SMTP")).toBeTruthy();
  });

  it("change de section au clic", () => {
    renderEditor("/organisations/ville");
    fireEvent.click(within(menu()).getByRole("button", { name: /Sous-organisations/ }));
    expect(screen.getByText("Liste des sous-organisations")).toBeTruthy();
    expect(within(menu()).getByRole("button", { name: /Sous-organisations/ }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("nomme le parent d'une sous-organisation et cadenasse ses langues", () => {
    renderEditor("/organisations/annexe");
    expect(screen.getByText("Sous-organisation de Ville")).toBeTruthy();
    const langues = within(menu()).getByRole("button", { name: /Langues/ });
    expect(langues.textContent).toContain("réglé sur l'organisation principale");
  });

  it("⚠️ un service interne : ni domaines, ni courrier libre, ni informations usagers", () => {
    renderEditor("/organisations/ec?section=demarches");
    expect(screen.getByText("Service interne")).toBeTruthy();
    expect(within(menu()).queryByRole("button", { name: /Domaines/ })).toBeNull();
    expect(screen.getByText("Activation des démarches")).toBeTruthy();
    expect(screen.queryByText("Courrier libre")).toBeNull();
    expect(screen.queryByRole("link", { name: /Informations usagers/ })).toBeNull();
  });

  it("renvoie aux pages Connaissances, les recommandations sur la racine", () => {
    renderEditor("/organisations/annexe");
    expect(screen.getByRole("link", { name: /Attributions/ }).getAttribute("href")).toBe(
      "/connaissances/attributions?org=annexe",
    );
    expect(screen.getByRole("link", { name: /Recommandations \(Ville\)/ }).getAttribute("href")).toBe(
      "/connaissances/recommandations?org=ville",
    );
  });
});
