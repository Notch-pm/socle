import { describe, it, expect } from "vitest";
import {
  AUDIENCES,
  defaultRequesterConfig,
  parseRequesterConfig,
} from "./requesterFields";

describe("AUDIENCES", () => {
  it("expose les trois publics dans l'ordre", () => {
    expect(AUDIENCES.map((a) => a.key)).toEqual(["citoyen", "entreprise", "association"]);
  });

  it("citoyen a 8 champs, dont la civilité (spécifique)", () => {
    const citoyen = AUDIENCES.find((a) => a.key === "citoyen")!;
    expect(citoyen.fields).toHaveLength(8);
    expect(citoyen.fields.map((f) => f.key)).toContain("civilite");
  });

  it("entreprise et association partagent le même jeu de 6 champs (SIRET inclus)", () => {
    const entreprise = AUDIENCES.find((a) => a.key === "entreprise")!;
    const association = AUDIENCES.find((a) => a.key === "association")!;
    expect(entreprise.fields).toHaveLength(6);
    expect(entreprise.fields.map((f) => f.key)).toContain("siret");
    expect(association.fields.map((f) => f.key)).toEqual(entreprise.fields.map((f) => f.key));
  });
});

describe("defaultRequesterConfig", () => {
  it("désactive tous les publics et masque tous les champs par défaut", () => {
    const config = defaultRequesterConfig();
    for (const audience of AUDIENCES) {
      expect(config[audience.key].enabled).toBe(false);
      for (const field of audience.fields) {
        expect(config[audience.key].fields[field.key]).toBe("masque");
      }
    }
  });

  it("renvoie des objets indépendants à chaque appel (pas d'état partagé)", () => {
    const a = defaultRequesterConfig();
    a.citoyen.enabled = true;
    a.citoyen.fields.courriel = "obligatoire";
    const b = defaultRequesterConfig();
    expect(b.citoyen.enabled).toBe(false);
    expect(b.citoyen.fields.courriel).toBe("masque");
  });
});

describe("parseRequesterConfig", () => {
  it("renvoie la config par défaut pour une entrée nulle/non-objet", () => {
    const def = defaultRequesterConfig();
    expect(parseRequesterConfig(null)).toEqual(def);
    expect(parseRequesterConfig(undefined)).toEqual(def);
    expect(parseRequesterConfig("nope")).toEqual(def);
    expect(parseRequesterConfig(42)).toEqual(def);
  });

  it("applique les valeurs stockées valides", () => {
    const config = parseRequesterConfig({
      citoyen: { enabled: true, fields: { courriel: "obligatoire", adresse: "visible" } },
    });
    expect(config.citoyen.enabled).toBe(true);
    expect(config.citoyen.fields.courriel).toBe("obligatoire");
    expect(config.citoyen.fields.adresse).toBe("visible");
    // Champ non fourni → défaut masqué.
    expect(config.citoyen.fields.prenoms).toBe("masque");
  });

  it("corrige une valeur d'état invalide en « masque »", () => {
    const config = parseRequesterConfig({
      citoyen: { enabled: true, fields: { courriel: "n'importe quoi" } },
    });
    expect(config.citoyen.fields.courriel).toBe("masque");
  });

  it("ignore les publics et champs inconnus", () => {
    const config = parseRequesterConfig({
      inconnu: { enabled: true },
      citoyen: { enabled: true, fields: { champ_bidon: "obligatoire" } },
    });
    expect(config).not.toHaveProperty("inconnu");
    expect(config.citoyen.fields).not.toHaveProperty("champ_bidon");
  });

  it("ignore un « enabled » non booléen mais garde le reste", () => {
    const config = parseRequesterConfig({
      entreprise: { enabled: "oui", fields: { siret: "obligatoire" } },
    });
    expect(config.entreprise.enabled).toBe(false);
    expect(config.entreprise.fields.siret).toBe("obligatoire");
  });
});
