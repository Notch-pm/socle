import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ChevronDown, Trash2, Plus, X, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  FIELD_TYPES,
  MAX_ATTACHMENT_FILES,
  type Field as FormField,
} from "@/features/procedures/formSchema";
import type { DocumentType } from "@/features/document-types/useDocumentTypes";
import { ConditionEditor } from "./ConditionEditor";
import { FormatsPicker } from "./FormatsPicker";

const PLACEHOLDER_TYPES = ["text", "textarea", "number", "email", "phone", "select"];

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function typeLabel(type: FormField["type"]): string {
  return FIELD_TYPES.find((t) => t.value === (type as never))?.label ?? "Pièce justificative";
}

/** Une ligne de champ (racine ou dans une section) : triable, panneau de réglages. */
export function FieldRow({
  field,
  onChange,
  onRemove,
  sources,
  documentTypes,
  invalid,
}: {
  field: FormField;
  onChange: (field: FormField) => void;
  onRemove: () => void;
  /** Champs sources pour les conditions (déjà filtrés hors champ courant). */
  sources: FormField[];
  /** Catalogue de types de pièce de l'organisation (pour les pièces jointes). */
  documentTypes: DocumentType[];
  /** Vrai si la pièce jointe doit signaler un type manquant (après tentative d'enregistrement). */
  invalid?: boolean;
}) {
  // Ouvert d'emblée pour les types qui nécessitent une configuration (options / formats).
  const [open, setOpen] = React.useState(() => "options" in field || field.type === "attachment");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: { nodeKind: "field" },
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isAttachment = field.type === "attachment";

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border bg-background">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          aria-label="Déplacer le champ"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {isAttachment ? <Paperclip className="size-3" /> : null}
          {typeLabel(field.type)}
        </span>

        <Input
          value={field.label}
          onChange={(e) => onChange({ ...field, label: e.target.value })}
          placeholder="Libellé du champ"
          className="h-9 flex-1"
          aria-label="Libellé du champ"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={open ? "Replier les réglages" : "Déplier les réglages"}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          aria-label="Supprimer le champ"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Clé (donnée)" htmlFor={`key-${field.id}`} hint="Identifiant machine du champ">
              <Input
                id={`key-${field.id}`}
                value={field.key}
                onChange={(e) => onChange({ ...field, key: e.target.value })}
                placeholder="ex. nom_naissance"
                className="h-9"
              />
            </Field>
            <div className="flex items-end gap-2 pb-1">
              <Switch
                id={`req-${field.id}`}
                checked={field.required ?? false}
                onCheckedChange={(v) => onChange({ ...field, required: v })}
                aria-label="Obligatoire"
              />
              <label htmlFor={`req-${field.id}`} className="text-sm">
                Obligatoire
              </label>
            </div>
          </div>

          {PLACEHOLDER_TYPES.includes(field.type) ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {PLACEHOLDER_TYPES.includes(field.type) ? (
                <Field label="Placeholder" htmlFor={`ph-${field.id}`} hint="Texte d'aide affiché dans le champ">
                  <Input
                    id={`ph-${field.id}`}
                    value={field.placeholder ?? ""}
                    onChange={(e) => onChange({ ...field, placeholder: e.target.value || undefined })}
                    className="h-9"
                  />
                </Field>
              ) : null}
              {field.type === "text" || field.type === "textarea" ? (
                <Field label="Longueur maximale" htmlFor={`max-${field.id}`} hint="Nombre de caractères">
                  <Input
                    id={`max-${field.id}`}
                    type="number"
                    min={1}
                    value={field.maxLength ?? ""}
                    onChange={(e) =>
                      onChange({ ...field, maxLength: e.target.value ? Number(e.target.value) : undefined })
                    }
                    className="h-9"
                  />
                </Field>
              ) : null}
            </div>
          ) : null}

          {"options" in field ? (
            <OptionsEditor
              options={field.options}
              onChange={(options) => onChange({ ...field, options })}
            />
          ) : null}

          {isAttachment ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Type de pièce justificative"
                  htmlFor={`doctype-${field.id}`}
                  hint="Obligatoire — issu du paramétrage « Types de pièce justificative »"
                >
                  {documentTypes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun type disponible. Créez-en d'abord dans « Types de pièce justificative ».
                    </p>
                  ) : (
                    // Pas d'attribut `required` : la validation native masquerait le
                    // blocage JS (bannière + surlignage) et ne couvrirait pas les
                    // panneaux repliés. On s'appuie sur attachmentFieldsMissingDocumentType.
                    <select
                      id={`doctype-${field.id}`}
                      value={field.documentTypeId ?? ""}
                      onChange={(e) =>
                        onChange({ ...field, documentTypeId: e.target.value || undefined })
                      }
                      aria-invalid={invalid}
                      className={cn(selectClass, invalid && "border-destructive ring-1 ring-destructive")}
                    >
                      <option value="" disabled>
                        Sélectionner un type…
                      </option>
                      {documentTypes.map((dt) => (
                        <option key={dt.id} value={dt.id}>
                          {dt.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {invalid ? (
                    <p className="mt-1 text-sm text-destructive">
                      Sélectionnez un type de pièce.
                    </p>
                  ) : null}
                </Field>
                <Field label="Nombre de fichiers" htmlFor={`nfiles-${field.id}`}>
                  <select
                    id={`nfiles-${field.id}`}
                    value={field.maxFiles}
                    onChange={(e) => onChange({ ...field, maxFiles: Number(e.target.value) })}
                    className={selectClass}
                  >
                    <option value={1}>Un seul fichier</option>
                    {Array.from({ length: MAX_ATTACHMENT_FILES - 1 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        Jusqu'à {n} fichiers
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Formats acceptés" htmlFor={`fmt-${field.id}`} hint="Cliquez un format courant ou saisissez une extension">
                <FormatsPicker
                  id={`fmt-${field.id}`}
                  value={field.acceptedFormats}
                  onChange={(acceptedFormats) => onChange({ ...field, acceptedFormats })}
                />
              </Field>
              <ConditionEditor
                label="Obligatoire si…"
                condition={field.requiredIf}
                onChange={(requiredIf) => onChange({ ...field, requiredIf })}
                sources={sources}
              />
            </>
          ) : null}

          <ConditionEditor
            label="Afficher si…"
            condition={field.visibleIf}
            onChange={(visibleIf) => onChange({ ...field, visibleIf } as FormField)}
            sources={sources}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Éditeur d'options pour les champs de choix (valeur = libellé pour le MVP). */
function OptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[];
  onChange: (options: { value: string; label: string }[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <span className="text-sm font-medium">Options proposées</span>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucune option — ajoutez les choix possibles.</p>
      ) : null}
      {options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={option.label}
            onChange={(e) => {
              const text = e.target.value;
              onChange(options.map((o, i) => (i === index ? { value: text, label: text } : o)));
            }}
            placeholder={`Option ${index + 1}`}
            className="h-9"
            aria-label={`Option ${index + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Supprimer l'option"
            onClick={() => onChange(options.filter((_, i) => i !== index))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...options, { value: "", label: "" }])}
      >
        <Plus className="mr-1 size-3.5" /> Ajouter une option
      </Button>
    </div>
  );
}
