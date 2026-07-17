import { describe, expect, it } from "vitest";
import {
  serializeCategory,
  serializeDocumentType,
  serializeOrganization,
  serializeOrganizationProcedure,
  serializeProcedure,
  serializeQuartier,
} from "./serializers.ts";

describe("serializers — whitelist stricte (aucune fuite)", () => {
  it("n'expose que les champs prévus pour une organisation, même avec des colonnes en trop", () => {
    const row = {
      id: "org-1",
      parent_id: null,
      name: "ACCM",
      slug: "accm",
      type: "collectivité",
      status: "active",
      address: null,
      phone: null,
      email: null,
      logo_url: null,
      email_sender_override: false,
      email_sender_name: null,
      metadata: null,
      created_at: "2026-01-01T00:00:00Z",
      // Colonnes sensibles/parasites qui ne doivent JAMAIS ressortir :
      secret_column: "leak",
      password: "hunter2",
    };
    const dto = serializeOrganization(row);
    expect(Object.keys(dto).sort()).toEqual(
      [
        "address",
        "created_at",
        "email",
        "email_sender_name",
        "email_sender_override",
        "id",
        "logo_url",
        "metadata",
        "name",
        "parent_id",
        "phone",
        "slug",
        "status",
        "type",
      ].sort(),
    );
    expect(dto).not.toHaveProperty("secret_column");
    expect(dto).not.toHaveProperty("password");
  });

  it("catégorie : libellé + icône", () => {
    const dto = serializeCategory({
      id: "c1",
      organization_id: "org-1",
      name: "État civil",
      icon: "FileText",
      created_at: null,
      internal: "x",
    });
    expect(dto).toEqual({
      id: "c1",
      organization_id: "org-1",
      name: "État civil",
      icon: "FileText",
      created_at: null,
    });
  });

  it("démarche : transmet les blocs JSON possédés et normalise keywords", () => {
    const form = { version: 1, content: [] };
    const dto = serializeProcedure({
      id: "p1",
      organization_id: "org-1",
      category_id: "c1",
      name: "Demande X",
      type: "externe",
      keywords: null, // → tableau vide
      short_description: null,
      user_description: null,
      agent_description: null,
      input_duration_minutes: 10,
      order_index: 0,
      requester_config: { citoyen: { enabled: true, fields: {} } },
      form_schema: form,
      knowledge_base: null,
      translations: null,
      created_at: null,
      updated_at: null,
      is_active_global: true, // colonne non exposée
    });
    expect(dto.keywords).toEqual([]);
    expect(dto.form_schema).toBe(form);
    expect(dto).not.toHaveProperty("is_active_global");
  });

  it("activation : is_enabled coercé en booléen", () => {
    const dto = serializeOrganizationProcedure({
      organization_id: "org-2",
      procedure_id: "p1",
      is_enabled: null,
      custom_name: null,
      custom_order: null,
      metadata: null,
    });
    expect(dto.is_enabled).toBe(false);
  });

  it("quartier : n'expose jamais la colonne geom (binaire PostGIS)", () => {
    const row = {
      id: "q1",
      organization_id: "org-1",
      name: "Centre-ville",
      color: "hsl(152 83% 42%)",
      geom: "0106000020E61000...", // binaire — ne doit JAMAIS ressortir
      created_by: "user-1", // interne — non exposé
      created_at: "2026-07-17T09:00:00Z",
      updated_at: "2026-07-17T09:00:00Z",
    };
    const dto = serializeQuartier(row);
    expect(dto).toEqual({
      id: "q1",
      organization_id: "org-1",
      name: "Centre-ville",
      color: "hsl(152 83% 42%)",
      created_at: "2026-07-17T09:00:00Z",
      updated_at: "2026-07-17T09:00:00Z",
    });
    expect(dto).not.toHaveProperty("geom");
    expect(dto).not.toHaveProperty("created_by");
    expect(dto).not.toHaveProperty("geometry");
  });

  it("quartier : inclut la géométrie GeoJSON quand elle est fournie (y compris null)", () => {
    const geojson = { type: "MultiPolygon", coordinates: [] };
    const withGeometry = serializeQuartier({ id: "q1", organization_id: "o", name: "N" }, geojson);
    expect(withGeometry.geometry).toBe(geojson);
    const withNull = serializeQuartier({ id: "q1", organization_id: "o", name: "N" }, null);
    expect(withNull).toHaveProperty("geometry", null);
  });

  it("type de pièce : champs simples", () => {
    const dto = serializeDocumentType({
      id: "dt1",
      organization_id: "org-1",
      name: "Justificatif",
      created_at: null,
    });
    expect(dto).toEqual({
      id: "dt1",
      organization_id: "org-1",
      name: "Justificatif",
      created_at: null,
    });
  });
});
