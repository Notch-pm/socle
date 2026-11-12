import { readdirSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  EMAIL_COMMON_VARIABLES,
  EMAIL_COMMON_VARIABLE_GROUPS,
  EMAIL_CONTEXT_VARIABLE_GROUP,
  allEmailVariableKeys,
  allowedEmailVariables,
  emailVariableLabel,
} from "./emailVariables";
import { extractVariables } from "./emailTemplates";

const migrationsDir = new URL("../../../supabase/migrations/", import.meta.url);
const migration = (fragment: string) =>
  readdirSync(migrationsDir)
    .filter((name) => name.includes(fragment))
    .map((name) => readFileSync(new URL(name, migrationsDir), "utf8"))
    .join("\n");

/** Liste SQL de `email_template_common_variables()`, la dernière définition faisant foi. */
function sqlCommonVariables(): string[] {
  const sql = migration("modeles_courriels");
  const defs = sql.split("create or replace function public.email_template_common_variables()");
  const last = defs[defs.length - 1];
  const array = last.slice(last.indexOf("array["), last.indexOf("]::text[]"));
  return Array.from(array.matchAll(/'([^']+)'/g), (m) => m[1]);
}

/** Les renommages de la migration du 2026-11-12 (catalogue commun). */
const RENAMES: Record<string, string> = {
  "demande.libelle_demarche": "demande.demarche",
  "demande.organisme_responsable": "demande.destinataire",
  "organisme.nom": "organisation.nom",
};

/** Le catalogue des courriels système tel qu'il est en base après les migrations. */
function systemDefaults(): { key: string; variables: string[]; text: string }[] {
  const sql = migration("modeles_courriels_catalogue");
  const values = sql.slice(sql.indexOf("insert into public.email_template_defaults"));
  const rename = (k: string) => RENAMES[k] ?? k;
  const out: { key: string; variables: string[]; text: string }[] = [];
  const re =
    /\(\s*'([a-z_]+)', \d+,\s*'(?:[^']|'')*',\s*'(?:[^']|'')*',\s*array\[[^\]]*\],\s*array\[([^\]]*)\],\s*'((?:[^']|'')*)',\s*\$t\$([\s\S]*?)\$t\$\s*\)/g;
  for (const m of values.matchAll(re)) {
    const variables = Array.from(m[2].matchAll(/'([^']+)'/g), (v) => rename(v[1]));
    let text = `${m[3]} ${m[4]}`;
    for (const [from, to] of Object.entries(RENAMES)) text = text.split(from).join(to);
    out.push({ key: m[1], variables, text });
  }
  return out;
}

describe("catalogue unique des variables de courriels", () => {
  it("la liste commune est le jumeau exact de email_template_common_variables() (SQL)", () => {
    expect(sqlCommonVariables()).toEqual([...EMAIL_COMMON_VARIABLES]);
  });

  it("reprend toutes les clés d'Iris (TEMPLATE_VARIABLES), sous les mêmes noms", () => {
    const iris = [
      "usager.civilite", "usager.prenom", "usager.nom", "usager.nom_complet", "usager.raison_sociale",
      "usager.courriel", "usager.telephone", "usager.adresse", "demande.reference", "demande.objet",
      "demande.description", "demande.statut", "demande.priorite", "demande.demarche", "demande.categorie",
      "demande.destinataire", "demande.canal", "demande.date_depot", "demande.date_instruction",
      "demande.date_cloture", "demande.date_echeance", "demande.motif_cloture", "agent.nom",
      "organisation.nom",
    ];
    for (const key of iris) expect(EMAIL_COMMON_VARIABLES).toContain(key);
  });

  it("aucune clé en double, et chaque clé a un exemple", () => {
    const keys = allEmailVariableKeys();
    expect(new Set(keys).size).toBe(keys.length);
    for (const group of [...EMAIL_COMMON_VARIABLE_GROUPS, EMAIL_CONTEXT_VARIABLE_GROUP]) {
      for (const v of group.variables) expect(v.sample.length).toBeGreaterThan(0);
    }
  });

  it("une variable d'événement n'est permise que là où un courriel système la déclare", () => {
    expect(allowedEmailVariables()).not.toContain("demande.code_acces");
    expect(allowedEmailVariables(["demande.code_acces"])).toContain("demande.code_acces");
  });

  it("donne le libellé d'une variable", () => {
    expect(emailVariableLabel("demande.reference")).toBe("Référence");
    expect(emailVariableLabel("inconnue")).toBeNull();
  });

  it("chaque courriel système ne cite que les variables communes et les siennes, toutes connues", () => {
    const defaults = systemDefaults();
    expect(defaults).toHaveLength(10);
    const known = new Set(allEmailVariableKeys());
    for (const d of defaults) {
      for (const v of d.variables) expect(known.has(v), `${d.key} déclare ${v}`).toBe(true);
      const allowed = new Set(allowedEmailVariables(d.variables));
      const outside = extractVariables(d.text).filter((k) => !allowed.has(k));
      expect(outside, d.key).toEqual([]);
    }
  });
});
