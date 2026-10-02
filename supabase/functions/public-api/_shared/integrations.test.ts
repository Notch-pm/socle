import { describe, expect, it } from "vitest";
import { INTEGRATION_FIELDS, serializeIntegration, serializeOrganizationIntegration } from "./integrations";
import * as edge from "../../integration-test/_shared/adapters";

const ARPEGE = {
  id: "i-1",
  slug: "arpege",
  name: "Arpège",
  description: "GRU",
  logo_url: null,
  type_id: "application_gru",
  adapter: "arpege",
  is_available: true,
  integration_types: { id: "application_gru", name: "Application GRU" },
  integration_applications: [{ application_id: "clara" }],
};

const CONFIG = {
  id: "c-1",
  settings: { api_base_url: " https://api.test ", client_id: "cid", intrus: "x" },
  is_active: true,
  last_test_ok: true,
  last_tested_at: "2026-10-02T10:00:00+00:00",
  updated_at: "2026-10-02T09:00:00+00:00",
};

const SECRETS = {
  secrets: { client_secret: " s3cret ", cache: "intrus" },
  updated_at: "2026-10-02T09:30:00+00:00",
};

const input = (over: Partial<Parameters<typeof serializeOrganizationIntegration>[0]> = {}) => ({
  organizationId: "org-1",
  rootId: "root-1",
  integration: ARPEGE,
  config: CONFIG,
  secrets: SECRETS,
  ...over,
});

describe("serializeIntegration — catalogue", () => {
  it("whitelist : identité, type, applications, disponibilité", () => {
    expect(serializeIntegration({ ...ARPEGE, secret_cache: "x" })).toEqual({
      slug: "arpege",
      name: "Arpège",
      description: "GRU",
      logo_url: null,
      type: { id: "application_gru", name: "Application GRU" },
      applications: ["clara"],
      available: true,
      configurable: true,
    });
  });
  it("sans adaptateur → non configurable", () => {
    expect(serializeIntegration({ ...ARPEGE, adapter: null }).configurable).toBe(false);
  });
});

describe("serializeOrganizationIntegration", () => {
  it("whitelist par adaptateur : chaque clé dans son bac, les intrus ne sortent pas", () => {
    const dto = serializeOrganizationIntegration(input());
    expect(dto.settings).toEqual({ api_base_url: "https://api.test", client_id: "cid" });
    // Un secret n'est jamais élagué.
    expect(dto.secrets).toEqual({ client_secret: " s3cret " });
    expect(dto).toMatchObject({
      organization_id: "org-1",
      source_organization_id: "root-1",
      integration: "arpege",
      type: "application_gru",
      configured: true,
      is_active: true,
      last_test_ok: true,
      updated_at: "2026-10-02T09:30:00+00:00",
    });
  });

  it("aucune configuration → configured false, rien d'autre", () => {
    const dto = serializeOrganizationIntegration(input({ config: null, secrets: null }));
    expect(dto).toMatchObject({ configured: false, is_active: false, settings: {}, secrets: {} });
  });

  it("incomplète (secret manquant) → configured false, rien ne sort", () => {
    const dto = serializeOrganizationIntegration(input({ secrets: null }));
    expect(dto).toMatchObject({ configured: false, settings: {}, secrets: {} });
  });

  it("is_active effectif : offre retirée ⇒ inactive, valeurs conservées", () => {
    const dto = serializeOrganizationIntegration(input({ integration: { ...ARPEGE, is_available: false } }));
    expect(dto.is_active).toBe(false);
    expect(dto.configured).toBe(true);
    expect(dto.secrets.client_secret).toBe(" s3cret ");
  });

  it("suspendue au Socle ⇒ inactive", () => {
    expect(serializeOrganizationIntegration(input({ config: { ...CONFIG, is_active: false } })).is_active).toBe(false);
  });
});

describe("miroir des champs avec integration-test", () => {
  it("mêmes clés, même répartition secret / non secret", () => {
    expect(INTEGRATION_FIELDS.arpege).toEqual(edge.ARPEGE_FIELDS.map((f) => ({ key: f.key, secret: f.secret })));
  });

  it("même règle de complétude", () => {
    const keys = edge.ARPEGE_FIELDS.map((f) => f.key);
    for (let mask = 0; mask < 1 << keys.length; mask++) {
      const values = Object.fromEntries(keys.filter((_, i) => mask & (1 << i)).map((k) => [k, "v"]));
      const settings = Object.fromEntries(Object.entries(values).filter(([k]) => !edge.ARPEGE_FIELDS.find((f) => f.key === k)!.secret));
      const secrets = Object.fromEntries(Object.entries(values).filter(([k]) => edge.ARPEGE_FIELDS.find((f) => f.key === k)!.secret));
      const dto = serializeOrganizationIntegration(
        input({ config: { ...CONFIG, settings }, secrets: { secrets, updated_at: null } }),
      );
      expect(dto.configured).toBe(edge.arpegeAdapter.isComplete(new Set(Object.keys(values))));
    }
  });
});
