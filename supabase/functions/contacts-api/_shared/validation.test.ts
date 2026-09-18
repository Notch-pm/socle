import { describe, expect, it } from "vitest";
import {
  contactInvariantError,
  coordinatesPairError,
  escapeIlikePattern,
  hasContactsScope,
  isUuid,
  MATCH_DEFAULT_LIMIT,
  mergeContactShape,
  normalizePhoneNumber,
  parseConsentsPayload,
  parseContactPayload,
  parseMatchPayload,
  parsePagination,
  resolveRootOrgId,
  type ContactShape,
} from "./validation.ts";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function expectFail(outcome: ReturnType<typeof parseContactPayload>, fragment: string) {
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.message).toContain(fragment);
}

describe("hasContactsScope", () => {
  it("accepte uniquement un tableau contenant 'contacts'", () => {
    expect(hasContactsScope(["contacts"])).toBe(true);
    expect(hasContactsScope(["read", "contacts"])).toBe(true);
    expect(hasContactsScope(["read"])).toBe(false);
    expect(hasContactsScope("contacts")).toBe(false);
    expect(hasContactsScope(null)).toBe(false);
  });
});

describe("parseContactPayload — création", () => {
  it("normalise une personne physique valide", () => {
    const outcome = parseContactPayload(
      {
        contact_type: "personne",
        civility: "madame",
        first_name: "  Jeanne ",
        last_name: "Martin",
        usage_name: "",
        email: "jeanne@example.org",
        consent_email: true,
      },
      "create",
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.fields).toMatchObject({
        contact_type: "personne",
        civility: "madame",
        first_name: "Jeanne",
        usage_name: null,
        consent_email: true,
      });
      expect(outcome.value.roleIds).toBeUndefined();
      expect(outcome.value.externalRefs).toBeUndefined();
    }
  });

  it("exige contact_type et le valide", () => {
    expectFail(parseContactPayload({}, "create"), "contact_type");
    expectFail(parseContactPayload({ contact_type: "autre" }, "create"), "contact_type");
  });

  it("rejette un corps non-objet et les clés inconnues", () => {
    expectFail(parseContactPayload(null, "create"), "objet JSON");
    expectFail(parseContactPayload([], "create"), "objet JSON");
    expectFail(
      parseContactPayload({ contact_type: "personne", prenom: "X" }, "create"),
      "Champ inconnu : prenom",
    );
  });

  it("rejette status (endpoints dédiés archive/restore)", () => {
    expectFail(
      parseContactPayload({ contact_type: "personne", status: "archived" }, "create"),
      "/archive",
    );
  });

  it("valide les énumérations et formats", () => {
    expectFail(
      parseContactPayload({ contact_type: "personne", civility: "mx" }, "create"),
      "civility",
    );
    expectFail(
      parseContactPayload({ contact_type: "personne", preferred_channel: "pigeon" }, "create"),
      "preferred_channel",
    );
    expectFail(
      parseContactPayload({ contact_type: "entreprise", siret: "123" }, "create"),
      "siret",
    );
    expectFail(
      parseContactPayload({ contact_type: "personne", birth_date: "01/02/1990" }, "create"),
      "birth_date",
    );
    expectFail(
      parseContactPayload({ contact_type: "personne", consent_sms: "oui" }, "create"),
      "consent_sms",
    );
  });

  it("compacte le SIRET (espaces retirés)", () => {
    const outcome = parseContactPayload(
      { contact_type: "entreprise", legal_name: "ACME", siret: "123 456 789 01234" },
      "create",
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value.fields.siret).toBe("12345678901234");
  });

  it("country vide à la création → champ omis (défaut France en base)", () => {
    const outcome = parseContactPayload(
      { contact_type: "personne", civility: "monsieur", country: "" },
      "create",
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect("country" in outcome.value.fields).toBe(false);
  });

  it("valide role_ids (UUID) et déduplique", () => {
    expectFail(
      parseContactPayload({ contact_type: "personne", civility: "madame", role_ids: ["abc"] }, "create"),
      "role_ids",
    );
    const outcome = parseContactPayload(
      { contact_type: "personne", civility: "madame", role_ids: [UUID_A, UUID_A, UUID_B] },
      "create",
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value.roleIds).toEqual([UUID_A, UUID_B]);
  });

  it("valide les références externes (forme, vides, doublons de source)", () => {
    expectFail(
      parseContactPayload(
        { contact_type: "personne", civility: "madame", external_references: [{ source: "x" }] },
        "create",
      ),
      "source et external_id",
    );
    expectFail(
      parseContactPayload(
        {
          contact_type: "personne",
          civility: "madame",
          external_references: [{ source: "x", external_id: "1", extra: true }],
        },
        "create",
      ),
      "Champ inconnu",
    );
    expectFail(
      parseContactPayload(
        {
          contact_type: "personne",
          civility: "madame",
          external_references: [
            { source: "portail", external_id: "1" },
            { source: "portail", external_id: "2" },
          ],
        },
        "create",
      ),
      "double",
    );
    const outcome = parseContactPayload(
      {
        contact_type: "personne",
        civility: "madame",
        external_references: [{ source: " portail ", external_id: " USR-1 " }],
      },
      "create",
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.externalRefs).toEqual([{ source: "portail", external_id: "USR-1" }]);
    }
  });
});

describe("parseContactPayload — modification", () => {
  it("refuse contact_type (immuable) et accepte un patch partiel", () => {
    expectFail(parseContactPayload({ contact_type: "entreprise" }, "update"), "immuable");
    const outcome = parseContactPayload({ city: "Arles" }, "update");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value.fields).toEqual({ city: "Arles" });
  });

  it("refuse un country vide en modification (NOT NULL en base)", () => {
    expectFail(parseContactPayload({ country: "" }, "update"), "country");
  });

  it("[] pour role_ids / external_references = tout retirer (différent d'omis)", () => {
    const outcome = parseContactPayload({ role_ids: [], external_references: [] }, "update");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.roleIds).toEqual([]);
      expect(outcome.value.externalRefs).toEqual([]);
    }
  });
});

describe("contactInvariantError + mergeContactShape", () => {
  const personne: ContactShape = {
    contact_type: "personne",
    civility: "madame",
    first_name: "Jeanne",
    last_name: "Martin",
    usage_name: null,
    birth_date: null,
    legal_name: null,
    siret: null,
  };
  const entreprise: ContactShape = {
    contact_type: "entreprise",
    civility: null,
    first_name: null,
    last_name: null,
    usage_name: null,
    birth_date: null,
    legal_name: "ACME",
    siret: "12345678901234",
  };

  it("accepte les fiches cohérentes", () => {
    expect(contactInvariantError(personne)).toBeNull();
    expect(contactInvariantError(entreprise)).toBeNull();
  });

  it("détecte les incohérences par type", () => {
    expect(contactInvariantError({ ...personne, civility: null })).toContain("civilité");
    expect(contactInvariantError({ ...personne, legal_name: "ACME" })).toContain("raison sociale");
    expect(contactInvariantError({ ...personne, siret: "12345678901234" })).toContain("SIRET");
    expect(contactInvariantError({ ...entreprise, legal_name: null })).toContain("raison sociale");
    expect(contactInvariantError({ ...entreprise, civility: "madame" })).toContain("civilité");
    expect(contactInvariantError({ ...entreprise, first_name: "X" })).toContain("identité");
  });

  it("mergeContactShape applique le patch sur l'état courant", () => {
    const current = { ...personne, extra_column: "ignorée" };
    const merged = mergeContactShape(current, { civility: null });
    expect(merged.civility).toBeNull();
    expect(merged.first_name).toBe("Jeanne");
    expect(contactInvariantError(merged)).toContain("civilité");
  });
});

describe("parsePagination", () => {
  it("défauts et bornes", () => {
    expect(parsePagination(null, null)).toEqual({ ok: true, limit: 100, offset: 0 });
    expect(parsePagination("500", "10")).toEqual({ ok: true, limit: 500, offset: 10 });
    expect(parsePagination("501", null).ok).toBe(false);
    expect(parsePagination("0", null).ok).toBe(false);
    expect(parsePagination("abc", null).ok).toBe(false);
    expect(parsePagination(null, "-1").ok).toBe(false);
  });
});

describe("parseContactPayload — relations", () => {
  it("accepte un tableau { related_contact_id, role_id } et déduplique les paires", () => {
    const outcome = parseContactPayload(
      {
        relations: [
          { related_contact_id: UUID_A, role_id: UUID_B },
          { related_contact_id: UUID_A, role_id: UUID_B },
        ],
      },
      "update",
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.relations).toEqual([{ related_contact_id: UUID_A, role_id: UUID_B }]);
    }
  });

  it("[] = tout retirer ; absent = ne pas toucher", () => {
    const cleared = parseContactPayload({ relations: [] }, "update");
    expect(cleared.ok && cleared.value.relations).toEqual([]);
    const untouched = parseContactPayload({ email: "a@b.fr" }, "update");
    expect(untouched.ok && untouched.value.relations).toBeUndefined();
  });

  it("refuse les formes invalides", () => {
    expect(parseContactPayload({ relations: "x" }, "update").ok).toBe(false);
    expect(parseContactPayload({ relations: [{ related_contact_id: "nope", role_id: UUID_B }] }, "update").ok).toBe(false);
    expect(parseContactPayload({ relations: [{ related_contact_id: UUID_A }] }, "update").ok).toBe(false);
    expect(
      parseContactPayload(
        { relations: [{ related_contact_id: UUID_A, role_id: UUID_B, extra: 1 }] },
        "update",
      ).ok,
    ).toBe(false);
  });
});

describe("helpers", () => {
  it("isUuid", () => {
    expect(isUuid(UUID_A)).toBe(true);
    expect(isUuid("pas-un-uuid")).toBe(false);
  });

  it("escapeIlikePattern neutralise % _ et \\", () => {
    expect(escapeIlikePattern("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
});

describe("parseContactPayload — coordonnées et quartier", () => {
  it("accepte des coordonnées numériques valides ou nulles", () => {
    const outcome = parseContactPayload(
      { contact_type: "personne", civility: "madame", address_lat: 43.6766, address_lon: 4.6278 },
      "create",
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.fields.address_lat).toBe(43.6766);
      expect(outcome.value.fields.address_lon).toBe(4.6278);
    }
    const cleared = parseContactPayload({ address_lat: null, address_lon: null }, "update");
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.value.fields.address_lat).toBeNull();
      expect(cleared.value.fields.address_lon).toBeNull();
    }
  });

  it("refuse les coordonnées non numériques ou hors bornes", () => {
    expectFail(parseContactPayload({ address_lat: "43.6" }, "update"), "address_lat");
    expectFail(parseContactPayload({ address_lat: 91 }, "update"), "address_lat");
    expectFail(parseContactPayload({ address_lon: -181 }, "update"), "address_lon");
    expectFail(parseContactPayload({ address_lon: Number.NaN }, "update"), "address_lon");
  });

  it("quartier_id non nul = assignation manuelle (quartier_auto passe à false)", () => {
    const outcome = parseContactPayload({ quartier_id: UUID_A }, "update");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.fields.quartier_id).toBe(UUID_A);
      expect(outcome.value.fields.quartier_auto).toBe(false);
    }
  });

  it("quartier_id null = retour à l'assignation automatique", () => {
    const outcome = parseContactPayload({ quartier_id: null }, "update");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.fields.quartier_id).toBeNull();
      expect(outcome.value.fields.quartier_auto).toBe(true);
    }
  });

  it("refuse un quartier_id qui n'est pas un UUID", () => {
    expectFail(parseContactPayload({ quartier_id: "centre-ville" }, "update"), "quartier_id");
  });

  it("quartier_auto n'est pas pilotable directement (clé inconnue)", () => {
    expectFail(parseContactPayload({ quartier_auto: true }, "update"), "quartier_auto");
  });
});

describe("coordinatesPairError", () => {
  it("exige les deux coordonnées, ou aucune", () => {
    expect(coordinatesPairError(43.6, 4.6)).toBeNull();
    expect(coordinatesPairError(null, null)).toBeNull();
    expect(coordinatesPairError(43.6, null)).toContain("vont ensemble");
    expect(coordinatesPairError(null, 4.6)).toContain("vont ensemble");
  });
});

function expectMatchFail(outcome: ReturnType<typeof parseMatchPayload>, fragment: string) {
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.message).toContain(fragment);
}

describe("normalizePhoneNumber", () => {
  it("réduit les formats français équivalents aux mêmes chiffres significatifs", () => {
    expect(normalizePhoneNumber("+33 6 12 34 56 78")).toBe("612345678");
    expect(normalizePhoneNumber("0033612345678")).toBe("612345678");
    expect(normalizePhoneNumber("06 12 34 56 78")).toBe("612345678");
    expect(normalizePhoneNumber("06.12.34.56.78")).toBe("612345678");
    expect(normalizePhoneNumber("04-90-12-34-56")).toBe("490123456");
  });

  it("laisse les numéros non français en chiffres bruts", () => {
    expect(normalizePhoneNumber("+41 22 345 67 89")).toBe("41223456789");
  });

  it("renvoie null quand il n'y a aucun chiffre", () => {
    expect(normalizePhoneNumber("")).toBeNull();
    expect(normalizePhoneNumber("abc")).toBeNull();
  });
});

describe("parseMatchPayload", () => {
  it("normalise une identité partielle et applique les défauts", () => {
    const outcome = parseMatchPayload({
      first_name: " Jean ",
      last_name: "Dupont",
      email: "jean.dupont@example.fr",
      phones: ["+33 6 12 34 56 78", "06 12 34 56 78", "n/a"],
      siret: "123 456 789 01234",
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toMatchObject({
        first_name: "Jean",
        last_name: "Dupont",
        email: "jean.dupont@example.fr",
        phones: ["612345678"], // normalisés et dédoublonnés, entrée sans chiffre ignorée
        siret: "12345678901234",
        status: "active", // défaut : les fiches archivées ne sont pas proposées
        exclude_ids: [],
        limit: MATCH_DEFAULT_LIMIT,
      });
    }
  });

  it("rejette les clés inconnues et les corps non-objets", () => {
    expectMatchFail(parseMatchPayload({ nom: "Dupont" }), "Champ inconnu : nom");
    expectMatchFail(parseMatchPayload(null), "objet JSON");
    expectMatchFail(parseMatchPayload([]), "objet JSON");
  });

  it("exige au moins un critère exploitable (un prénom seul ne suffit pas)", () => {
    expectMatchFail(parseMatchPayload({}), "Au moins un critère");
    expectMatchFail(parseMatchPayload({ first_name: "Jean" }), "Au moins un critère");
    // birth_date est un critère recevable (mais ne rapprochera rien seule).
    expect(parseMatchPayload({ birth_date: "1980-05-12" }).ok).toBe(true);
  });

  it("valide contact_type, status, birth_date, exclude_ids et limit", () => {
    expectMatchFail(parseMatchPayload({ email: "a@b.fr", contact_type: "autre" }), "contact_type");
    expectMatchFail(parseMatchPayload({ email: "a@b.fr", status: "obsolete" }), "status");
    expectMatchFail(parseMatchPayload({ birth_date: "12/05/1980" }), "birth_date");
    expectMatchFail(parseMatchPayload({ email: "a@b.fr", exclude_ids: ["pas-un-uuid"] }), "exclude_ids");
    expectMatchFail(parseMatchPayload({ email: "a@b.fr", limit: 0 }), "limit");
    expectMatchFail(parseMatchPayload({ email: "a@b.fr", limit: 21 }), "limit");
    expectMatchFail(parseMatchPayload({ phones: "0612345678" }), "phones");
  });

  it("status null = tous les statuts (demande explicite d'inclure les archivés)", () => {
    const outcome = parseMatchPayload({ email: "a@b.fr", status: null });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value.status).toBeNull();
  });

  it("dédoublonne exclude_ids et accepte une identité de structure", () => {
    const outcome = parseMatchPayload({
      contact_type: "entreprise",
      legal_name: "Boulangerie du Parc",
      exclude_ids: [UUID_A, UUID_A, UUID_B],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.value.exclude_ids).toEqual([UUID_A, UUID_B]);
  });
});

describe("resolveRootOrgId", () => {
  const rows = [
    { id: "accm", parent_id: null },
    { id: "mairie", parent_id: "accm" },
    { id: "service", parent_id: "mairie" },
    { id: "test-root", parent_id: null },
  ];

  it("remonte à la racine depuis une sous-organisation", () => {
    expect(resolveRootOrgId(rows, "service")).toBe("accm");
    expect(resolveRootOrgId(rows, "mairie")).toBe("accm");
  });

  it("une racine est sa propre racine — deux racines coexistent", () => {
    expect(resolveRootOrgId(rows, "accm")).toBe("accm");
    expect(resolveRootOrgId(rows, "test-root")).toBe("test-root");
  });

  it("organisation absente → null", () => {
    expect(resolveRootOrgId(rows, "inconnu")).toBeNull();
  });

  it("résiste aux cycles de parent_id", () => {
    const cyclic = [
      { id: "x", parent_id: "y" },
      { id: "y", parent_id: "x" },
    ];
    expect(["x", "y"]).toContain(resolveRootOrgId(cyclic, "x"));
  });
});

describe("parseConsentsPayload", () => {
  const base = {
    source_app: "iris",
    source_reference: "8f14e45f-ceea-4a2f-9c1d-4ea0a3f0b111",
    consents: [
      { kind: "traitement", granted: true, statement: "J'accepte que les informations…" },
      { kind: "partage", granted: false, statement: "J'accepte de partager…" },
    ],
  };

  it("accepte un recueil complet et normalise la date", () => {
    const res = parseConsentsPayload({ ...base, collected_at: "2026-09-13T08:00:00+02:00" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toHaveLength(2);
    expect(res.value[0]).toMatchObject({
      kind: "traitement", granted: true, source_app: "iris",
      source_reference: "8f14e45f-ceea-4a2f-9c1d-4ea0a3f0b111",
      collected_at: "2026-09-13T06:00:00.000Z",
    });
  });

  it("date le recueil de maintenant quand collected_at est absent", () => {
    const before = Date.now();
    const res = parseConsentsPayload(base);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Date.parse(res.value[0].collected_at)).toBeGreaterThanOrEqual(before - 1000);
  });

  it("exige la phrase soumise — c'est elle qui fait la preuve", () => {
    const res = parseConsentsPayload({
      ...base, consents: [{ kind: "traitement", granted: true, statement: "   " }],
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toContain("preuve");
  });

  it("consigne un RETRAIT de consentement (le référentiel n'exige rien)", () => {
    const res = parseConsentsPayload({
      ...base, consents: [{ kind: "traitement", granted: false, statement: "Retrait." }],
    });
    expect(res.ok && res.value[0].granted).toBe(false);
  });

  it("refuse une source absente, un type hors catalogue, un doublon, une clé inconnue", () => {
    expect(parseConsentsPayload({ ...base, source_app: "  " }).ok).toBe(false);
    expect(parseConsentsPayload({ ...base, consents: [] }).ok).toBe(false);
    expect(parseConsentsPayload({
      ...base, consents: [{ kind: "newsletter", granted: true, statement: "x" }],
    }).ok).toBe(false);
    expect(parseConsentsPayload({
      ...base,
      consents: [
        { kind: "partage", granted: true, statement: "a" },
        { kind: "partage", granted: false, statement: "b" },
      ],
    }).ok).toBe(false);
    expect(parseConsentsPayload({ ...base, contact_id: "x" }).ok).toBe(false);
    expect(parseConsentsPayload({ ...base, collected_at: "hier" }).ok).toBe(false);
  });

  it("traite une référence de dépôt vide comme absente (pas d'idempotence)", () => {
    const res = parseConsentsPayload({ ...base, source_reference: "   " });
    expect(res.ok && res.value[0].source_reference).toBeNull();
  });
});
