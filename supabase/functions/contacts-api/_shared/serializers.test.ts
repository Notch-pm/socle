import { describe, expect, it } from "vitest";
import { serializeContact, serializeContactRole } from "./serializers.ts";

describe("serializeContact", () => {
  const row = {
    id: "c-1",
    organization_id: "org-1",
    contact_type: "personne",
    civility: "madame",
    first_name: "Jeanne",
    last_name: "Martin",
    usage_name: null,
    birth_date: "1990-01-02",
    legal_name: null,
    siret: null,
    display_name: "Martin Jeanne",
    email: "jeanne@example.org",
    mobile_phone: null,
    landline_phone: null,
    address_line1: "1 rue du Port",
    address_line2: null,
    postal_code: "13200",
    city: "Arles",
    country: "France",
    preferred_channel: "email",
    consent_email: true,
    consent_sms: false,
    internal_notes: "note agent",
    status: "active",
    created_at: "2026-07-15T00:00:00Z",
    updated_at: "2026-07-15T00:00:00Z",
  };

  it("recopie les champs du contrat, avec rôles et références", () => {
    const dto = serializeContact(
      row,
      [{ id: "r-1", name: "Habitant", organization_id: "org-1" }],
      [{ id: "e-1", source: "portail_citoyen", external_id: "USR-1", created_at: null, updated_at: null }],
    );
    expect(dto).toMatchObject({
      id: "c-1",
      contact_type: "personne",
      display_name: "Martin Jeanne",
      consent_email: true,
      internal_notes: "note agent",
      status: "active",
      roles: [{ id: "r-1", name: "Habitant" }],
      external_references: [{ id: "e-1", source: "portail_citoyen", external_id: "USR-1" }],
    });
    // Le rôle embarqué est une référence courte : pas d'organization_id.
    expect(Object.keys(dto.roles[0])).toEqual(["id", "name"]);
  });

  it("whitelist stricte : une colonne inattendue ne fuit pas", () => {
    const dto = serializeContact({ ...row, colonne_sensible: "secret" }, [], []);
    expect(JSON.stringify(dto)).not.toContain("secret");
    expect(dto.roles).toEqual([]);
    expect(dto.external_references).toEqual([]);
  });

  it("expose les coordonnées et le quartier (null par défaut, auto coercé en booléen)", () => {
    const bare = serializeContact(row, [], []);
    expect(bare.address_lat).toBeNull();
    expect(bare.address_lon).toBeNull();
    expect(bare.quartier_id).toBeNull();
    expect(bare.quartier_auto).toBe(false);

    const located = serializeContact(
      { ...row, address_lat: 43.6766, address_lon: 4.6278, quartier_id: "q-1", quartier_auto: true },
      [],
      [],
    );
    expect(located.address_lat).toBe(43.6766);
    expect(located.address_lon).toBe(4.6278);
    expect(located.quartier_id).toBe("q-1");
    expect(located.quartier_auto).toBe(true);
  });
});

describe("serializeContactRole", () => {
  it("recopie l'entrée de catalogue", () => {
    expect(
      serializeContactRole({ id: "r-1", organization_id: "org-1", name: "Élu", created_at: null, extra: 1 }),
    ).toEqual({ id: "r-1", organization_id: "org-1", name: "Élu", created_at: null });
  });
});
