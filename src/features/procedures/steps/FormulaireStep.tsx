import * as React from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { LayoutList, Eye, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  attachmentFieldsMissingDocumentType,
  conditionSourceFields,
  createField,
  createSection,
  isSection,
  parseFormSchema,
  type Field,
  type FormNode,
  type FormSchema,
} from "@/features/procedures/formSchema";
import type { Procedure } from "@/features/procedures/useProcedures";
import { useDocumentTypesForOrg } from "@/features/document-types/useDocumentTypes";
import { SectionEditor } from "./formulaire/SectionEditor";
import { FieldRow } from "./formulaire/FieldRow";
import { FormPreview } from "./formulaire/FormPreview";
import { FieldPalette, type PaletteKind } from "./formulaire/FieldPalette";

/**
 * Le conteneur racine « root » recouvre tout le formulaire ; on privilégie donc
 * les cibles plus spécifiques (sections, champs) sous le pointeur pour qu'un
 * dépôt sur une section entre bien DANS la section.
 */
const collisionDetectionStrategy: CollisionDetection = (args) => {
  const collisions = pointerWithin(args).length > 0 ? pointerWithin(args) : rectIntersection(args);
  const specific = collisions.filter((c) => c.id !== "root");
  return specific.length > 0 ? specific : collisions;
};

/**
 * Étape « Formulaire » : concepteur de formulaire. Les champs se prennent dans
 * la palette de droite (glisser-déposer pour positionner, clic pour ajouter à
 * la fin) ; sections et champs cohabitent au niveau racine.
 */
export function FormulaireStep({
  formId,
  procedure,
  onSubmit,
}: {
  formId: string;
  procedure: Procedure;
  onSubmit: (schema: FormSchema) => void;
}) {
  const [schema, setSchema] = React.useState<FormSchema>(() =>
    parseFormSchema(procedure.form_schema),
  );
  const [view, setView] = React.useState<"builder" | "preview">("builder");
  const [dragLabel, setDragLabel] = React.useState<string | null>(null);
  // Passe à true après une tentative d'enregistrement invalide (PJ sans type).
  const [showErrors, setShowErrors] = React.useState(false);

  const { data: documentTypes } = useDocumentTypesForOrg(procedure.organization_id);
  const catalog = documentTypes ?? [];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const inputFields = conditionSourceFields(schema);
  const content = schema.content;

  // Pièces jointes non typées à signaler (uniquement après une tentative).
  const missingDocTypeIds = React.useMemo(
    () => (showErrors ? new Set(attachmentFieldsMissingDocumentType(schema)) : new Set<string>()),
    [showErrors, schema],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (attachmentFieldsMissingDocumentType(schema).length > 0) {
      setShowErrors(true);
      setView("builder"); // ramener sur l'éditeur pour voir les champs en erreur
      return;
    }
    setShowErrors(false);
    onSubmit(schema);
  }

  function setContent(next: FormNode[]) {
    setSchema((s) => ({ ...s, content: next }));
  }
  function replaceNode(id: string, node: FormNode) {
    setContent(content.map((n) => (n.id === id ? node : n)));
  }
  function removeNode(id: string) {
    setContent(content.filter((n) => n.id !== id));
  }

  /** Ajoute un item de palette : positionné (overId) ou à la fin (clic). */
  function addFromPalette(kind: PaletteKind, overId?: string | null) {
    const node: FormNode = kind === "section" ? createSection() : createField(kind);
    const idx = overId ? content.findIndex((n) => n.id === overId) : -1;
    if (idx < 0) {
      setContent([...content, node]);
      return;
    }
    const overNode = content[idx];
    if (isSection(overNode) && !isSection(node)) {
      // Déposé sur une section → ajouté dans cette section.
      replaceNode(overNode.id, { ...overNode, fields: [...overNode.fields, node as Field] });
      return;
    }
    const next = [...content];
    next.splice(idx, 0, node);
    setContent(next);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { palette?: boolean; label?: string } | undefined;
    setDragLabel(data?.palette ? data.label ?? "Champ" : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragLabel(null);
    const { active, over } = event;
    const data = active.data.current as { palette?: boolean; kind?: PaletteKind } | undefined;
    if (data?.palette && data.kind) {
      addFromPalette(data.kind, over?.id != null ? String(over.id) : null);
      return;
    }
    // Réordonnancement des nœuds racine.
    if (!over || active.id === over.id) return;
    const oldIndex = content.findIndex((n) => n.id === active.id);
    const newIndex = content.findIndex((n) => n.id === over.id);
    if (oldIndex >= 0 && newIndex >= 0) setContent(arrayMove(content, oldIndex, newIndex));
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
      {showErrors && missingDocTypeIds.size > 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          Chaque pièce justificative doit avoir un type. Complétez les champs signalés en rouge.
        </p>
      ) : null}

      <div className="inline-flex self-start rounded-lg border border-input p-0.5">
        <TabButton active={view === "builder"} onClick={() => setView("builder")} icon={<LayoutList className="size-4" />}>
          Éditeur
        </TabButton>
        <TabButton active={view === "preview"} onClick={() => setView("preview")} icon={<Eye className="size-4" />}>
          Aperçu
        </TabButton>
      </div>

      {view === "builder" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4">
            <div className="min-w-0 flex-1">
              <CanvasDropzone empty={content.length === 0}>
                <SortableContext items={content.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-3">
                    {content.map((node) =>
                      isSection(node) ? (
                        <SectionEditor
                          key={node.id}
                          section={node}
                          allInputFields={inputFields}
                          documentTypes={catalog}
                          missingDocTypeIds={missingDocTypeIds}
                          onChange={(updated) => replaceNode(node.id, updated)}
                          onRemove={() => removeNode(node.id)}
                        />
                      ) : (
                        <FieldRow
                          key={node.id}
                          field={node}
                          sources={inputFields.filter((f) => f.id !== node.id)}
                          documentTypes={catalog}
                          invalid={missingDocTypeIds.has(node.id)}
                          onChange={(updated) => replaceNode(node.id, updated)}
                          onRemove={() => removeNode(node.id)}
                        />
                      ),
                    )}
                  </div>
                </SortableContext>
              </CanvasDropzone>
            </div>

            <FieldPalette onAdd={(kind) => addFromPalette(kind)} />
          </div>

          <DragOverlay>
            {dragLabel ? (
              <div className="rounded-lg border border-primary/40 bg-background px-3 py-2 text-sm shadow-socle-md">
                {dragLabel}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6">
          <FormPreview schema={schema} />
        </div>
      )}
    </form>
  );
}

/** Zone de dépôt racine : cible pour un ajout depuis la palette (fin / vide). */
function CanvasDropzone({ empty, children }: { empty: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "root" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl p-1 transition-colors",
        isOver && "bg-primary/5 ring-2 ring-primary/30",
        empty && "flex min-h-[8rem] items-center justify-center border border-dashed border-border",
      )}
    >
      {empty ? (
        <p className="text-center text-sm text-muted-foreground">
          Glissez un champ depuis la palette, ou cliquez dessus.
        </p>
      ) : (
        children
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
