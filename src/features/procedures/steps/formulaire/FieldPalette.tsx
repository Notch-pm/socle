import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Paperclip, FolderPlus, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { FIELD_TYPES, type FieldType } from "@/features/procedures/formSchema";

/**
 * Ce qu'un item de palette ajoute : un type de champ (dont la PJ et le lieu
 * d'intervention, qui ont leur propre bouton) ou une section.
 */
export type PaletteKind = FieldType | "section";

export const PALETTE_ITEMS: { kind: PaletteKind; label: string }[] = [
  ...FIELD_TYPES.map((t) => ({ kind: t.value as PaletteKind, label: t.label })),
  { kind: "attachment", label: "Pièce justificative" },
  // Un seul champ (adresse sur une ligne + carte), et non plus une section de
  // sept champs d'adresse : voir `createLocationField`.
  { kind: "location", label: "Lieu d'intervention" },
  { kind: "section", label: "Section" },
];

/** L'item de palette produit-il une section (et non un champ) ? */
export function paletteKindIsSection(kind: string): boolean {
  return kind === "section";
}

/**
 * Palette de champs disponibles (colonne de droite). Chaque item s'ajoute au
 * formulaire par glisser-déposer (position choisie) ou au clic (ajout à la fin).
 */
export function FieldPalette({ onAdd }: { onAdd: (kind: PaletteKind) => void }) {
  return (
    <aside className="w-52 shrink-0">
      <div className="sticky top-0 flex flex-col gap-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Champs disponibles
        </p>
        {PALETTE_ITEMS.map((item) => (
          <PaletteItem key={item.kind} kind={item.kind} label={item.label} onAdd={onAdd} />
        ))}
        <p className="px-1 pt-1 text-[11px] leading-tight text-muted-foreground">
          Glissez dans le formulaire, ou cliquez pour ajouter à la fin.
        </p>
      </div>
    </aside>
  );
}

function PaletteItem({
  kind,
  label,
  onAdd,
}: {
  kind: PaletteKind;
  label: string;
  onAdd: (kind: PaletteKind) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${kind}`,
    data: { palette: true, kind, label },
  });

  const icon =
    kind === "attachment" ? (
      <Paperclip className="size-3.5 text-muted-foreground" />
    ) : kind === "section" ? (
      <FolderPlus className="size-3.5 text-muted-foreground" />
    ) : kind === "location" ? (
      <MapPin className="size-3.5 text-muted-foreground" />
    ) : (
      <GripVertical className="size-3.5 text-muted-foreground" />
    );

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onAdd(kind)}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-muted",
        paletteKindIsSection(kind) && "font-medium",
        isDragging && "opacity-50",
      )}
      {...attributes}
      {...listeners}
    >
      {icon}
      {label}
    </button>
  );
}
