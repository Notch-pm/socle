import * as React from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { FaqItem } from "@/features/procedures/knowledgeBase";
import { AddButton, RemoveButton } from "./controls";

/**
 * Liste éditable de couples question / réponse (réponse multiligne).
 *
 * Partagée par les DEUX FAQ du stepper, qui ne se fusionnent jamais : la FAQ
 * interne (base de connaissances, agent et IA) et la FAQ usager (publiée). Seule
 * la seconde se traduit — d'où `renderItemFooter`, qui lui laisse poser ses
 * traductions sous chaque question sans que la première en sache rien.
 */
export function FaqEditor<T extends FaqItem = FaqItem>({
  label,
  hint,
  value,
  onChange,
  addLabel = "Ajouter une question",
  createItem,
  itemKey,
  renderItemFooter,
  max,
}: {
  label: string;
  hint?: string;
  value: T[];
  onChange: (value: T[]) => void;
  /** Libellé du bouton d'ajout — deux FAQ coexistent dans le stepper (agent / usager). */
  addLabel?: string;
  /** Une ligne vierge — à fournir dès que `T` porte plus que question et réponse. */
  createItem?: () => T;
  /**
   * Identité STABLE d'une ligne (l'index par défaut). ⚠️ Indispensable dès
   * qu'une ligne porte un état qui survit à la frappe — une traduction
   * automatique en cours, par exemple : avec l'index pour clé, retirer la
   * question du dessus ferait glisser cet état sur la question suivante.
   */
  itemKey?: (item: T, index: number) => React.Key;
  /** Ce qui s'affiche sous une question (ses traductions, pour la FAQ usager). */
  renderItemFooter?: (item: T, index: number) => React.ReactNode;
  /** Nombre maximal de questions : le bouton d'ajout disparaît une fois atteint. */
  max?: number;
}) {
  const update = (index: number, patch: Partial<FaqItem>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () =>
    onChange([...value, createItem ? createItem() : ({ question: "", answer: "" } as T)]);

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-col gap-2">
        {value.map((item, index) => (
          <div
            key={itemKey ? itemKey(item, index) : index}
            className="flex items-start gap-2 rounded-lg border border-border p-3"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Input
                value={item.question}
                onChange={(e) => update(index, { question: e.target.value })}
                placeholder="Question"
                aria-label="Question"
              />
              <textarea
                value={item.answer}
                onChange={(e) => update(index, { answer: e.target.value })}
                rows={3}
                placeholder="Réponse"
                aria-label="Réponse"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {renderItemFooter?.(item, index)}
            </div>
            <RemoveButton onClick={() => remove(index)} label="Retirer cette question" />
          </div>
        ))}
        {max === undefined || value.length < max ? (
          <AddButton onClick={add}>{addLabel}</AddButton>
        ) : null}
      </div>
    </Field>
  );
}
