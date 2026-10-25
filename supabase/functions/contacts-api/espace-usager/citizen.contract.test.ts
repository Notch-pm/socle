/**
 * CONTRAT ANTI-FUITE de contacts-api côté usager (scope `citizen`, 1.4.0) :
 * `/v1/citizen/contacts/{account_id}[/link|/consents|/account-email]`.
 *
 * `index.ts` est exécuté pour de bon ; sa base est PGlite avec la VRAIE
 * migration `20261020120000_contacts_citizen.sql` (voir `harness/socleDb.ts`).
 * Les fiches du référentiel portent une note interne sentinelle : si elle, ou
 * tout autre champ interne, apparaît dans une réponse, le test échoue.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IDENTITY, KEY, SocleWorld, type Reply } from "./harness/socleWorld.ts";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";

const SENTINELLES = ["NOTE INTERNE", "internal_notes", "organization_id", "display_name", "external_references", "created_at", "updated_at", "contact_roles", "quartier"];

let world: SocleWorld;
const replies: Reply[] = [];

async function call(...args: Parameters<SocleWorld["call"]>): Promise<Reply> {
  const reply = await world.call(...args);
  replies.push(reply);
  return reply;
}

beforeEach(async () => {
  replies.length = 0;
  world = await SocleWorld.create();
});
afterEach(async () => {
  for (const reply of replies) {
    // Un refus 4xx répète le NOM du champ fautif envoyé par l'appelant : seules les réponses de succès portent la liste complète.
    const forbidden = reply.status < 300 ? SENTINELLES : ["NOTE INTERNE"];
    for (const s of forbidden) expect(reply.text, `« ${s} » dans une réponse (${reply.status})`).not.toContain(s);
    expect(reply.text).not.toContain(KEY);
  }
  await world.close();
});

const link = (account: string, json: Record<string, unknown> = IDENTITY, org?: string | null) =>
  call("POST", `/v1/citizen/contacts/${account}/link`, { json, org });
const get = (account: string, org?: string | null) => call("GET", `/v1/citizen/contacts/${account}`, { org });

describe("clé, scope et collectivité", () => {
  it("sans clé, clé inconnue, révoquée ou expirée : 401", async () => {
    await world.addKey("sk_revoked", ["citizen"], { consumer: "nora", revoked: true });
    await world.addKey("sk_expired", ["citizen"], { consumer: "nora", expired: true });
    for (const key of [null, "sk_inconnue", "sk_revoked", "sk_expired"]) {
      expect((await call("GET", `/v1/citizen/contacts/${ACCOUNT_A}`, { key })).status, String(key)).toBe(401);
    }
  });

  it("le scope citizen n'ouvre pas le référentiel (contacts) et réciproquement", async () => {
    await world.addKey("sk_citizen_only", ["citizen"], { consumer: "nora" });
    await world.addKey("sk_contacts_only", ["contacts"], { consumer: "clara" });
    await world.db.query("insert into org_applications (organization_id, application) values ($1, 'clara')", [world.sceaux]);
    // Un client « contacts » ne lit aucune fiche par la porte usager…
    expect((await call("GET", `/v1/citizen/contacts/${ACCOUNT_A}`, { key: "sk_contacts_only" })).status).toBe(403);
    expect((await call("POST", `/v1/citizen/contacts/${ACCOUNT_A}/link`, { key: "sk_contacts_only", json: IDENTITY })).status).toBe(403);
    // … et la clé du portail ne lit pas le référentiel entier (notes internes comprises).
    for (const path of ["/v1/contacts", "/v1/contacts?email=camille@example.org", "/v1/contact-roles"]) {
      expect((await call("GET", path, { key: "sk_citizen_only" })).status, path).toBe(403);
    }
    // La clé de Nora (read, citizen, smtp) n'a pas non plus le scope contacts.
    expect((await call("GET", "/v1/contacts")).status).toBe(403);
  });

  it("clé plateforme sans application : aucun périmètre, aucune donnée", async () => {
    await world.addKey("sk_orpheline", ["citizen"], { consumer: null });
    expect((await call("GET", `/v1/citizen/contacts/${ACCOUNT_A}`, { key: "sk_orpheline" })).status).toBe(403);
  });

  it("clé plateforme : la collectivité est exigée, connue, et abonnée à l'application de la clé", async () => {
    expect((await get(ACCOUNT_A, null)).status).toBe(400);
    expect((await get(ACCOUNT_A, "pas-un-uuid")).status).toBe(400);
    expect((await get(ACCOUNT_A, crypto.randomUUID())).status).toBe(404);
    const unsubscribed = (await world.db.query<{ id: string }>("insert into organizations (name) values ('Hors abonnement') returning id")).rows[0].id;
    expect((await get(ACCOUNT_A, unsubscribed)).status).toBe(404);
  });

  it("une clé liée à UNE collectivité ne sert que celle-là, quoi que dise l'en-tête", async () => {
    await world.addKey("sk_sceaux", ["citizen"], { organizationId: world.sceaux });
    await link(ACCOUNT_A);
    expect((await call("GET", `/v1/citizen/contacts/${ACCOUNT_A}`, { key: "sk_sceaux", org: world.antony })).status).toBe(200);
    // Antony n'a rien pour ce compte : seule la clé liée à Sceaux a vu SA fiche.
    expect((await get(ACCOUNT_A, world.antony)).status).toBe(404);
  });

  it("l'organisme enfant ramène à la collectivité racine : une seule fiche par collectivité", async () => {
    const created = await link(ACCOUNT_A, IDENTITY, world.sceauxQuartier);
    expect(created.status).toBe(201);
    expect((await get(ACCOUNT_A, world.sceaux)).status).toBe(200);
    expect((await get(ACCOUNT_A, world.sceauxQuartier)).status).toBe(200);
    expect((await world.sql("select organization_id from contacts"))[0]).toEqual({ organization_id: world.sceaux });
  });
});

describe("isolation entre collectivités et entre comptes", () => {
  it("un même compte : une fiche par collectivité, jamais l'une dans l'autre", async () => {
    const s = await link(ACCOUNT_A, IDENTITY, world.sceaux);
    const a = await link(ACCOUNT_A, { ...IDENTITY, postal_code: "92160", city: "Antony" }, world.antony);
    expect(s.body.contact.id).not.toBe(a.body.contact.id);
    expect((await get(ACCOUNT_A, world.sceaux)).body.contact.id).toBe(s.body.contact.id);
    expect((await get(ACCOUNT_A, world.antony)).body.contact.id).toBe(a.body.contact.id);
    expect((await get(ACCOUNT_A, world.antony)).body.contact.postal_code).toBe("92160");
  });

  it("deux comptes, deux fiches : aucun ne lit, modifie ou consent pour l'autre", async () => {
    await link(ACCOUNT_A, IDENTITY);
    await link(ACCOUNT_B, { ...IDENTITY, first_name: "Basile", email: "basile@example.org" });
    const a = await get(ACCOUNT_A);
    const b = await get(ACCOUNT_B);
    expect(a.body.contact.first_name).toBe("Camille");
    expect(b.body.contact.first_name).toBe("Basile");
    await call("PATCH", `/v1/citizen/contacts/${ACCOUNT_A}`, { json: { mobile_phone: "0612345678" } });
    expect((await get(ACCOUNT_B)).body.contact.mobile_phone).toBeNull();
    await call("POST", `/v1/citizen/contacts/${ACCOUNT_A}/consents`, { json: { kind: "partage", granted: true } });
    expect((await get(ACCOUNT_B)).body.contact.consent_partage_at).toBeNull();
  });

  it("un compte sans fiche, ou une fiche d'une autre collectivité : 404 (même corps)", async () => {
    await link(ACCOUNT_A, IDENTITY, world.sceaux);
    const unknown = await get(ACCOUNT_B);
    const elsewhere = await get(ACCOUNT_A, world.antony);
    expect(unknown.status).toBe(404);
    expect(elsewhere.status).toBe(404);
    expect(elsewhere.body).toEqual(unknown.body);
  });

  it("l'identifiant de compte doit être un UUID : jamais un identifiant de fiche, ni un chemin", async () => {
    const id = await world.seedContact(world.sceaux);
    for (const bad of [id.slice(0, 35), "pas-un-uuid", "../contacts", `${ACCOUNT_A}%2f..`, "1"]) {
      const reply = await call("GET", `/v1/citizen/contacts/${bad}`);
      expect(reply.status, bad).toBe(404);
    }
    // Un identifiant de fiche n'est pas un identifiant de compte : il ne désigne rien.
    expect((await get(id)).status).toBe(404);
  });

  it("une fiche archivée n'est plus servie à son titulaire ; un recueil de consentement est refusé et n'écrit rien", async () => {
    await link(ACCOUNT_A, IDENTITY);
    await world.db.exec("update contacts set status = 'archived'");
    expect((await get(ACCOUNT_A)).status).toBe(404);
    expect((await call("POST", `/v1/citizen/contacts/${ACCOUNT_A}/consents`, { json: { kind: "partage", granted: true } })).status).toBe(404);
    expect((await call("PATCH", `/v1/citizen/contacts/${ACCOUNT_A}`, { json: { city: "Ailleurs" } })).status).toBe(404);
    expect((await world.sql("select count(*)::int n from contact_consents"))[0]).toEqual({ n: 0 });
    expect((await world.sql("select city from contacts"))[0]).toEqual({ city: "Sceaux" });
  });
});

describe("liste blanche de la fiche", () => {
  it("n'expose que l'identité, les coordonnées et les consentements — jamais la note interne d'une fiche existante", async () => {
    await world.seedContact(world.sceaux, { birth_date: null });
    const linked = await link(ACCOUNT_A, IDENTITY);
    expect(linked.status).toBe(200);
    expect(linked.body.outcome).toBe("existing");
    expect(Object.keys(linked.body.contact).sort()).toEqual([
      "address_line1", "address_line2", "birth_date", "city", "civility", "consent_partage", "consent_partage_at", "consent_traitement",
      "consent_traitement_at", "country", "email", "first_name", "id", "landline_phone", "last_name", "mobile_phone", "postal_code", "usage_name",
    ]);
    expect(Object.keys(linked.body).sort()).toEqual(["contact", "outcome"]);
    expect(Object.keys((await get(ACCOUNT_A)).body).sort()).toEqual(["contact"]);
  });
});

describe("rattachement STRICT (courriel + nom + prénom + code postal + date de naissance)", () => {
  async function outcome(identity: Record<string, unknown>, account = ACCOUNT_A) {
    const reply = await link(account, { ...IDENTITY, ...identity });
    return { status: reply.status, outcome: reply.body.outcome as string, id: reply.body.contact?.id as string };
  }

  it("fiche concordante : rattachée (200) ; la fiche existante est reprise, pas dupliquée", async () => {
    const id = await world.seedContact(world.sceaux);
    expect(await outcome({})).toEqual({ status: 200, outcome: "existing", id });
    expect((await world.sql("select count(*)::int n from contacts"))[0]).toEqual({ n: 1 });
  });

  it("tolère casse, accents, espaces du code postal et nom d'usage ; mais pas un autre prénom", async () => {
    const id = await world.seedContact(world.sceaux, { first_name: "Élodie", last_name: "Lefèvre", usage_name: "Martin", postal_code: "92 330" });
    expect(await outcome({ first_name: "ELODIE", last_name: "lefevre" })).toMatchObject({ outcome: "existing", id });
    await world.db.exec("delete from contact_external_references");
    expect(await outcome({ first_name: "elodie", last_name: "MARTIN", postal_code: "92330" })).toMatchObject({ outcome: "existing", id });
    await world.db.exec("delete from contact_external_references");
    expect(await outcome({ first_name: "Élise", last_name: "Lefèvre" })).toMatchObject({ outcome: "created" });
  });

  it.each([
    ["autre adresse de courriel", { email: "autre@example.org" }],
    ["autre nom", { last_name: "Martin" }],
    ["autre prénom", { first_name: "Camilla" }],
    ["autre code postal", { postal_code: "92160" }],
  ])("%s : fiche NEUVE (201), jamais celle d'un autre", async (_label, identity) => {
    const existing = await world.seedContact(world.sceaux);
    const r = await outcome(identity);
    expect(r.status).toBe(201);
    expect(r.outcome).toBe("created");
    expect(r.id).not.toBe(existing);
  });

  it("date de naissance : exigée SI la fiche en porte une ; une fiche sans date n'en exige pas", async () => {
    const withBirth = await world.seedContact(world.sceaux, { email: "naissance@example.org", birth_date: "1990-05-17" });
    const noBirth = await world.seedContact(world.sceaux, { email: "sans@example.org", first_name: "Sans", birth_date: null });
    // Date absente ou fausse : pas de rattachement.
    expect((await outcome({ email: "naissance@example.org" }, ACCOUNT_A)).outcome).toBe("created");
    expect((await outcome({ email: "naissance@example.org", birth_date: "1991-05-17" }, ACCOUNT_B)).outcome).toBe("created");
    const third = "33333333-3333-4333-8333-333333333333";
    expect(await outcome({ email: "naissance@example.org", birth_date: "1990-05-17" }, third)).toMatchObject({ outcome: "existing", id: withBirth });
    const fourth = "44444444-4444-4444-8444-444444444444";
    expect(await outcome({ email: "sans@example.org", first_name: "Sans" }, fourth)).toMatchObject({ outcome: "existing", id: noBirth });
  });

  it("deux fiches candidates : l'ambiguïté se tranche en fiche neuve, jamais au hasard", async () => {
    const a = await world.seedContact(world.sceaux);
    const b = await world.seedContact(world.sceaux);
    const r = await outcome({});
    expect(r.outcome).toBe("created");
    expect([a, b]).not.toContain(r.id);
  });

  it("une fiche déjà tenue par un AUTRE compte ne se reprend pas", async () => {
    const id = await world.seedContact(world.sceaux);
    expect(await outcome({}, ACCOUNT_A)).toMatchObject({ outcome: "existing", id });
    const second = await outcome({}, ACCOUNT_B);
    expect(second.outcome).toBe("created");
    expect(second.id).not.toBe(id);
    expect((await get(ACCOUNT_A)).body.contact.id).toBe(id); // le premier titulaire n'a pas bougé
  });

  it("fiche archivée, ou autre type de fiche (entreprise) : jamais reprise", async () => {
    await world.seedContact(world.sceaux, { status: "archived" });
    await world.seedContact(world.sceaux, { contact_type: "entreprise", civility: null, legal_name: "Durand SARL", first_name: null, last_name: null });
    expect((await outcome({})).outcome).toBe("created");
  });

  it("fiche d'une AUTRE collectivité : invisible au rattachement", async () => {
    await world.seedContact(world.antony);
    expect((await outcome({})).outcome).toBe("created");
  });

  it("rejouer le rattachement renvoie la même fiche (200 already_linked) sans rien recréer — même avec une autre identité", async () => {
    const first = await outcome({});
    const again = await outcome({ first_name: "Quelqu'un", last_name: "D'autre", email: "autre@example.org" });
    expect(again).toEqual({ status: 200, outcome: "already_linked", id: first.id });
    expect((await world.sql("select count(*)::int n from contacts"))[0]).toEqual({ n: 1 });
  });

  it("l'adresse du compte est normalisée en minuscules ; une adresse mal formée est refusée avant tout", async () => {
    const id = await world.seedContact(world.sceaux, { email: "camille@example.org" });
    expect(await outcome({ email: "CAMILLE@Example.ORG" })).toMatchObject({ outcome: "existing", id });
    for (const email of ["", "a@@b.fr", "a b@c.fr", "<a@b.fr>", "a@b", 12]) {
      expect((await link(ACCOUNT_B, { ...IDENTITY, email })).status, String(email)).toBe(400);
    }
  });

  it("identité incomplète, champ inconnu, types faux : 400, rien n'est écrit", async () => {
    const before = (await world.sql("select count(*)::int n from contacts"))[0];
    const bad: Record<string, unknown>[] = [
      { ...IDENTITY, civility: "autre" },
      { ...IDENTITY, first_name: undefined },
      { ...IDENTITY, last_name: "" },
      { ...IDENTITY, postal_code: "9233" },
      { ...IDENTITY, postal_code: "9233a" },
      { ...IDENTITY, city: undefined },
      { ...IDENTITY, address_line1: undefined },
      { ...IDENTITY, status: "archived" },
      { ...IDENTITY, internal_notes: "x" },
      { ...IDENTITY, organization_id: world.antony },
      { ...IDENTITY, consent_traitement: true },
      { ...IDENTITY, mobile_phone: "abc" },
      { ...IDENTITY, birth_date: "17/05/1990" },
      { ...IDENTITY, first_name: "x".repeat(201) },
    ];
    for (const json of bad) expect((await link(ACCOUNT_A, json)).status, JSON.stringify(json)).toBe(400);
    expect((await call("POST", `/v1/citizen/contacts/${ACCOUNT_A}/link`, { body: "{" })).status).toBe(400);
    expect((await call("POST", `/v1/citizen/contacts/${ACCOUNT_A}/link`, { json: [] })).status).toBe(400);
    expect((await world.sql("select count(*)::int n from contacts"))[0]).toEqual(before);
  });

  // S1 (corrigée le 2026-10-20) — `parseCitizenIdentity` (contacts-api/_shared/citizen.ts) ne contrôle
  // la date de naissance que par sa FORME (AAAA-MM-JJ). « 1990-02-31 » traverse, puis le
  // `::date` de `citizen_contact_link` lève 22008 : réponse 500 « Erreur interne » au lieu d'un
  // 400 sur le champ. Côté usager (Nora), « service momentanément indisponible ».
  it("S1 — une date de naissance impossible est refusée en 400 (champ birth_date), pas en 500", async () => {
    const reply = await link(ACCOUNT_A, { ...IDENTITY, birth_date: "1990-02-31" });
    expect(reply.status).toBe(400);
  });
});

describe("coordonnées (PATCH)", () => {
  beforeEach(async () => {
    await link(ACCOUNT_A, { ...IDENTITY, birth_date: "1990-05-17" });
  });
  const patch = (json: unknown) => call("PATCH", `/v1/citizen/contacts/${ACCOUNT_A}`, { json });

  it("modifie les coordonnées et le nom d'usage", async () => {
    const reply = await patch({ mobile_phone: "06 12 34 56 78", landline_phone: null, address_line2: "Bât. B", usage_name: "Martin", city: "Sceaux", postal_code: "92330" });
    expect(reply.status).toBe(200);
    expect(reply.body.contact).toMatchObject({ mobile_phone: "06 12 34 56 78", address_line2: "Bât. B", usage_name: "Martin" });
  });

  it.each([
    "first_name", "last_name", "birth_date", "civility", "email", "status", "internal_notes", "organization_id", "id",
    "consent_traitement", "consent_partage_at", "contact_type", "external_references", "display_name",
  ])("le champ « %s » n'est pas modifiable par l'usager (400) — l'identité se corrige auprès de la collectivité", async (field) => {
    const reply = await patch({ [field]: "x", mobile_phone: "0612345678" });
    expect(reply.status).toBe(400);
    expect((await world.sql("select mobile_phone from contacts"))[0]).toEqual({ mobile_phone: null });
  });

  it("une adresse, un code postal ou une ville ne peuvent pas être vidés ; un code postal faux est refusé", async () => {
    for (const json of [{ address_line1: null }, { postal_code: null }, { city: "" }, { postal_code: "123" }, { mobile_phone: "1" }, {}, []]) {
      expect((await patch(json)).status, JSON.stringify(json)).toBe(400);
    }
    expect((await world.sql("select address_line1, postal_code, city from contacts"))[0]).toEqual({ address_line1: "12 rue Houdan", postal_code: "92330", city: "Sceaux" });
  });

  it("l'identité n'a pas bougé après toutes ces tentatives", async () => {
    await patch({ first_name: "Pirate" });
    await patch({ email: "pirate@example.org" });
    expect((await world.sql("select first_name, last_name, email, birth_date::text from contacts"))[0]).toEqual({
      first_name: "Camille", last_name: "Durand", email: "camille@example.org", birth_date: "1990-05-17",
    });
  });
});

describe("adresse du compte (1.5.0)", () => {
  beforeEach(async () => {
    await link(ACCOUNT_A, IDENTITY);
  });
  const align = (json: unknown, account = ACCOUNT_A) => call("POST", `/v1/citizen/contacts/${account}/account-email`, { json });

  it("la fiche prend l'adresse du compte, en minuscules — et rien d'autre ne bouge", async () => {
    const reply = await align({ email: "Camille.Nouvelle@Example.org" });
    expect(reply.status).toBe(200);
    expect(reply.body.contact).toMatchObject({ email: "camille.nouvelle@example.org", first_name: "Camille" });
    expect((await world.sql("select email, first_name, city from contacts"))[0]).toEqual({
      email: "camille.nouvelle@example.org", first_name: "Camille", city: "Sceaux",
    });
    // Idempotent.
    expect((await align({ email: "camille.nouvelle@example.org" })).status).toBe(200);
  });

  it("refuse toute autre clé et une adresse malformée (400), sans rien écrire", async () => {
    for (const json of [{ email: "a@b.fr", first_name: "Pirate" }, { email: "pas-une-adresse" }, {}, []]) {
      expect((await align(json)).status, JSON.stringify(json)).toBe(400);
    }
    expect((await world.sql("select email, first_name from contacts"))[0]).toEqual({ email: "camille@example.org", first_name: "Camille" });
  });

  it("un compte sans fiche : 404 ; seul POST est permis", async () => {
    expect((await align({ email: "b@example.org" }, ACCOUNT_B)).status).toBe(404);
    expect((await call("PATCH", `/v1/citizen/contacts/${ACCOUNT_A}/account-email`, { json: { email: "a@b.fr" } })).status).toBe(405);
  });

  it("PATCH refuse toujours email : l'usager ne saisit jamais une adresse propre à la fiche", async () => {
    expect((await call("PATCH", `/v1/citizen/contacts/${ACCOUNT_A}`, { json: { email: "libre@example.org" } })).status).toBe(400);
  });
});

describe("consentements", () => {
  beforeEach(async () => {
    await link(ACCOUNT_A, IDENTITY);
  });
  const consent = (json: unknown) => call("POST", `/v1/citizen/contacts/${ACCOUNT_A}/consents`, { json });

  it("accorder puis retirer : deux recueils datés ; le Socle compose la phrase avec le nom de la collectivité", async () => {
    expect((await get(ACCOUNT_A)).body.contact).toMatchObject({ consent_partage: false, consent_partage_at: null }); // jamais demandé : la date tranche
    const granted = await consent({ kind: "partage", granted: true });
    expect(granted.status).toBe(201);
    expect(granted.body.contact.consent_partage).toBe(true);
    expect(granted.body.contact.consent_partage_at).not.toBeNull();
    await world.db.exec("update contact_consents set collected_at = collected_at - interval '1 minute'");
    const withdrawn = await consent({ kind: "partage", granted: false });
    expect(withdrawn.body.contact).toMatchObject({ consent_partage: false });
    expect(withdrawn.body.contact.consent_partage_at).not.toBeNull();
    const rows = await world.sql<{ kind: string; granted: boolean; statement: string; source_app: string; source_reference: string | null }>(
      "select kind, granted, statement, source_app, source_reference from contact_consents order by collected_at",
    );
    expect(rows.map((r) => r.granted)).toEqual([true, false]);
    expect(rows[0]).toMatchObject({ kind: "partage", source_app: "portail-citoyen" });
    // Le compte qui a agi est consigné ; deux recueils du même compte coexistent (référence horodatée).
    for (const row of rows) expect(row.source_reference).toMatch(new RegExp(`^compte:${ACCOUNT_A}:\\d{4}-`));
    expect(rows[0].source_reference).not.toBe(rows[1].source_reference);
    expect(rows[0].statement).toContain("Ville de Sceaux");
    expect(rows[0].statement).toMatch(/partager ces informations/);
  });

  it("le recueil du traitement a sa propre phrase, sans nom de collectivité", async () => {
    await consent({ kind: "traitement", granted: true });
    const [row] = await world.sql<{ statement: string }>("select statement from contact_consents");
    expect(row.statement).toBe("J'accepte que les informations fournies ici soient utilisées dans le cadre du traitement de ma demande.");
  });

  it.each([
    [{ kind: "partage", granted: true, statement: "J'accepte tout" }],
    [{ kind: "partage", granted: true, source_app: "iris" }],
    [{ kind: "partage", granted: true, collected_at: "2020-01-01T00:00:00Z" }],
    [{ kind: "sms", granted: true }],
    [{ kind: "partage", granted: "true" }],
    [{ kind: "partage" }],
    [{ granted: true }],
    [[]],
    [null],
  ])("%j : refusé (400) — le navigateur n'envoie que { kind, granted }, la phrase et la source ne se choisissent pas", async (body) => {
    expect((await consent(body)).status).toBe(400);
    expect((await world.sql("select count(*)::int n from contact_consents"))[0]).toEqual({ n: 0 });
  });

  it("l'origine vient de la clé : une clé sans application connue ne consigne rien (403)", async () => {
    await world.addKey("sk_sceaux", ["citizen"], { organizationId: world.sceaux });
    await world.addKey("sk_autre", ["citizen"], { consumer: "autre-portail" });
    await world.db.query("insert into org_applications (organization_id, application) values ($1, 'autre-portail')", [world.sceaux]);
    for (const key of ["sk_sceaux", "sk_autre"]) {
      const reply = await call("POST", `/v1/citizen/contacts/${ACCOUNT_A}/consents`, { key, json: { kind: "partage", granted: true } });
      expect(reply.status, key).toBe(403);
    }
    expect((await world.sql("select count(*)::int n from contact_consents"))[0]).toEqual({ n: 0 });
  });

  it("un compte sans fiche ne consigne rien", async () => {
    const reply = await call("POST", `/v1/citizen/contacts/${ACCOUNT_B}/consents`, { json: { kind: "partage", granted: true } });
    expect(reply.status).toBe(404);
    expect((await world.sql("select count(*)::int n from contact_consents"))[0]).toEqual({ n: 0 });
  });

  it("un recueil plus ancien que l'état courant ne l'écrase pas (le dernier recueil fait foi)", async () => {
    await consent({ kind: "partage", granted: false });
    await world.db.exec("update contacts set consent_partage = false, consent_partage_at = now() + interval '1 hour'");
    await consent({ kind: "partage", granted: true });
    expect((await get(ACCOUNT_A)).body.contact.consent_partage).toBe(false);
  });
});

describe("méthodes et routes", () => {
  it("méthode non prévue : 405 ; route inconnue : 404 ; jamais de suppression", async () => {
    await link(ACCOUNT_A);
    expect((await call("DELETE", `/v1/citizen/contacts/${ACCOUNT_A}`)).status).toBe(405);
    expect((await call("PUT", `/v1/citizen/contacts/${ACCOUNT_A}`)).status).toBe(405);
    expect((await call("GET", `/v1/citizen/contacts/${ACCOUNT_A}/link`)).status).toBe(405);
    expect((await call("GET", `/v1/citizen/contacts/${ACCOUNT_A}/consents`)).status).toBe(405);
    expect((await call("GET", `/v1/citizen/contacts/${ACCOUNT_A}/archive`)).status).toBe(404);
    expect((await call("GET", "/v1/citizen/contacts")).status).toBe(404);
    expect((await call("GET", "/v1/citizen/")).status).toBe(404);
    expect((await world.sql("select count(*)::int n from contacts"))[0]).toEqual({ n: 1 });
  });
});
