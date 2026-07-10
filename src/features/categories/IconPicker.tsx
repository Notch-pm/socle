import { ICON_OPTIONS } from "@/features/categories/icon-options";
import { cn } from "@/lib/utils";

export function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Icône">
      {ICON_OPTIONS.map(({ value: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          title={label}
          onClick={() => onChange(v)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-muted",
            value === v && "border-primary bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
