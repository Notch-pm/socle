// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

const h = vi.hoisted(() => ({
  orgs: [] as Organization[],
  filled: new Set<string>() as Set<string> | undefined,
  requestedIds: [] as string[][],
}));

vi.mock("@/features/superadmin/organizations/useOrganizationsAdmin", async () => {
  const real = await vi.importActual<typeof import("@/features/superadmin/organizations/orgTree")>(
    "@/features/superadmin/organizations/orgTree",
  );
  return {
    ...real,
    useAllOrganizations: () => ({ data: h.orgs, isLoading: false, isError: false }),
  };
});

import { OrganizationKnowledgePage } from "./OrganizationKnowledgePage";

const org = (id: string, name: string, parent_id: string | null = null, is_internal_service = false) =>
  ({ id, name, parent_id, is_internal_service }) as Organization;

function renderPage(path = "/connaissances/attributions") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <OrganizationKnowledgePage
        header={{ crumb: "Pour les agents", title: "Attributions", description: "…", audience: "interne", usedBy: ["Clara"] }}
        listLabel="Organismes"
        include={(o) => o.is_internal_service !== true}
        useFilled={(ids) => {
          h.requestedIds.push(ids);
          return { data: h.filled };
        }}
        renderEditor={(o) => <p>Éditeur de {o.name}</p>}
      />
    </MemoryRouter>,
  );
}

const list = () => screen.getByRole("navigation", { name: "Organismes" });

beforeEach(() => {
  h.orgs = [org("ville", "Ville"), org("annexe", "Annexe", "ville"), org("ec", "État civil", "ville", true)];
  h.filled = new Set(["ville"]);
  h.requestedIds = [];
});

describe("OrganizationKnowledgePage", () => {
  it("annonce à qui s'adresse le texte et qui le reprend", () => {
    renderPage();
    expect(screen.getByText("Interne")).toBeTruthy();
    expect(screen.getByText("Clara")).toBeTruthy();
  });

  it("liste les organismes retenus, dans l'ordre de l'arbre", () => {
    renderPage();
    const names = within(list()).getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["VilleRenseigné", "AnnexeÀ rédiger"]);
    // L'état n'est demandé que pour ceux-là.
    expect(h.requestedIds.at(-1)).toEqual(["ville", "annexe"]);
  });

  it("tait l'état tant qu'il n'est pas connu", () => {
    h.filled = undefined;
    renderPage();
    expect(within(list()).queryByText("À rédiger")).toBeNull();
  });

  it("ouvre le premier organisme par défaut, celui de l'URL sinon", () => {
    renderPage();
    expect(screen.getByText("Éditeur de Ville")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Fiche de l'organisation/ }).getAttribute("href")).toBe(
      "/organisations/ville",
    );
  });

  it("suit l'organisme demandé par l'URL", () => {
    renderPage("/connaissances/attributions?org=annexe");
    expect(screen.getByText("Éditeur de Annexe")).toBeTruthy();
    expect(within(list()).getByRole("button", { name: /Annexe/ }).getAttribute("aria-current")).toBe("true");
  });

  it("change d'organisme au clic", () => {
    renderPage();
    fireEvent.click(within(list()).getByRole("button", { name: /Annexe/ }));
    expect(screen.getByText("Éditeur de Annexe")).toBeTruthy();
  });

  it("ignore un organisme écarté demandé par l'URL", () => {
    renderPage("/connaissances/attributions?org=ec");
    expect(screen.getByText("Éditeur de Ville")).toBeTruthy();
  });
});
