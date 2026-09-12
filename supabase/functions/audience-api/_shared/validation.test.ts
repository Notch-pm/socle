import { describe, expect, it } from "vitest";
import {
  isUuid,
  parseDepositPayload,
  parsePageViewPayload,
} from "./validation.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROC = "22222222-2222-4222-8222-222222222222";

describe("parsePageViewPayload — la whitelist des clés", () => {
  // ⚠️ C'EST LA GARANTIE VÉRIFIABLE DE L'API. Une clé ignorée en silence
  // laisserait croire à l'appelant qu'elle est enregistrée quelque part ; un
  // refus lui apprend que cette API ne reçoit que des compteurs.
  it("refuse une clé inconnue, et la nomme", () => {
    for (const key of ["visitor_id", "ip", "user_agent", "referrer", "url"]) {
      const result = parsePageViewPayload({ tenant_id: TENANT, page: "accueil", [key]: "x" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain(key);
    }
  });

  it("refuse ce qui n'est pas un objet", () => {
    for (const raw of [null, undefined, "accueil", 42, ["accueil"]]) {
      expect(parsePageViewPayload(raw).ok).toBe(false);
    }
  });
});

describe("parsePageViewPayload — la forme de l'événement", () => {
  it("accepte l'accueil sans démarche", () => {
    const result = parsePageViewPayload({ tenant_id: TENANT, page: "accueil" });
    expect(result).toEqual({
      ok: true,
      value: {
        tenantId: TENANT,
        page: "accueil",
        procedureId: null,
        entry: false,
        lang: null,
        device: null,
      },
    });
  });

  // ⚠️ La même règle qu'en base (`portal_audience_pages_procedure_check`),
  // écrite ici aussi pour que l'appelant l'apprenne par un 400 explicite plutôt
  // que par un `recorded: false` muet.
  it("exige une démarche pour la démarche et le formulaire, et la refuse sur l'accueil", () => {
    expect(parsePageViewPayload({ tenant_id: TENANT, page: "demarche" }).ok).toBe(false);
    expect(parsePageViewPayload({ tenant_id: TENANT, page: "formulaire" }).ok).toBe(false);
    expect(parsePageViewPayload({ tenant_id: TENANT, page: "accueil", procedure_id: PROC }).ok)
      .toBe(false);
    expect(parsePageViewPayload({ tenant_id: TENANT, page: "demarche", procedure_id: PROC }).ok)
      .toBe(true);
  });

  it("refuse une page hors des trois écrans", () => {
    for (const page of ["contact", "", "ACCUEIL", "actus"]) {
      expect(parsePageViewPayload({ tenant_id: TENANT, page }).ok).toBe(false);
    }
  });

  it("refuse un tenant ou une démarche qui ne sont pas des uuid", () => {
    expect(parsePageViewPayload({ tenant_id: "ville-a", page: "accueil" }).ok).toBe(false);
    expect(parsePageViewPayload({ tenant_id: TENANT, page: "demarche", procedure_id: "42" }).ok)
      .toBe(false);
  });

  // `entry` est un OUI/NON : le référent qui l'a produit n'entre jamais.
  it("ne lit `entry` que strictement booléen", () => {
    expect(parsePageViewPayload({ tenant_id: TENANT, page: "accueil", entry: "true" }).ok)
      .toBe(false);
    const yes = parsePageViewPayload({ tenant_id: TENANT, page: "accueil", entry: true });
    expect(yes.ok && yes.value.entry).toBe(true);
    const no = parsePageViewPayload({ tenant_id: TENANT, page: "accueil", entry: false });
    expect(no.ok && no.value.entry).toBe(false);
  });
});

describe("parsePageViewPayload — langue et appareil, facultatifs", () => {
  it("normalise un code de langue et refuse ce qui n'en est pas un", () => {
    const ok = parsePageViewPayload({ tenant_id: TENANT, page: "accueil", lang: "  OC " });
    expect(ok.ok && ok.value.lang).toBe("oc");
    for (const lang of ["fr_FR", "français", "f", "toolongcodehere", 42]) {
      expect(parsePageViewPayload({ tenant_id: TENANT, page: "accueil", lang }).ok).toBe(false);
    }
  });

  it("n'accepte que les trois classes d'appareil", () => {
    const ok = parsePageViewPayload({ tenant_id: TENANT, page: "accueil", device: "tablette" });
    expect(ok.ok && ok.value.device).toBe("tablette");
    // Le User-Agent lui-même n'a jamais sa place ici : il est refusé comme
    // n'importe quelle autre chaîne.
    for (const device of ["Mozilla/5.0 (iPhone)", "phone", "", "MOBILE"]) {
      expect(parsePageViewPayload({ tenant_id: TENANT, page: "accueil", device }).ok).toBe(false);
    }
  });

  // Une ventilation manquante ampute un camembert ; elle ne doit jamais faire
  // perdre la vue de page elle-même.
  it("accepte null comme absence, pour les deux", () => {
    const result = parsePageViewPayload({
      tenant_id: TENANT, page: "accueil", lang: null, device: null,
    });
    expect(result.ok && result.value.lang).toBeNull();
    expect(result.ok && result.value.device).toBeNull();
  });
});

describe("parseDepositPayload", () => {
  it("exige les deux identifiants", () => {
    expect(parseDepositPayload({ tenant_id: TENANT, procedure_id: PROC })).toEqual({
      ok: true,
      value: { tenantId: TENANT, procedureId: PROC },
    });
    expect(parseDepositPayload({ tenant_id: TENANT }).ok).toBe(false);
    expect(parseDepositPayload({ procedure_id: PROC }).ok).toBe(false);
  });

  // Un dépôt n'a ni page ni langue : ce qu'on compte, c'est l'issue, pas l'écran.
  it("refuse toute clé de plus", () => {
    const result = parseDepositPayload({ tenant_id: TENANT, procedure_id: PROC, page: "formulaire" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("page");
  });
});

describe("isUuid", () => {
  it("accepte un uuid, majuscules comprises, et rien d'autre", () => {
    expect(isUuid(TENANT)).toBe(true);
    expect(isUuid(TENANT.toUpperCase())).toBe(true);
    for (const value of ["", "42", null, undefined, 1, `${TENANT}x`]) {
      expect(isUuid(value)).toBe(false);
    }
  });
});
