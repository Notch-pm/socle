/**
 * Moteur de conditions du form builder — logique pure, sans dépendance UI.
 * Un même modèle de condition sert pour l'affichage des champs, des sections
 * et pour le caractère obligatoire des pièces jointes. Partagé par l'aperçu
 * et (à terme) par le renderer aval : c'est une brique du contrat public.
 */

export type ConditionOperator =
  | "equals"
  | "notEquals"
  | "includes"
  | "isEmpty"
  | "isNotEmpty";

export interface ConditionRule {
  /** id du champ dont dépend la règle. */
  fieldId: string;
  operator: ConditionOperator;
  /** Valeur de comparaison (ignorée pour isEmpty/isNotEmpty). */
  value?: string | string[];
}

export interface Condition {
  combinator: "and" | "or";
  rules: ConditionRule[];
}

/** Valeurs saisies dans le formulaire, indexées par id de champ. */
export type FormValues = Record<string, unknown>;

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Réduit une valeur de comparaison (string | string[]) à un scalaire. */
function asScalar(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Égalité tolérante ; pour un champ multi-valeurs, vrai si `target` est sélectionné. */
function equals(fieldValue: unknown, target: string): boolean {
  if (Array.isArray(fieldValue)) return fieldValue.map(String).includes(target);
  if (fieldValue === undefined || fieldValue === null) return false;
  return String(fieldValue) === target;
}

function includes(fieldValue: unknown, target: string): boolean {
  if (Array.isArray(fieldValue)) return fieldValue.map(String).includes(target);
  if (typeof fieldValue === "string") return fieldValue.includes(target);
  return false;
}

/** Évalue une règle isolée contre les valeurs courantes. */
export function evaluateRule(rule: ConditionRule, values: FormValues): boolean {
  const fieldValue = values[rule.fieldId];
  switch (rule.operator) {
    case "isEmpty":
      return isEmpty(fieldValue);
    case "isNotEmpty":
      return !isEmpty(fieldValue);
    case "equals":
      return equals(fieldValue, asScalar(rule.value));
    case "notEquals":
      return !equals(fieldValue, asScalar(rule.value));
    case "includes":
      return includes(fieldValue, asScalar(rule.value));
    default:
      return false;
  }
}

/**
 * Évalue une condition complète. Une condition absente ou sans règle est
 * considérée comme satisfaite (élément toujours affiché / facultatif).
 */
export function evaluateCondition(
  condition: Condition | undefined | null,
  values: FormValues,
): boolean {
  if (!condition || condition.rules.length === 0) return true;
  const results = condition.rules.map((rule) => evaluateRule(rule, values));
  return condition.combinator === "or" ? results.some(Boolean) : results.every(Boolean);
}
