import { describe, it, expect } from "vitest";
import { evaluateCondition, evaluateRule, type Condition } from "./conditions";

describe("evaluateRule", () => {
  it("equals : compare de façon tolérante (string/number/boolean)", () => {
    expect(evaluateRule({ fieldId: "f", operator: "equals", value: "oui" }, { f: "oui" })).toBe(true);
    expect(evaluateRule({ fieldId: "f", operator: "equals", value: "10" }, { f: 10 })).toBe(true);
    expect(evaluateRule({ fieldId: "f", operator: "equals", value: "true" }, { f: true })).toBe(true);
    expect(evaluateRule({ fieldId: "f", operator: "equals", value: "non" }, { f: "oui" })).toBe(false);
  });

  it("equals sur champ multi-valeurs : vrai si l'option est sélectionnée", () => {
    expect(
      evaluateRule({ fieldId: "f", operator: "equals", value: "b" }, { f: ["a", "b"] }),
    ).toBe(true);
  });

  it("notEquals est la négation de equals", () => {
    expect(evaluateRule({ fieldId: "f", operator: "notEquals", value: "oui" }, { f: "non" })).toBe(true);
    expect(evaluateRule({ fieldId: "f", operator: "notEquals", value: "oui" }, { f: "oui" })).toBe(false);
  });

  it("includes : tableau ou sous-chaîne", () => {
    expect(evaluateRule({ fieldId: "f", operator: "includes", value: "a" }, { f: ["a", "b"] })).toBe(true);
    expect(evaluateRule({ fieldId: "f", operator: "includes", value: "xyz" }, { f: "wxyz" })).toBe(true);
    expect(evaluateRule({ fieldId: "f", operator: "includes", value: "z" }, { f: ["a"] })).toBe(false);
  });

  it("isEmpty / isNotEmpty : null, chaîne vide, tableau vide, champ manquant", () => {
    expect(evaluateRule({ fieldId: "f", operator: "isEmpty" }, {})).toBe(true);
    expect(evaluateRule({ fieldId: "f", operator: "isEmpty" }, { f: "" })).toBe(true);
    expect(evaluateRule({ fieldId: "f", operator: "isEmpty" }, { f: "  " })).toBe(true);
    expect(evaluateRule({ fieldId: "f", operator: "isEmpty" }, { f: [] })).toBe(true);
    expect(evaluateRule({ fieldId: "f", operator: "isEmpty" }, { f: "x" })).toBe(false);
    expect(evaluateRule({ fieldId: "f", operator: "isNotEmpty" }, { f: "x" })).toBe(true);
  });

  it("un champ référencé manquant ne fait pas planter (equals → false)", () => {
    expect(evaluateRule({ fieldId: "absent", operator: "equals", value: "x" }, {})).toBe(false);
  });
});

describe("evaluateCondition", () => {
  const values = { civilite: "mme", pays: "FR" };

  it("condition absente ou vide → satisfaite (affiché)", () => {
    expect(evaluateCondition(undefined, values)).toBe(true);
    expect(evaluateCondition(null, values)).toBe(true);
    expect(evaluateCondition({ combinator: "and", rules: [] }, values)).toBe(true);
  });

  it("combinateur AND : toutes les règles doivent passer", () => {
    const cond: Condition = {
      combinator: "and",
      rules: [
        { fieldId: "civilite", operator: "equals", value: "mme" },
        { fieldId: "pays", operator: "equals", value: "FR" },
      ],
    };
    expect(evaluateCondition(cond, values)).toBe(true);
    expect(evaluateCondition(cond, { ...values, pays: "BE" })).toBe(false);
  });

  it("combinateur OR : au moins une règle suffit", () => {
    const cond: Condition = {
      combinator: "or",
      rules: [
        { fieldId: "civilite", operator: "equals", value: "m" },
        { fieldId: "pays", operator: "equals", value: "FR" },
      ],
    };
    expect(evaluateCondition(cond, values)).toBe(true);
    expect(evaluateCondition(cond, { ...values, pays: "BE" })).toBe(false);
  });
});
