import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { FaqItem } from "@/features/procedures/knowledgeBase";
import { AddButton, RemoveButton } from "./controls";

/** Liste éditable de couples question / réponse (réponse multiligne). */
export function FaqEditor({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: FaqItem[];
  onChange: (value: FaqItem[]) => void;
}) {
  const update = (index: number, patch: Partial<FaqItem>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { question: "", answer: "" }]);

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-col gap-2">
        {value.map((item, index) => (
          <div key={index} className="flex items-start gap-2 rounded-lg border border-border p-3">
            <div className="flex flex-1 flex-col gap-2">
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
            </div>
            <RemoveButton onClick={() => remove(index)} label="Retirer cette question" />
          </div>
        ))}
        <AddButton onClick={add}>Ajouter une question</AddButton>
      </div>
    </Field>
  );
}
