import { describe, expect, it } from "vitest";
import {
  accessRows,
  applicationAccessRefusal,
  parseAccessRequest,
  requestedOrganizationIds,
} from "./accessRequest";

const PAGE = "00000000-0000-4000-8000-000000000001";
const SVC_A = "00000000-0000-4000-8000-00000000000a";
const SVC_B = "00000000-0000-4000-8000-00000000000b";

describe("parseAccessRequest", () => {
  it("ancien contrat : sans listes d'organismes, l'organisme de la page", () => {
    expect(
      parseAccessRequest({ role: "consultant", applications: [{ application_id: "clara", role_code: "elu" }] }, PAGE),
    ).toEqual({
      socleRole: "consultant",
      socleOrganizationIds: [PAGE],
      applications: [{ application_id: "clara", role_code: "elu", organization_ids: [PAGE] }],
    });
  });

  it("lit les organismes choisis par application, sans doublon", () => {
    const request = parseAccessRequest(
      {
        role: "",
        socle_organization_ids: [SVC_A],
        applications: [{ application_id: "clara", role_code: "elu", organization_ids: [SVC_A, SVC_B, SVC_A] }],
      },
      PAGE,
    );
    // Sans rôle Socle, la liste du Socle est ignorée.
    expect(request).toEqual({
      socleRole: "",
      socleOrganizationIds: [],
      applications: [{ application_id: "clara", role_code: "elu", organization_ids: [SVC_A, SVC_B] }],
    });
    expect(requestedOrganizationIds(request!)).toEqual([SVC_A, SVC_B]);
  });

  it("refuse ce qui est mal formé", () => {
    expect(parseAccessRequest({ role: "super_admin" }, PAGE)).toBeNull();
    expect(parseAccessRequest({ role: "admin", socle_organization_ids: [] }, PAGE)).toBeNull();
    expect(parseAccessRequest({ role: "admin", socle_organization_ids: ["pas-un-uuid"] }, PAGE)).toBeNull();
    expect(parseAccessRequest({ applications: "clara" }, PAGE)).toBeNull();
    expect(
      parseAccessRequest(
        {
          applications: [
            { application_id: "clara", role_code: "elu" },
            { application_id: "clara", role_code: "consultant" },
          ],
        },
        PAGE,
      ),
    ).toBeNull();
  });
});

describe("applicationAccessRefusal", () => {
  const roles = [
    { application_id: "clara", code: "administrateur", is_admin: true },
    { application_id: "clara", code: "elu", is_admin: false },
  ];
  const subscribed = new Set(["clara"]);
  const request = (role_code: string, organization_ids: string[]) => ({
    socleRole: "",
    socleOrganizationIds: [],
    applications: [{ application_id: "clara", role_code, organization_ids }],
  });

  it("accepte un rôle simple sur des services", () => {
    expect(applicationAccessRefusal(request("elu", [SVC_A]), PAGE, subscribed, roles)).toBeNull();
  });

  it("l'administration exige la collectivité ; des services en plus sont permis", () => {
    expect(applicationAccessRefusal(request("administrateur", [PAGE, SVC_A]), PAGE, subscribed, roles)).toBeNull();
    expect(applicationAccessRefusal(request("administrateur", [SVC_A]), PAGE, subscribed, roles)).toMatch(
      /exige l'accès sur la collectivité/,
    );
  });

  it("abonnement et rôle connus", () => {
    expect(applicationAccessRefusal(request("elu", [PAGE]), PAGE, new Set(), roles)).toMatch(/pas abonnée/);
    expect(applicationAccessRefusal(request("inconnu", [PAGE]), PAGE, subscribed, roles)).toMatch(/Rôle inconnu/);
  });
});

describe("accessRows", () => {
  it("une ligne par organisme, la racine en tête", () => {
    const rows = accessRows(
      {
        socleRole: "",
        socleOrganizationIds: [],
        applications: [{ application_id: "clara", role_code: "administrateur", organization_ids: [SVC_A, PAGE] }],
      },
      "u-1",
      PAGE,
      "caller",
    );
    expect(rows.map((r) => r.organization_id)).toEqual([PAGE, SVC_A]);
    expect(rows[0]).toEqual({
      user_id: "u-1",
      organization_id: PAGE,
      application_id: "clara",
      role_code: "administrateur",
      created_by: "caller",
    });
  });
});
