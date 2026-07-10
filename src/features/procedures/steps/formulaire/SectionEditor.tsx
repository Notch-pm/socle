import * as React from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Field as FormField, Section } from "@/features/procedures/formSchema";
import type { DocumentType } from "@/features/document-types/useDocumentTypes";
import { ConditionEditor } from "./ConditionEditor";
import { FieldRow } from "./FieldRow";

/** Une section triable : groupe de champs facultatif (titre, description, condition). */
export function SectionEditor({
  section,
  onChange,
  onRemove,
  allInputFields,
  documentTypes,
  missingDocTypeIds,
}: {
  section: Section;
  onChange: (section: Section) => void;
  onRemove: () => void;
  /** Tous les champs de saisie du formulaire (sources de condition). */
  allInputFields: FormField[];
  /** Catalogue de types de pièce de l'organisation (pour les pièces jointes). */
  documentTypes: DocumentType[];
  /** Ids des pièces jointes à signaler comme non typées. */
  missingDocTypeIds: Set<string>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function setFields(fields: FormField[]) {
    onChange({ ...section, fields });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = section.fields.findIndex((f) => f.id === active.id);
    const newIndex = section.fields.findIndex((f) => f.id === over.id);
    if (oldIndex >= 0 && newIndex >= 0) setFields(arrayMove(section.fields, oldIndex, newIndex));
  }

  return (
    <section ref={setNodeRef} style={style} className="rounded-xl border-2 border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border bg-muted/40 p-3">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          aria-label="Déplacer la section"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Section
        </span>
        <Input
          value={section.title}
          onChange={(e) => onChange({ ...section, title: e.target.value })}
          placeholder="Titre de la section"
          className="h-9 flex-1 font-medium"
          aria-label="Titre de la section"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          aria-label="Supprimer la section"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </header>

      <div className="flex flex-col gap-3 p-3">
        <Input
          value={section.description ?? ""}
          onChange={(e) => onChange({ ...section, description: e.target.value || undefined })}
          placeholder="Description (facultatif)"
          className="h-9"
          aria-label="Description de la section"
        />

        <ConditionEditor
          label="Afficher la section si…"
          condition={section.visibleIf}
          onChange={(visibleIf) => onChange({ ...section, visibleIf })}
          sources={allInputFields}
        />

        {section.fields.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={section.fields.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {section.fields.map((field) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    sources={allInputFields.filter((f) => f.id !== field.id)}
                    documentTypes={documentTypes}
                    invalid={missingDocTypeIds.has(field.id)}
                    onChange={(updated) =>
                      setFields(section.fields.map((f) => (f.id === field.id ? updated : f)))
                    }
                    onRemove={() => setFields(section.fields.filter((f) => f.id !== field.id))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="rounded-lg border border-dashed border-border py-4 text-center text-sm text-muted-foreground">
            Section vide — glissez-y un champ depuis la palette.
          </p>
        )}
      </div>
    </section>
  );
}
