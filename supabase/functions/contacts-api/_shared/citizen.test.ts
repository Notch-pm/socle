import { describe, expect, it } from "vitest";
import { parseCitizenIdentity, parseCitizenUpdate, serializeCitizenContact } from "./citizen.ts";

const IDENTITY = {
  civility: "madame",
  first_name: "Jeanne",
  last_name: "Dupont",
  email: "Jeanne@Example.fr",
  address_line1: "12 rue Houdan",
  postal_code: "92330",
  city: "Sceaux",
};

describe("serializeCitizenContact", () => {
  it("ne laisse sortir que la liste blanche de l'usager", () => {
    const dto = serializeCitizenContact({
      id: "c1",
      ...IDENTITY,
      internal_notes: "connu des services pour…",
      roles: [{ code: "elu" }],
      external_references: [{ source: "clara", external_id: "x" }],
      quartier_id: "q1",
      organization_id: "o1",
    });
    const text = JSON.stringify(dto);
    for (const leak of ["connu des services", "elu", "clara", "q1", "o1"]) expect(text).not.toContain(leak);
    expect(dto.last_name).toBe("Dupont");
  });
});

describe("parseCitizenIdentity", () => {
  it("exige l'identité du CCTP et normalise l'adresse de courriel", () => {
    const parsed = parseCitizenIdentity(IDENTITY);
    expect(parsed.ok && parsed.value.email).toBe("jeanne@example.fr");
    expect(parsed.ok && parsed.value.mobile_phone).toBeNull();
  });

  it("refuse un champ inconnu, une identité incomplète, un code postal ou un téléphone invalides", () => {
    expect(parseCitizenIdentity({ ...IDENTITY, internal_notes: "x" }).ok).toBe(false);
    expect(parseCitizenIdentity({ ...IDENTITY, last_name: "" }).ok).toBe(false);
    expect(parseCitizenIdentity({ ...IDENTITY, civility: "docteur" }).ok).toBe(false);
    expect(parseCitizenIdentity({ ...IDENTITY, postal_code: "923" }).ok).toBe(false);
    expect(parseCitizenIdentity({ ...IDENTITY, mobile_phone: "abc" }).ok).toBe(false);
    expect(parseCitizenIdentity({ ...IDENTITY, email: "a@b.fr, c@d.fr" }).ok).toBe(false);
  });
});

describe("parseCitizenUpdate", () => {
  it("l'usager modifie ses coordonnées", () => {
    expect(parseCitizenUpdate({ mobile_phone: "06 12 34 56 78", city: "Sceaux" })).toEqual({
      ok: true,
      value: { mobile_phone: "06 12 34 56 78", city: "Sceaux" },
    });
  });

  it("mais pas son identité ni son adresse de courriel", () => {
    for (const key of ["last_name", "first_name", "birth_date", "civility", "email"]) {
      expect(parseCitizenUpdate({ [key]: "x" }).ok).toBe(false);
    }
    expect(parseCitizenUpdate({}).ok).toBe(false);
    expect(parseCitizenUpdate({ city: "" }).ok).toBe(false);
  });
});

describe("consentements de l'usager depuis son compte", () => {
  it("la phrase est celle d'Iris, mot pour mot", async () => {
    const { citizenConsentStatement } = await import("./citizen.ts");
    expect(citizenConsentStatement("traitement", "Ville de Sceaux")).toBe(
      "J'accepte que les informations fournies ici soient utilisées dans le cadre du traitement de ma demande.",
    );
    expect(citizenConsentStatement("partage", "Ville de Sceaux")).toBe(
      "J'accepte de partager ces informations avec les services de l'organisme « Ville de Sceaux » afin d'améliorer le traitement de ma demande et de mes futures demandes.",
    );
    expect(citizenConsentStatement("partage", "  ")).toBe(
      "J'accepte de partager ces informations avec les services de la collectivité afin d'améliorer le traitement de ma demande et de mes futures demandes.",
    );
  });

  it("l'origine se déduit de l'application de la clé, sinon aucune", async () => {
    const { citizenConsentSource, citizenConsentReference } = await import("./citizen.ts");
    expect(citizenConsentSource("nora")).toBe("portail-citoyen");
    for (const consumer of [null, "", "iris", "clara", "toString", "__proto__"]) expect(citizenConsentSource(consumer)).toBeNull();
    expect(citizenConsentReference("abc", "2026-10-20T10:00:00.000Z")).toBe("compte:abc:2026-10-20T10:00:00.000Z");
  });

  it("refuse une phrase venue de l'appelant", async () => {
    const { parseCitizenConsent } = await import("./citizen.ts");
    expect(parseCitizenConsent({ kind: "partage", granted: false }).ok).toBe(true);
    expect(parseCitizenConsent({ kind: "partage", granted: true, statement: "autre chose" }).ok).toBe(false);
    expect(parseCitizenConsent({ kind: "autre", granted: true }).ok).toBe(false);
  });
});
