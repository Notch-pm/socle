import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  /** Option visible mais inerte — grisée, `aria-disabled`, sans effet au clic. */
  disabled?: boolean;
  /** Info-bulle, notamment « Bientôt disponible » sur une option désactivée. */
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  size?: "sm" | "md";
  "aria-label"?: string;
}

/**
 * Bascule en pilule sur fond `bg-muted` (l'onglet actif se détache en
 * `bg-background` + ombre) — le motif de la maquette de l'éditeur CMS.
 *
 * Le dépôt duplique déjà ce type de contrôle sous d'autres habillages
 * (`TabButton` de `FormulaireStep`, `ModeButton` de `MarkdownField` : bordure
 * + fond primaire) : on ne les réécrit pas, ce composant sert les nouveaux
 * usages qui partagent réellement la variante pilule.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex gap-[3px] rounded-full bg-muted p-[3px]">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={option.disabled || undefined}
            title={option.title}
            onClick={() => {
              if (option.disabled) return;
              onChange(option.value);
            }}
            className={cn(
              "rounded-full font-bold transition-colors",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-[13px]",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              option.disabled && "cursor-not-allowed opacity-50 hover:text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
