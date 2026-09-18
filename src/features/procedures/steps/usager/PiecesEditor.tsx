import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { RequiredPiece } from "@/features/procedures/userCommunication";
import { AddButton, RemoveButton } from "@/features/procedures/steps/connaissances/controls";

/**
 * Liste éditable de pièces ANNONCÉES à l'usager : un intitulé, plus une
 * précision facultative (« de moins de trois mois », « original »).
 *
 * Même forme que `FaqEditor`, mais deux champs d'une seule ligne et des
 * `aria-label` qui leur sont propres — les deux éditeurs ne se croisent jamais à
 * l'écran, et s'ils venaient à se croiser, rien ne serait ambigu.
 */
export function PiecesEditor({
  label,
  hint,
  value,
  onChange,
  error,
  addLabel = "Ajouter une pièce",
}: {
  label: string;
  hint?: string;
  value: RequiredPiece[];
  onChange: (value: RequiredPiece[]) => void;
  error?: string;
  addLabel?: string;
}) {
  const update = (index: number, patch: Partial<RequiredPiece>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = () => onChange([...value, { label: "", description: "" }]);

  return (
    <Field label={label} hint={hint} error={error}>
      <div className="flex flex-col gap-2">
        {value.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              <Input
                value={item.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="Ex. Justificatif de domicile"
                aria-label="Intitulé de la pièce"
              />
              <Input
                value={item.description}
                onChange={(e) => update(index, { description: e.target.value })}
                placeholder="Précision (facultatif) — ex. de moins de 3 mois"
                aria-label="Précision sur la pièce"
              />
            </div>
            <RemoveButton onClick={() => remove(index)} label="Retirer cette pièce" />
          </div>
        ))}
        <AddButton onClick={add}>{addLabel}</AddButton>
      </div>
    </Field>
  );
}
