// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivationsSection } from "./ActivationsSection";
import type { Organization } from "@/features/superadmin/organizations/orgTree";

function org(id: string, name: string, parent_id: string | null, over: Partial<Organization> = {}): Organization {
  return {
    id,
    name,
    parent_id,
    is_internal_service: false,
    address: null,
    created_at: null,
    email: null,
    email_sender_name: null,
    email_sender_override: false,
    enabled_languages: ["fr"],
    logo_url: null,
    logo_white_url: null,
    primary_color: null,
    secondary_color: null,
    branding_inherit_parent: false,
    metadata: {},
    phone: null,
    slug: null,
    status: "active",
    type: null,
    ...over,
  } as Organization;
}

const ROOT = org("root", "Agglo", null);
const ORGS = [
  ROOT,
  org("m1", "Mairie B", "root"),
  org("m2", "Mairie A", "root"),
  org("svc", "État civil", "m2", { is_internal_service: true }),
  org("other", "Autre client", null),
];

vi.mock("@/features/superadmin/organizations/useOrganizationsAdmin", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/features/superadmin/organizations/useOrganizationsAdmin")
  >();
  return { ...actual, useAllOrganizations: () => ({ data: ORGS, isLoading: false }) };
});

// L'onglet partagé est éprouvé par ses propres tests : ici on vérifie qu'il
// reçoit l'organisme choisi, pas ce qu'il en fait.
vi.mock("@/features/organizations/OrganizationProceduresTab", () => ({
  OrganizationProceduresTab: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="tab">{organizationId}</div>
  ),
}));

describe("ActivationsSection", () => {
  it("propose l'organisation et sa descendance, pas les autres clients", () => {
    render(<ActivationsSection organization={ROOT} />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options[0]).toBe("Agglo");
    expect(options).toContain("Mairie A");
    expect(options).toContain("Mairie B");
    expect(options.some((label) => label?.startsWith("État civil"))).toBe(true);
    expect(options).not.toContain("Autre client");
  });

  it("nomme le service interne comme tel", () => {
    render(<ActivationsSection organization={ROOT} />);
    expect(screen.getByRole("option", { name: /État civil — service interne/ })).toBeTruthy();
  });

  it("monte l'onglet sur l'organisme choisi", () => {
    render(<ActivationsSection organization={ROOT} />);
    expect(screen.getByTestId("tab").textContent).toBe("root");
    fireEvent.change(screen.getByLabelText(/Organisme/), { target: { value: "m2" } });
    expect(screen.getByTestId("tab").textContent).toBe("m2");
  });
});
