/**
 * `20261020120000_contacts_citizen.sql` sur PGlite : le scope `citizen`
 * (contrainte de `api_keys`) et le rattachement `citizen_contact_link`.
 * Le schéma du référentiel est réduit (voir `harness/socleDb.ts`).
 */
import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { freshSocleDb } from "./harness/socleDb.ts";

let db: PGlite;
const q = async <T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query<T>(sql, params)).rows;

let ORG: string;
let ORG2: string;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const FIELDS = { email: "camille@example.org", first_name: "Camille", last_name: "Durand", postal_code: "92330", civility: "madame", address_line1: "12 rue Houdan", city: "Sceaux" };

const link = (org: string, account: string, fields: Record<string, unknown> = FIELDS) =>
  q<{ contact_id: string; outcome: string }>("select * from public.citizen_contact_link($1, $2, $3::jsonb)", [org, account, JSON.stringify(fields)]).then((r) => r[0]);

async function seed(org: string, partial: Record<string, unknown> = {}) {
  const row = { contact_type: "personne", civility: "madame", first_name: "Camille", last_name: "Durand", email: "camille@example.org", postal_code: "92330", ...partial };
  const keys = Object.keys(row);
  return (
    await q<{ id: string }>(`insert into contacts (organization_id, ${keys.join(", ")}) values ($1, ${keys.map((_, i) => "$" + (i + 2)).join(", ")}) returning id`, [org, ...keys.map((k) => (row as Record<string, unknown>)[k])])
  )[0].id;
}

beforeEach(async () => {
  db = await freshSocleDb();
  ORG = (await q<{ id: string }>("insert into organizations (name) values ('Sceaux') returning id"))[0].id;
  ORG2 = (await q<{ id: string }>("insert into organizations (name) values ('Antony') returning id"))[0].id;
});

describe("scope citizen", () => {
  it("la contrainte accepte citizen ET garde tous les scopes d'avant (dont signatures, posé par une autre branche)", async () => {
    for (const scope of ["read", "contacts", "smtp", "ai", "audience", "integrations", "signatures", "citizen"]) {
      await db.query("insert into api_keys (key_hash, scopes) values ($1, $2)", [scope.padEnd(64, "0"), [scope]]);
    }
    await db.query("insert into api_keys (key_hash, scopes) values ($1, $2)", ["multi".padEnd(64, "0"), ["read", "citizen", "smtp"]]);
  });

  it("un scope inconnu est refusé", async () => {
    for (const scope of ["admin", "citizens", "CITIZEN", "contacts:write", ""]) {
      await expect(db.query("insert into api_keys (key_hash, scopes) values ($1, $2)", ["x".padEnd(64, "0"), [scope]])).rejects.toThrow();
    }
  });
});

describe("fermeture", () => {
  it("citizen_contact_link : service_role seulement, SECURITY DEFINER à search_path figé", async () => {
    const fn = "public.citizen_contact_link(uuid, text, jsonb)";
    const [p] = await q(
      `select has_function_privilege('anon', '${fn}', 'execute') a, has_function_privilege('authenticated', '${fn}', 'execute') u,
              has_function_privilege('public', '${fn}', 'execute') p, has_function_privilege('service_role', '${fn}', 'execute') s`,
    );
    expect(p).toEqual({ a: false, u: false, p: false, s: true });
    const [meta] = await q("select prosecdef, proconfig from pg_proc where proname = 'citizen_contact_link'");
    expect(meta.prosecdef).toBe(true);
    expect((meta.proconfig as string[]).join()).toMatch(/search_path=""/);
  });
});

describe("citizen_contact_link — invariants du rattachement", () => {
  it.each(["email", "postal_code"])("sans « %s » : refusé (22023), rien n'est créé", async (field) => {
    await expect(link(ORG, A, { ...FIELDS, [field]: "  " })).rejects.toMatchObject({ code: "22023" });
    expect((await q("select count(*)::int n from contacts"))[0]).toEqual({ n: 0 });
  });

  // ANOMALIE S2 (défense en profondeur) — `citizen_contact_link` : `v_last` et `v_first` valent
  // `normalize_name(...)`, qui rend NULL (et non '') pour un nom vide. Le garde
  // `v_last = '' or v_first = ''` vaut alors NULL, donc FAUX : un prénom ou un nom blanc ne
  // lève pas 22023 et la fonction CRÉE une fiche au prénom vide. Inatteignable aujourd'hui par
  // HTTP (`parseCitizenIdentity` refuse un nom blanc en amont), mais le garde SQL ne garde rien.
  it.fails.each(["first_name", "last_name"])("S2 — sans « %s » : refusé (22023), rien n'est créé", async (field) => {
    await expect(link(ORG, A, { ...FIELDS, [field]: "  " })).rejects.toMatchObject({ code: "22023" });
    expect((await q("select count(*)::int n from contacts"))[0]).toEqual({ n: 0 });
  });

  // OBSERVATION S3 — `normalize_name` ne garde que [a-z0-9] après suppression des accents latins :
  // un nom en caractères non latins (cyrillique, arabe, chinois…) se normalise en NULL, ne
  // correspond donc JAMAIS à une fiche existante, et crée une fiche neuve à chaque premier
  // rattachement (doublon sûr, jamais une fuite). Comportement voulu à confirmer avec le PO.
  it.fails("S3 — un nom non latin identique rattache la fiche existante", async () => {
    const id = await seed(ORG, { first_name: "Иван", last_name: "Иванов", email: "ivan@example.org" });
    const r = await link(ORG, A, { ...FIELDS, first_name: "Иван", last_name: "Иванов", email: "ivan@example.org" });
    expect(r).toEqual({ contact_id: id, outcome: "existing" });
  });

  it("crée une fiche neuve, la référence portail_citoyen, dans la bonne collectivité (dérivée du contact)", async () => {
    const r = await link(ORG, A);
    expect(r.outcome).toBe("created");
    const [ref] = await q("select organization_id, source, external_id, contact_id from contact_external_references");
    expect(ref).toEqual({ organization_id: ORG, source: "portail_citoyen", external_id: A, contact_id: r.contact_id });
  });

  it("rejouer renvoie already_linked et la même fiche, sans écrire", async () => {
    const first = await link(ORG, A);
    const again = await link(ORG, A, { ...FIELDS, first_name: "Autre", email: "autre@example.org" });
    expect(again).toEqual({ contact_id: first.contact_id, outcome: "already_linked" });
    expect((await q("select count(*)::int n from contacts"))[0]).toEqual({ n: 1 });
  });

  it("un même identifiant de compte, deux collectivités : deux fiches", async () => {
    const a = await link(ORG, A);
    const b = await link(ORG2, A);
    expect(a.contact_id).not.toBe(b.contact_id);
    expect((await q("select count(*)::int n from contact_external_references"))[0]).toEqual({ n: 2 });
  });

  it("la référence externe est unique par (collectivité, source, identifiant) : on ne déplace pas un compte vers une autre fiche", async () => {
    const r = await link(ORG, A);
    const other = await seed(ORG, { email: "autre@example.org" });
    await expect(db.query("insert into contact_external_references (contact_id, source, external_id) values ($1, 'portail_citoyen', $2)", [other, A])).rejects.toThrow(/unique|duplicate/i);
    expect((await q("select contact_id from contact_external_references"))[0]).toEqual({ contact_id: r.contact_id });
  });

  it("une fiche ne porte qu'UNE référence portail_citoyen", async () => {
    const id = await seed(ORG);
    await link(ORG, A);
    await expect(db.query("insert into contact_external_references (contact_id, source, external_id) values ($1, 'portail_citoyen', $2)", [id, B])).rejects.toThrow();
    await expect(db.query("insert into contact_external_references (contact_id, source, external_id) values ($1, 'portail_citoyen', $2)", [id, "33333333-3333-4333-8333-333333333333"])).rejects.toThrow();
  });

  it("table de décision du rattachement (une ligne = un cas)", async () => {
    const existing = await seed(ORG, { birth_date: "1990-05-17" });
    const cases: [string, Record<string, unknown>, "existing" | "created"][] = [
      ["tout concorde + date", { birth_date: "1990-05-17" }, "existing"],
      ["tout concorde, sans date fournie", {}, "created"],
      ["date différente", { birth_date: "1990-05-18" }, "created"],
      ["casse et accents", { first_name: "CAMILLE", last_name: "dürand", birth_date: "1990-05-17" }, "existing"],
      ["code postal avec espace", { postal_code: "92 330", birth_date: "1990-05-17" }, "existing"],
      ["autre code postal", { postal_code: "92160", birth_date: "1990-05-17" }, "created"],
      ["autre courriel", { email: "x@example.org", birth_date: "1990-05-17" }, "created"],
      ["courriel en majuscules", { email: "CAMILLE@EXAMPLE.ORG", birth_date: "1990-05-17" }, "existing"],
    ];
    let n = 100;
    for (const [label, extra, expected] of cases) {
      await db.exec("delete from contact_external_references where source = 'portail_citoyen'");
      await db.exec("delete from contacts where id <> '" + existing + "'");
      const r = await link(ORG, `${n++}00000-0000-4000-8000-000000000000`, { ...FIELDS, ...extra });
      expect(r.outcome, label).toBe(expected);
      if (expected === "existing") expect(r.contact_id, label).toBe(existing);
      else expect(r.contact_id, label).not.toBe(existing);
    }
  });

  it("deux rattachements simultanés de la même adresse (sérialisés par verrou) ne créent pas de doublon pour deux comptes différents sur la même fiche", async () => {
    const id = await seed(ORG);
    const [r1, r2] = await Promise.all([link(ORG, A), link(ORG, B)]);
    expect([r1.outcome, r2.outcome].sort()).toEqual(["created", "existing"]);
    expect([r1.contact_id, r2.contact_id]).toContain(id);
    expect(new Set([r1.contact_id, r2.contact_id]).size).toBe(2);
  });

  // ANOMALIE S1 (mineure) — voir citizen.contract.test.ts : une date impossible passe la forme
  // AAAA-MM-JJ et fait lever `22008` au `::date`, au lieu d'un refus de validation.
  it.fails("S1 — une date de naissance impossible est refusée comme une saisie invalide (22023), pas comme une erreur de conversion", async () => {
    await expect(link(ORG, A, { ...FIELDS, birth_date: "1990-02-31" })).rejects.toMatchObject({ code: "22023" });
  });

  it("(contrôle S1) la date impossible ne crée rien", async () => {
    await expect(link(ORG, A, { ...FIELDS, birth_date: "1990-02-31" })).rejects.toThrow();
    expect((await q("select count(*)::int n from contacts"))[0]).toEqual({ n: 0 });
  });
});
