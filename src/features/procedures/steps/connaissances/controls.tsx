import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

/** Bouton « retirer une entrée » (icône corbeille) partagé par les listes éditables. */
export function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

/** Bouton « ajouter une entrée » en pointillés, partagé par les listes éditables. */
export function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
    >
      <Plus className="size-4" />
      {children}
    </button>
  );
}
