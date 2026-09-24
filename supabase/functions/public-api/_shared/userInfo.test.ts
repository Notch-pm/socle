import { describe, expect, it } from "vitest";
import {
  isUserInfoEmpty,
  parseUserInfo,
  serializePortalOrganizationsInfo,
  type UserInfoOrganization,
} from "./userInfo.ts";
// Le test, lui, peut lire `src/` : c'est la seule façon d'épingler que le
// miroir ne dérive pas (la fonction déployée, elle, n'en importe rien).
import { parseUserInfo as parseFront } from "../../../../src/features/organizations/userInfo.ts";

const STORED = {
  description: "La mairie vous accueille.",
  openingHours: "Lundi au vendredi : 8 h 30 – 12 h",
  faq: [{ question: "Rendez-vous ?", answer: "Non." }, { question: "", answer: "" }, "texte", [1]],
  physicalReception: "interne — ne sort pas",
};

describe("parseUserInfo (miroir edge)", () => {
  it("lit exactement comme l'écran du Socle", () => {
    for (const raw of [STORED, null, undefined, [], "texte", { faq: "pas une liste" }, { description: 3 }]) {
      expect(parseUserInfo(raw)).toEqual(parseFront(raw));
    }
  });

  it("ne laisse sortir que les trois rubriques du contrat", () => {
    expect(Object.keys(parseUserInfo(STORED))).toEqual(["description", "openingHours", "faq"]);
  });

  it("est idempotente après un aller-retour JSON — le consommateur re-parse", () => {
    const once = parseUserInfo(STORED);
    expect(parseUserInfo(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it("des blancs ne sont pas un texte", () => {
    expect(isUserInfoEmpty(parseUserInfo({ description: " ", openingHours: "" }))).toBe(true);
  });
});

describe("serializePortalOrganizationsInfo", () => {
  const TENANT = "00000000-0000-4000-8000-000000000001";
  const org = (over: Partial<UserInfoOrganization>): UserInfoOrganization => ({
    id: TENANT,
    name: "Mairie",
    slug: "mairie",
    parent_id: null,
    status: "active",
    is_internal_service: false,
    ...over,
  });
  const row = (organization_id: string, info: unknown) => ({
    organization_id,
    info,
    updated_at: "2026-09-24T08:00:00Z",
  });

  it("met la collectivité en tête, puis les organismes par nom", () => {
    const out = serializePortalOrganizationsInfo(
      TENANT,
      [
        org({ id: "b", name: "Médiathèque", parent_id: TENANT }),
        org({ id: "a", name: "CCAS", parent_id: TENANT, slug: "" }),
        org({}),
      ],
      [row("a", { openingHours: "Mardi" }), row("b", { description: "Livres" }), row(TENANT, STORED)],
    );
    expect(out.map((o) => o.name)).toEqual(["Mairie", "CCAS", "Médiathèque"]);
    expect(out[0].is_tenant).toBe(true);
    expect(out[1]).toMatchObject({ is_tenant: false, slug: null });
    expect(out[0].info).toEqual(parseUserInfo(STORED));
  });

  it("⚠️ n'expose ni service interne, ni organisme obsolète, ni fiche vide", () => {
    const out = serializePortalOrganizationsInfo(
      TENANT,
      [
        org({ id: "interne", name: "Service RH", is_internal_service: true }),
        org({ id: "obsolete", name: "Ancienne annexe", status: "obsolete" }),
        org({ id: "vide", name: "Annexe" }),
        org({ id: "muette", name: "Sans ligne" }),
      ],
      [
        row("interne", { openingHours: "Lundi" }),
        row("obsolete", { openingHours: "Lundi" }),
        row("vide", { description: "  ", faq: [{ question: "", answer: "" }] }),
      ],
    );
    expect(out).toEqual([]);
  });

  it("n'emprunte jamais les horaires du parent", () => {
    const out = serializePortalOrganizationsInfo(
      TENANT,
      [org({}), org({ id: "annexe", name: "Annexe", parent_id: TENANT })],
      [row(TENANT, { openingHours: "Lundi" })],
    );
    expect(out.map((o) => o.id)).toEqual([TENANT]);
  });
});
