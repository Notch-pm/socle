import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { extractArray, fetchArpegeCatalogue, parseCatalogue } from "./arpegeCatalogue";
import { partnerCategoryName, planImport } from "./importPlan";

// Réponses Arpège à la forme lue par Clara (sync-arpege-services).
const FORMS = {
  IsSuccess: true,
  Data: {
    Results: [
      {
        data_administratives: { CodeQualificationTypeDemande: "VOIRIE" },
        data_formulaire: { Components: [{ id: "lieu", type: "text" }] },
      },
      // Second formulaire du même type : le premier l'emporte (règle de Clara).
      {
        data_administratives: { CodeQualificationTypeDemande: "VOIRIE" },
        data_formulaire: { Components: [{ id: "autre" }] },
      },
    ],
  },
};

const TYPES = {
  IsSuccess: true,
  Data: [
    {
      CodeQualificationTypeDemande: "VOIRIE",
      LibelleQualificationTypeDemande: "Signaler un problème de voirie",
      Description: "  Nids-de-poule, trottoirs  ",
      CodeQualificationMetier: "M_VOIRIE",
      TypeEtatPublication: "ENLIGNE",
      ConfigInfoUsagerObligs: [
        { Code: "EMAIL", Etat: "ENLIGNE" },
        { Code: "TEL", Etat: "HORSLIGNE" },
      ],
    },
    { CodeQualificationTypeDemande: "BROUILLON", Libelle: "Pas publiée", TypeEtatPublication: "BROUILLON" },
    { IdTypeDemande: 42, Libelle: "Sans état" },
    { CodeQualificationTypeDemande: "", Libelle: "Sans code" },
  ],
};

describe("parseCatalogue — règles portées de Clara", () => {
  const procedures = parseCatalogue(FORMS, TYPES, null);

  it("garde les démarches publiées ou sans état, écarte le reste", () => {
    expect(procedures.map((p) => p.reference)).toEqual(["VOIRIE", "42"]);
  });

  it("configuration = arpege_config_fields de Clara", () => {
    expect(procedures[0]).toEqual({
      reference: "VOIRIE",
      name: "Signaler un problème de voirie",
      description: "Nids-de-poule, trottoirs",
      config: {
        CodeQualificationMetier: "M_VOIRIE",
        ConfigInfoUsagerObligs: [{ Code: "EMAIL", Etat: "ENLIGNE" }],
        FormComponents: [{ id: "lieu", type: "text" }],
      },
    });
    expect(procedures[1].config).toEqual({
      CodeQualificationMetier: null,
      ConfigInfoUsagerObligs: [],
      FormComponents: null,
    });
  });

  it("repli sur /v2/Demandes quand TypesDemandes est vide", () => {
    const fallback = { Data: [{ IdTypeDemande: "7", LibelleTypeDemande: "Encombrants" }, { IdTypeDemande: "7", LibelleTypeDemande: "Doublon" }] };
    expect(parseCatalogue(null, { Data: [] }, fallback).map((p) => [p.reference, p.name])).toEqual([["7", "Encombrants"]]);
  });

  it("extractArray reconnaît toutes les enveloppes", () => {
    expect(extractArray([1])).toEqual([1]);
    expect(extractArray({ Data: { results: [2] } })).toEqual([2]);
    expect(extractArray({ nope: true })).toEqual([]);
  });
});

describe("fetchArpegeCatalogue", () => {
  const SETTINGS = { api_base_url: "https://api.test/accm/", client_id: "cid" };
  const SECRETS = { client_secret: "s3cret" };

  it("trois appels signés Hawk, sur l'URL normalisée", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.includes("TypesDemandes") ? TYPES : FORMS), { status: 200 }),
    ) as unknown as typeof fetch;
    const result = await fetchArpegeCatalogue(SETTINGS, SECRETS, fetchImpl);
    expect(result.ok).toBe(true);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.map(([url]) => url)).toEqual([
      "https://api.test/accm/v2/Demandes?scope=data_formulaire,data_administratives&TypeDemarches=DEMANDE&pageSize=200",
      "https://api.test/accm/v2/TypesDemandes",
    ]);
    expect(calls[0][1].headers.Authorization).toMatch(/^Hawk id="cid"/);
  });

  it("aucune liste renvoyée → échec lisible, sans secret", async () => {
    const fetchImpl = vi.fn(async () => new Response("non", { status: 401 })) as unknown as typeof fetch;
    const result = await fetchArpegeCatalogue(SETTINGS, SECRETS, fetchImpl);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("s3cret");
  });

  it("sans identifiants ou en http : ne contacte rien", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect((await fetchArpegeCatalogue({ api_base_url: "https://x.test" }, {}, fetchImpl)).ok).toBe(false);
    expect((await fetchArpegeCatalogue({ ...SETTINGS, api_base_url: "http://x.test" }, SECRETS, fetchImpl)).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("planImport", () => {
  const catalogue = parseCatalogue(FORMS, TYPES, null);

  it("crée ce qui manque, met à jour ce qui a changé, signale ce qui a disparu", () => {
    const plan = planImport(
      [
        { id: "a", external_reference: "VOIRIE", name: "Ancien nom", short_description: null, partner_config: {} },
        { id: "b", external_reference: "GONE", name: "Disparue", short_description: null, partner_config: {} },
      ],
      catalogue,
    );
    expect(plan.toInsert.map((p) => p.reference)).toEqual(["42"]);
    expect(plan.toUpdate.map((u) => u.id)).toEqual(["a"]);
    expect(plan.missing).toEqual(["Disparue"]);
  });

  it("un second import identique ne change rien (ordre des clés jsonb indifférent)", () => {
    const voirie = catalogue[0];
    const reordered = {
      FormComponents: voirie.config.FormComponents,
      ConfigInfoUsagerObligs: voirie.config.ConfigInfoUsagerObligs,
      CodeQualificationMetier: voirie.config.CodeQualificationMetier,
    };
    const plan = planImport(
      [{ id: "a", external_reference: "VOIRIE", name: voirie.name, short_description: voirie.description, partner_config: reordered }],
      [voirie],
    );
    expect(plan).toEqual({ toInsert: [], toUpdate: [], unchanged: 1, missing: [] });
  });

  it("nom de la catégorie", () => {
    expect(partnerCategoryName("Arpège")).toBe("Démarches Arpège");
  });
});

describe("garde-fous", () => {
  it("hawk.ts est la copie conforme de celui d'integration-test", () => {
    const here = readFileSync(join(__dirname, "hawk.ts"), "utf8");
    const there = readFileSync(join(__dirname, "..", "..", "integration-test", "_shared", "hawk.ts"), "utf8");
    expect(here).toBe(there);
  });

  it("index.ts : tout console.* n'a qu'un libellé fixe et un code d'erreur", () => {
    const source = readFileSync(join(__dirname, "..", "index.ts"), "utf8");
    const logs = source.match(/console\.\w+\([^;]*\);/g) ?? [];
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) expect(line).toMatch(/^console\.error\("[^"`$]*", \w+\.code\);$/);
  });
});
