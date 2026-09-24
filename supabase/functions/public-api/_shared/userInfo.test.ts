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
  openingHoursNotes: "Fermé les jours fériés.",
  openingHours: [
    { day: "saturday", morningOpen: "09:00", morningClose: null, afternoonOpen: null, afternoonClose: "12:00" },
    { day: "monday", morningOpen: "08:30", morningClose: "12:00", afternoonOpen: "13:30", afternoonClose: "17:00" },
    { day: "tuesday", morningOpen: "08:30", morningClose: "12:00", afternoonOpen: null, afternoonClose: "17:00" },
    { day: "wednesday", morningOpen: "14:00", morningClose: "", afternoonOpen: "", afternoonClose: "12:00" },
    { day: "friday", morningOpen: "09:00", morningClose: 12, afternoonOpen: "13:00", afternoonClose: "17:00" },
    { day: "dimanche", morningOpen: "09:00", afternoonClose: "12:00" },
    "texte",
  ],
  faq: [{ question: "Rendez-vous ?", answer: "Non." }, { question: "", answer: "" }, "texte", [1]],
  physicalReception: "interne — ne sort pas",
};

describe("parseUserInfo (miroir edge)", () => {
  it("lit exactement comme l'écran du Socle", () => {
    for (const raw of [
      STORED,
      null,
      undefined,
      [],
      "texte",
      { faq: "pas une liste" },
      { description: 3 },
      { openingHoursNotes: 4 },
      { openingHours: "Lundi : 9 h – 12 h" },
      { openingHours: [{ day: "monday", morningOpen: "08:00", afternoonClose: "18:00" }] },
    ]) {
      expect(parseUserInfo(raw)).toEqual(parseFront(raw));
    }
  });

  it("ne laisse sortir que les quatre rubriques du contrat", () => {
    expect(Object.keys(parseUserInfo(STORED))).toEqual(["description", "openingHours", "openingHoursNotes", "faq"]);
  });

  it("est idempotente après un aller-retour JSON — le consommateur re-parse", () => {
    const once = parseUserInfo(STORED);
    expect(parseUserInfo(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it("garde les jours valides dans l'ordre de la semaine, écarte le reste", () => {
    expect(parseUserInfo(STORED).openingHours.map((d) => d.day)).toEqual(["monday", "saturday"]);
  });

  it("des blancs ne sont pas un texte", () => {
    expect(isUserInfoEmpty(parseUserInfo({ description: " ", openingHours: [] }))).toBe(true);
  });
});

const TUESDAY = {
  day: "tuesday",
  morningOpen: "09:00",
  morningClose: null,
  afternoonOpen: null,
  afternoonClose: "12:00",
};

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
      [row("a", { openingHours: [TUESDAY] }), row("b", { description: "Livres" }), row(TENANT, STORED)],
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
        row("interne", { openingHours: [TUESDAY] }),
        row("obsolete", { openingHours: [TUESDAY] }),
        row("vide", { description: "  ", faq: [{ question: "", answer: "" }] }),
      ],
    );
    expect(out).toEqual([]);
  });

  it("n'emprunte jamais les horaires du parent", () => {
    const out = serializePortalOrganizationsInfo(
      TENANT,
      [org({}), org({ id: "annexe", name: "Annexe", parent_id: TENANT })],
      [row(TENANT, { openingHours: [TUESDAY] })],
    );
    expect(out.map((o) => o.id)).toEqual([TENANT]);
  });
});
