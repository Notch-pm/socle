import { describe, it, expect } from "vitest";
import {
  DOCUMENT_VARIABLE_GROUPS,
  allVariableKeys,
  variableToken,
} from "./documentVariables";

describe("variableToken", () => {
  it("encadre la clé des moustaches attendues dans le fichier", () => {
    expect(variableToken("usager.nom")).toBe("{{usager.nom}}");
  });
});

describe("DOCUMENT_VARIABLE_GROUPS", () => {
  it("expose les trois domaines, dans l'ordre", () => {
    expect(DOCUMENT_VARIABLE_GROUPS.map((g) => g.key)).toEqual([
      "usager",
      "demande",
      "organisme",
    ]);
  });

  it("n'a aucune clé en double", () => {
    const keys = allVariableKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("préfixe chaque variable par son domaine, en snake_case", () => {
    for (const group of DOCUMENT_VARIABLE_GROUPS) {
      for (const v of group.variables) {
        expect(v.key).toMatch(/^(usager|demande|organisme)\.[a-z0-9_]+$/);
      }
    }
  });

  it("donne un titre non vide à chaque variable", () => {
    for (const group of DOCUMENT_VARIABLE_GROUPS) {
      for (const v of group.variables) expect(v.title.trim()).not.toBe("");
    }
  });

  // L'inventaire demandé est le contrat : on l'épingle nommément.
  it("couvre les 16 variables usager demandées", () => {
    const usager = DOCUMENT_VARIABLE_GROUPS[0];
    expect(usager.variables.map((v) => v.key)).toEqual([
      "usager.nom",
      "usager.prenom",
      "usager.civilite",
      "usager.adresse_complete",
      "usager.numero",
      "usager.btq",
      "usager.voie",
      "usager.complement",
      "usager.appartement",
      "usager.batiment",
      "usager.code_postal",
      "usager.ville",
      "usager.telephone_mobile",
      "usager.courriel",
      "usager.quartier",
      "usager.telephone_fixe",
    ]);
  });

  it("couvre les 13 variables simples de la demande", () => {
    const demande = DOCUMENT_VARIABLE_GROUPS[1];
    expect(demande.variables.map((v) => v.key)).toEqual([
      "demande.libelle_demarche",
      "demande.code_suivi",
      "demande.categorie",
      "demande.organisme_responsable",
      "demande.date_depot",
      "demande.date_echeance",
      "demande.urgence",
      "demande.etat_actuel",
      "demande.date_cloture",
      "demande.etat_cloture",
      "demande.agent_nom",
      "demande.agent_prenom",
      "demande.agent_courriel",
    ]);
  });

  it("couvre les 8 variables de l'organisme émetteur", () => {
    const organisme = DOCUMENT_VARIABLE_GROUPS[2];
    expect(organisme.variables.map((v) => v.key)).toEqual([
      "organisme.nom",
      "organisme.adresse",
      "organisme.telephone",
      "organisme.courriel",
      "organisme.logo_url",
      "organisme.logo_blanc_url",
      "organisme.couleur_principale",
      "organisme.couleur_secondaire",
    ]);
  });

  it("avertit que logos et couleurs ne sont pas du texte à coller", () => {
    // Une URL d'image collée telle quelle dans un courrier donnerait une ligne
    // d'adresse web au lieu du logo — l'agent doit le savoir avant d'essayer.
    const organisme = DOCUMENT_VARIABLE_GROUPS[2];
    const parCle = new Map(organisme.variables.map((v) => [v.key, v]));
    expect(parCle.get("organisme.logo_url")?.hint).toMatch(/image/i);
    expect(parCle.get("organisme.logo_blanc_url")?.hint).toMatch(/image/i);
    expect(parCle.get("organisme.couleur_principale")?.hint).toMatch(/#rrggbb/);
  });
});

describe("boucle demande.pieces", () => {
  const loop = DOCUMENT_VARIABLE_GROUPS[1].loops?.[0];

  it("est déclarée comme une liste, pas comme une variable simple", () => {
    // Les pièces ont autant de lignes que le dossier compte de pièces : une
    // variable plate ne saurait pas les répéter.
    expect(loop?.key).toBe("demande.pieces");
    expect(DOCUMENT_VARIABLE_GROUPS[1].variables.some((v) => v.key === "demande.pieces")).toBe(
      false,
    );
  });

  it("porte le libellé et le statut de chaque pièce, en clés relatives", () => {
    expect(loop?.variables.map((v) => v.key)).toEqual(["libelle", "statut"]);
  });

  it("fournit un extrait ouvert et refermé, prêt à recopier", () => {
    expect(loop?.sample).toContain("{{#demande.pieces}}");
    expect(loop?.sample).toContain("{{/demande.pieces}}");
    expect(loop?.sample).toContain("{{libelle}}");
    expect(loop?.sample).toContain("{{statut}}");
  });
});

describe("allVariableKeys", () => {
  it("compte les 37 variables simples, la boucle et ses deux clés relatives", () => {
    expect(allVariableKeys()).toHaveLength(16 + 13 + 8 + 1 + 2);
  });
});
