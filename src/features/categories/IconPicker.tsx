import { ICON_GROUPS, ICON_OPTIONS } from "@/features/categories/icon-options";
import { cn } from "@/lib/utils";

/**
 * Sélecteur de pictogramme, rangé par thème. Le nom du pictogramme choisi
 * s'affiche sous la grille : l'infobulle ne suffit pas au doigt ni au clavier.
 */
export function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string) => void;
}) {
  const selected = ICON_OPTIONS.find((o) => o.value === value) ?? null;
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1"
        role="radiogroup"
        aria-label="Icône"
      >
        {ICON_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
            <div className="grid grid-cols-8 gap-1.5">
              {group.options.map(({ value: v, label, Icon }) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={value === v}
                  aria-label={label}
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
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected ? (
          <>
            Pictogramme choisi : <span className="font-medium text-foreground">{selected.label}</span>
          </>
        ) : (
          "Aucun pictogramme choisi — un pictogramme neutre sera affiché."
        )}
      </p>
    </div>
  );
}
