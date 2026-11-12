import { readdirSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { EMAIL_VARIABLE_GROUPS, allEmailVariableKeys, emailVariableTitle } from "./emailVariables";
import { allVariableKeys } from "@/features/documents/documentVariables";
import { extractVariables } from "./emailTemplates";

const migrationsDir = new URL("../../../supabase/migrations/", import.meta.url);
const catalogueSql = readdirSync(migrationsDir)
  .filter((name) => name.includes("modeles_courriels"))
  .map((name) => readFileSync(new URL(name, migrationsDir), "utf8"))
  .join("\n");
// Les valeurs insérées seulement : les commentaires citent la syntaxe ({{domaine.cle}}).
const insertedSql = catalogueSql.slice(catalogueSql.indexOf("insert into public.email_template_defaults"));

describe("catalogue des variables de courriels", () => {
  it("reprend toutes les variables des documents", () => {
    const keys = new Set(allEmailVariableKeys());
    for (const key of allVariableKeys()) expect(keys.has(key)).toBe(true);
  });

  it("ajoute les variables propres aux courriels, et le domaine « message »", () => {
    const keys = allEmailVariableKeys();
    for (const key of [
      "usager.salutation",
      "demande.reference",
      "demande.objet",
      "demande.lien",
      "demande.code_acces",
      "demande.statut_usager",
      "demande.commentaire_cloture",
      "message.extrait",
      "message.nombre",
    ]) {
      expect(keys).toContain(key);
    }
    expect(EMAIL_VARIABLE_GROUPS.map((g) => g.key)).toEqual([
      "usager",
      "demande",
      "message",
      "organisme",
    ]);
  });

  it("aucune clé en double", () => {
    const flat = EMAIL_VARIABLE_GROUPS.flatMap((g) => g.variables.map((v) => v.key));
    expect(new Set(flat).size).toBe(flat.length);
  });

  it("donne le titre d'une variable", () => {
    expect(emailVariableTitle("demande.reference")).toBe("Référence de la demande");
    expect(emailVariableTitle("inconnue")).toBeNull();
  });

  it("chaque variable citée par les courriels système de la migration est au catalogue", () => {
    expect(catalogueSql).toContain("insert into public.email_template_defaults");
    const known = new Set(allEmailVariableKeys());
    const cited = extractVariables(insertedSql);
    expect(cited.length).toBeGreaterThan(5);
    expect(cited.filter((key) => !known.has(key))).toEqual([]);
  });
});
