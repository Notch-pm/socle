import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Field } from "@/features/procedures/formSchema";
import type { Condition, ConditionOperator, ConditionRule } from "@/features/procedures/conditions";

const selectClass =
  "h-9 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "est égal à" },
  { value: "notEquals", label: "est différent de" },
  { value: "includes", label: "contient" },
  { value: "isNotEmpty", label: "est renseigné" },
  { value: "isEmpty", label: "est vide" },
];

/** Les opérateurs sans opérande (pas de champ « valeur »). */
function needsValue(operator: ConditionOperator): boolean {
  return operator !== "isEmpty" && operator !== "isNotEmpty";
}

/**
 * Éditeur d'une condition (« afficher si… », « obligatoire si… »). Réutilisé
 * pour champs, sections et pièces jointes. Émet `undefined` quand désactivé.
 */
export function ConditionEditor({
  label,
  condition,
  onChange,
  sources,
}: {
  label: string;
  condition: Condition | undefined;
  onChange: (condition: Condition | undefined) => void;
  /** Champs pouvant servir de source (déjà filtrés hors champ courant). */
  sources: Field[];
}) {
  const enabled = condition != null;

  function toggle(on: boolean) {
    onChange(on ? { combinator: "and", rules: [{ fieldId: sources[0]?.id ?? "", operator: "equals" }] } : undefined);
  }

  function patchRule(index: number, patch: Partial<ConditionRule>) {
    if (!condition) return;
    const rules = condition.rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange({ ...condition, rules });
  }

  function addRule() {
    if (!condition) return;
    onChange({
      ...condition,
      rules: [...condition.rules, { fieldId: sources[0]?.id ?? "", operator: "equals" }],
    });
  }

  function removeRule(index: number) {
    if (!condition) return;
    const rules = condition.rules.filter((_, i) => i !== index);
    onChange(rules.length ? { ...condition, rules } : undefined);
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <Switch
          checked={enabled}
          onCheckedChange={toggle}
          disabled={sources.length === 0}
          aria-label={label}
        />
      </div>

      {sources.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Ajoutez d'abord d'autres champs pour définir une condition.
        </p>
      ) : null}

      {enabled && condition ? (
        <div className="mt-3 flex flex-col gap-2">
          {condition.rules.length > 1 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Correspondance :</span>
              <select
                value={condition.combinator}
                onChange={(e) => onChange({ ...condition, combinator: e.target.value as "and" | "or" })}
                className={selectClass}
              >
                <option value="and">Toutes les règles</option>
                <option value="or">Au moins une règle</option>
              </select>
            </div>
          ) : null}

          {condition.rules.map((rule, index) => {
            const source = sources.find((s) => s.id === rule.fieldId);
            const choiceOptions = source && "options" in source ? source.options : null;
            return (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <select
                  value={rule.fieldId}
                  onChange={(e) => patchRule(index, { fieldId: e.target.value })}
                  className={selectClass}
                  aria-label="Champ"
                >
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label || "(sans libellé)"}
                    </option>
                  ))}
                </select>

                <select
                  value={rule.operator}
                  onChange={(e) =>
                    patchRule(index, { operator: e.target.value as ConditionOperator })
                  }
                  className={selectClass}
                  aria-label="Opérateur"
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>

                {needsValue(rule.operator) ? (
                  choiceOptions ? (
                    <select
                      value={typeof rule.value === "string" ? rule.value : ""}
                      onChange={(e) => patchRule(index, { value: e.target.value })}
                      className={selectClass}
                      aria-label="Valeur"
                    >
                      <option value="">—</option>
                      {choiceOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label || o.value}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={typeof rule.value === "string" ? rule.value : ""}
                      onChange={(e) => patchRule(index, { value: e.target.value })}
                      placeholder="Valeur"
                      aria-label="Valeur"
                      className={selectClass + " w-32"}
                    />
                  )
                ) : null}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Supprimer la règle"
                  onClick={() => removeRule(index)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            );
          })}

          <Button type="button" variant="outline" size="sm" className="self-start" onClick={addRule}>
            <Plus className="mr-1 size-3.5" /> Ajouter une règle
          </Button>
        </div>
      ) : null}
    </div>
  );
}
