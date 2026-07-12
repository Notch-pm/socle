import * as React from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Field as FormField, Section } from "@/features/procedures/formSchema";
import type { DocumentType } from "@/features/document-types/useDocumentTypes";
import { ConditionEditor } from "./ConditionEditor";
import { paletteKindIsSection } from "./FieldPalette";
import { FieldRow } from "./FieldRow";

/**
 * Une section triable : groupe de champs facultatif (titre, description,
 * condition). Ses champs participent au DndContext racine (pas de contexte
 * imbriqué) : ils peuvent donc en sortir, y entrer, ou changer de section.
 */
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver, over, active } =
    useSortable({ id: section.id, data: { nodeKind: "section" } });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Surligne la section quand un champ venu d'ailleurs (racine, autre section,
  // palette) la survole — elle recevra le champ au dépôt.
  const activeData = active?.data.current as
    | { palette?: boolean; kind?: string; nodeKind?: string }
    | undefined;
  const draggingField =
    activeData?.nodeKind === "field" ||
    (activeData?.palette === true && !paletteKindIsSection(activeData.kind ?? ""));
  const fromOutside = active != null && !section.fields.some((f) => f.id === active.id);
  const receiving =
    draggingField && fromOutside && (isOver || section.fields.some((f) => f.id === over?.id));

  function setFields(fields: FormField[]) {
    onChange({ ...section, fields });
  }

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border-2 border-border bg-card transition-colors",
        receiving && "border-primary/50 bg-primary/5",
      )}
    >
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
        ) : (
          <p className="rounded-lg border border-dashed border-border py-4 text-center text-sm text-muted-foreground">
            Section vide — glissez-y un champ depuis la palette ou le formulaire.
          </p>
        )}
      </div>
    </section>
  );
}
