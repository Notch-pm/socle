import { describe, expect, it } from "vitest";
import { catalogueStatus, organizationStatus, overviewStatus, STATUS_LABELS } from "./integrationStatus";

const ARPEGE = { adapter: "arpege", is_available: true };
const COMPLETE = { settings: { api_base_url: "https://x.test", client_id: "cid" }, is_active: false, last_test_ok: null };

describe("catalogueStatus", () => {
  it("proposée avec adaptateur → Disponible", () => {
    expect(catalogueStatus(ARPEGE)).toBe("available");
  });
  it("sans adaptateur → Bientôt disponible", () => {
    expect(catalogueStatus({ adapter: null, is_available: true })).toBe("soon");
    expect(catalogueStatus({ adapter: "inconnu", is_available: true })).toBe("soon");
  });
  it("retirée → Désactivée, adaptateur ou pas", () => {
    expect(catalogueStatus({ ...ARPEGE, is_available: false })).toBe("disabled");
  });
});

describe("organizationStatus", () => {
  it("aucune configuration → Non configurée", () => {
    expect(organizationStatus(ARPEGE, null)).toBe("not_configured");
  });
  it("incomplète (secret absent) → Non configurée", () => {
    expect(organizationStatus(ARPEGE, COMPLETE, [])).toBe("not_configured");
  });
  it("complète, inactive → Configurée", () => {
    expect(organizationStatus(ARPEGE, COMPLETE, ["client_secret"])).toBe("configured");
  });
  it("jeton seul (ancien mode) → Configurée", () => {
    const config = { ...COMPLETE, settings: { api_base_url: "https://x.test" } };
    expect(organizationStatus(ARPEGE, config, ["access_token"])).toBe("configured");
  });
  it("active → Active", () => {
    expect(organizationStatus(ARPEGE, { ...COMPLETE, is_active: true, last_test_ok: true }, ["client_secret"])).toBe("active");
  });
  it("dernier test en échec → En erreur, même active", () => {
    expect(organizationStatus(ARPEGE, { ...COMPLETE, is_active: true, last_test_ok: false }, ["client_secret"])).toBe("error");
  });
  it("offre retirée → Désactivée, la configuration est conservée", () => {
    expect(organizationStatus({ ...ARPEGE, is_available: false }, { ...COMPLETE, is_active: true }, ["client_secret"])).toBe("disabled");
  });
  it("tout statut a un libellé français", () => {
    for (const label of Object.values(STATUS_LABELS)) expect(label).toMatch(/^[A-ZÉ]/);
  });
});

describe("overviewStatus (vue de l'administrateur, noms de champs seulement)", () => {
  it("rend le même statut que la fiche du super admin", () => {
    expect(overviewStatus(ARPEGE, null)).toBe("not_configured");
    expect(overviewStatus(ARPEGE, { is_active: false, last_test_ok: null, present_keys: ["api_base_url", "client_id"] })).toBe("not_configured");
    expect(overviewStatus(ARPEGE, { is_active: false, last_test_ok: null, present_keys: ["api_base_url", "client_id", "client_secret"] })).toBe("configured");
    expect(overviewStatus(ARPEGE, { is_active: true, last_test_ok: true, present_keys: [] })).toBe("active");
    expect(overviewStatus(ARPEGE, { is_active: true, last_test_ok: false, present_keys: [] })).toBe("error");
    expect(overviewStatus({ ...ARPEGE, is_available: false }, { is_active: true, last_test_ok: true, present_keys: [] })).toBe("disabled");
  });
});
