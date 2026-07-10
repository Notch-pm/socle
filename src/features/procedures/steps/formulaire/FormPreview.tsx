import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { EmptyState } from "@/components/shared/EmptyState";
import { evaluateCondition, type FormValues } from "@/features/procedures/conditions";
import {
  isSection,
  type AttachmentField,
  type Field as FormField,
  type FormSchema,
} from "@/features/procedures/formSchema";

const inputClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Aperçu « côté usager » : rend le schéma et évalue les conditions en direct.
 * Sert aussi d'implémentation de référence du contrat pour l'aval.
 */
export function FormPreview({ schema }: { schema: FormSchema }) {
  const [values, setValues] = React.useState<FormValues>({});
  const setValue = (id: string, value: unknown) => setValues((v) => ({ ...v, [id]: value }));

  if (schema.content.length === 0) {
    return <EmptyState message="Ajoutez des champs ou des sections pour voir l'aperçu." />;
  }

  const renderField = (field: FormField) =>
    evaluateCondition(field.visibleIf, values) ? (
      <PreviewField
        key={field.id}
        field={field}
        value={values[field.id]}
        onChange={(value) => setValue(field.id, value)}
        required={isRequired(field, values)}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      {schema.content.map((node) => {
        if (!isSection(node)) return renderField(node);
        if (!evaluateCondition(node.visibleIf, values)) return null;
        return (
          <div key={node.id} className="flex flex-col gap-4 rounded-xl border border-border p-4">
            <div>
              <h3 className="text-base font-semibold">{node.title || "Section sans titre"}</h3>
              {node.description ? (
                <p className="text-sm text-muted-foreground">{node.description}</p>
              ) : null}
            </div>
            {node.fields.map(renderField)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Champ fichier de l'aperçu. L'attribut HTML `multiple` n'impose aucune borne
 * supérieure : on contrôle donc le nombre de fichiers à la sélection et on
 * rejette une sélection trop grande (implémentation de référence du contrat).
 */
function AttachmentPreview({ id, field }: { id: string; field: AttachmentField }) {
  const [error, setError] = React.useState<string | null>(null);
  const accept = field.acceptedFormats.map((f) => "." + f.replace(/^\./, "")).join(",");

  const formatsLabel =
    field.acceptedFormats.length > 0
      ? "Formats acceptés : " + field.acceptedFormats.map((f) => f.toUpperCase()).join(", ")
      : "Tous formats acceptés";
  const filesLabel =
    field.maxFiles > 1 ? `${field.maxFiles} fichiers maximum` : "1 fichier maximum";

  return (
    <>
      <input
        id={id}
        type="file"
        multiple={field.maxFiles > 1}
        accept={accept || undefined}
        onChange={(e) => {
          const count = e.target.files?.length ?? 0;
          if (count > field.maxFiles) {
            setError(
              `${field.maxFiles} fichier${field.maxFiles > 1 ? "s" : ""} maximum — sélection ignorée.`,
            );
            e.target.value = "";
          } else {
            setError(null);
          }
        }}
        aria-invalid={error != null}
        className={inputClass + " py-1.5 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        {formatsLabel} · {filesLabel}
      </p>
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </>
  );
}

function isRequired(field: FormField, values: FormValues): boolean {
  if (field.type === "attachment") return field.requiredIf != null && evaluateCondition(field.requiredIf, values);
  return field.required ?? false;
}

function PreviewField({
  field,
  value,
  onChange,
  required,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  required: boolean;
}) {
  const label = field.label || "(champ sans libellé)";

  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </label>
    );
  }

  return (
    <Field label={label} htmlFor={`prev-${field.id}`} required={required} hint={field.help}>
      {field.type === "textarea" ? (
        <textarea
          id={`prev-${field.id}`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          className={inputClass + " h-auto py-2"}
        />
      ) : field.type === "select" ? (
        <select
          id={`prev-${field.id}`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          <option value="">{field.placeholder || "—"}</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label || o.value}
            </option>
          ))}
        </select>
      ) : field.type === "radio" ? (
        <div className="flex flex-col gap-1">
          {field.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`prev-${field.id}`}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
              />
              {o.label || o.value}
            </label>
          ))}
        </div>
      ) : field.type === "checkboxes" ? (
        <div className="flex flex-col gap-1">
          {field.options.map((o) => {
            const selected = Array.isArray(value) ? (value as string[]) : [];
            return (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value),
                    )
                  }
                />
                {o.label || o.value}
              </label>
            );
          })}
        </div>
      ) : field.type === "attachment" ? (
        <AttachmentPreview id={`prev-${field.id}`} field={field} />
      ) : (
        <Input
          id={`prev-${field.id}`}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.type === "text" ? field.maxLength : undefined}
          placeholder={field.placeholder}
        />
      )}
    </Field>
  );
}
