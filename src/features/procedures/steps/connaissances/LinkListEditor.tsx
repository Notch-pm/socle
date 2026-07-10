import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { KbLink } from "@/features/procedures/knowledgeBase";
import { AddButton, RemoveButton } from "./controls";

/**
 * Liste éditable de liens (URL + description courte), ajout/suppression.
 * Réutilisée pour les liens utiles agent et les sources de connaissance IA.
 */
export function LinkListEditor({
  label,
  hint,
  value,
  onChange,
  addLabel = "Ajouter un lien",
}: {
  label: string;
  hint?: string;
  value: KbLink[];
  onChange: (value: KbLink[]) => void;
  addLabel?: string;
}) {
  const update = (index: number, patch: Partial<KbLink>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { url: "", description: "" }]);

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-col gap-2">
        {value.map((link, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Input
                type="url"
                value={link.url}
                onChange={(e) => update(index, { url: e.target.value })}
                placeholder="https://exemple.gouv.fr/…"
                aria-label="URL"
              />
              <Input
                value={link.description}
                onChange={(e) => update(index, { description: e.target.value })}
                placeholder="Description courte"
                aria-label="Description"
              />
            </div>
            <RemoveButton onClick={() => remove(index)} label="Retirer ce lien" />
          </div>
        ))}
        <AddButton onClick={add}>{addLabel}</AddButton>
      </div>
    </Field>
  );
}
