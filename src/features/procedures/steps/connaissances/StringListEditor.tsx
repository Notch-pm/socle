import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AddButton, RemoveButton } from "./controls";

/** Liste éditable de chaînes (ajout/suppression) — utilisée pour les garde-fous. */
export function StringListEditor({
  label,
  hint,
  value,
  onChange,
  placeholder,
  addLabel = "Ajouter",
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}) {
  const update = (index: number, next: string) =>
    onChange(value.map((item, i) => (i === index ? next : item)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, ""]);

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-col gap-2">
        {value.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(e) => update(index, e.target.value)}
              placeholder={placeholder}
            />
            <RemoveButton onClick={() => remove(index)} label="Retirer cette ligne" />
          </div>
        ))}
        <AddButton onClick={add}>{addLabel}</AddButton>
      </div>
    </Field>
  );
}
