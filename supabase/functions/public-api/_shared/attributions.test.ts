import { describe, expect, it } from "vitest";
import {
  MAX_ATTRIBUTIONS_LENGTH,
  serializeOrganizationAttributions,
  type AttributionsOrganization,
} from "./attributions.ts";
// Le test, lui, peut lire `src/` : c'est la seule façon d'épingler que le
// miroir ne dérive pas (la fonction déployée, elle, n'en importe rien).
import { MAX_ATTRIBUTIONS_LENGTH as MAX_FRONT } from "../../../../src/features/organizations/attributions.ts";

const TENANT = "00000000-0000-0000-0000-000000000001";

function org(id: string, name: string, over: Partial<AttributionsOrganization> = {}): AttributionsOrganization {
  return { id, name, status: "active", is_internal_service: false, ...over };
}

function row(organization_id: string, attributions: unknown, updated_at: unknown = "2026-10-01T08:00:00Z") {
  return { organization_id, attributions, updated_at };
}

describe("serializeOrganizationAttributions", () => {
  it("⚠️ inclut les services internes — ce sont souvent eux qui instruisent", () => {
    const out = serializeOrganizationAttributions(
      TENANT,
      [org("st", "Services techniques", { is_internal_service: true })],
      [row("st", "Voirie, éclairage public.")],
    );
    expect(out).toEqual([
      {
        id: "st",
        name: "Services techniques",
        is_internal_service: true,
        attributions: "Voirie, éclairage public.",
        updated_at: "2026-10-01T08:00:00Z",
      },
    ]);
  });

  it("écarte les organismes obsolètes, sans texte, ou au texte blanc", () => {
    const out = serializeOrganizationAttributions(
      TENANT,
      [
        org("a", "Obsolète", { status: "obsolete" }),
        org("b", "Sans ligne"),
        org("c", "Blanc"),
        org("d", "Pas une chaîne"),
        org("e", "Écrit"),
      ],
      [row("a", "Texte"), row("c", "  \n "), row("d", 42), row("e", "  Urbanisme \n")],
    );
    expect(out.map((entry) => entry.id)).toEqual(["e"]);
    expect(out[0].attributions).toBe("Urbanisme");
  });

  it("pas d'héritage : un enfant sans texte n'emprunte pas celui de son parent", () => {
    const out = serializeOrganizationAttributions(
      TENANT,
      [org(TENANT, "Mairie"), org("enfant", "Annexe")],
      [row(TENANT, "Tout ce qui concerne la commune.")],
    );
    expect(out.map((entry) => entry.id)).toEqual([TENANT]);
  });

  it("la collectivité en tête, puis par nom (ordre français)", () => {
    const out = serializeOrganizationAttributions(
      TENANT,
      [org("u", "Urbanisme"), org("e", "État civil"), org(TENANT, "Mairie"), org("c", "Cabinet")],
      [row("u", "x"), row("e", "x"), row(TENANT, "x"), row("c", "x")],
    );
    expect(out.map((entry) => entry.name)).toEqual(["Mairie", "Cabinet", "État civil", "Urbanisme"]);
  });

  it("forme exacte du DTO : aucune clé en trop, updated_at null si illisible", () => {
    const [entry] = serializeOrganizationAttributions(
      TENANT,
      [{ ...org("a", "A"), is_internal_service: null }],
      [row("a", "x", 12)],
    );
    expect(Object.keys(entry)).toEqual(["id", "name", "is_internal_service", "attributions", "updated_at"]);
    expect(entry.is_internal_service).toBe(false);
    expect(entry.updated_at).toBeNull();
  });

  it("rien d'écrit ⇒ tableau vide", () => {
    expect(serializeOrganizationAttributions(TENANT, [org(TENANT, "Mairie")], [])).toEqual([]);
  });
});

describe("borne (miroir edge)", () => {
  it("même borne que l'écran du Socle (et que le CHECK de la table)", () => {
    expect(MAX_ATTRIBUTIONS_LENGTH).toBe(MAX_FRONT);
    expect(MAX_ATTRIBUTIONS_LENGTH).toBe(2000);
  });
});
