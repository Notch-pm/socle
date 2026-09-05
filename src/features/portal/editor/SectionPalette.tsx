import { useDraggable } from "@dnd-kit/core";
import { LayoutTemplate, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PALETTE_ITEMS, type ContactSource, type PortalSection } from "@/features/portal/portalPage";
import { sectionFromPaletteKind } from "./paletteSection";

export interface SectionPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sert de source à « Contact et horaires », qui n'est pas un `kind` propre. */
  contact: ContactSource;
  onAdd: (section: PortalSection) => void;
}

/**
 * Palette flottante des blocs disponibles. Chaque item est à la fois
 * `useDraggable` (position choisie au dépôt) et cliquable (ajout en fin de
 * page) — les deux mènent à la même fabrique, motif `FieldPalette`.
 */
export function SectionPalette({ open, onOpenChange, contact, onAdd }: SectionPaletteProps) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label="Ouvrir la palette de blocs"
        className="absolute left-4 top-4 z-[5] flex size-10 items-center justify-center rounded-xl border border-border bg-background shadow-socle-lg"
      >
        <Plus className="size-[17px]" />
      </button>
    );
  }

  return (
    <div className="absolute left-4 top-4 z-[5] flex w-[222px] flex-col gap-2.5 rounded-2xl border border-border bg-background p-3 shadow-socle-lg">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold">Blocs</span>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Fermer la palette"
          className="flex size-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {PALETTE_ITEMS.map((item) => (
          <PaletteButton key={item.kind} item={item} onAdd={() => onAdd(sectionFromPaletteKind(item.kind, contact))} />
        ))}
      </div>

      <p className="border-t border-border pt-2 text-[10.5px] leading-tight text-muted-foreground">
        Cliquez pour ajouter le bloc en fin de page, puis glissez-le à sa place.
      </p>
    </div>
  );
}

function PaletteButton({
  item,
  onAdd,
}: {
  item: (typeof PALETTE_ITEMS)[number];
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `palette:${item.kind}`,
    data: { palette: true, kind: item.kind, label: item.label },
    disabled: !item.available,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={!item.available}
      title={item.available ? undefined : "Bientôt disponible"}
      onClick={onAdd}
      className={cn(
        "flex items-center gap-2.5 rounded-lg p-2 text-left transition-colors",
        item.available ? "cursor-grab hover:bg-muted" : "cursor-not-allowed opacity-50",
      )}
      {...attributes}
      {...listeners}
    >
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-muted">
        <LayoutTemplate className="size-[15px] text-foreground" />
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-[12.5px] font-semibold">{item.label}</span>
        <span className="truncate text-[10.5px] text-muted-foreground">{item.hint}</span>
      </span>
    </button>
  );
}
