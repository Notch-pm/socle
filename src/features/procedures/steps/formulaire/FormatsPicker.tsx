import * as React from "react";
import { X, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { COMMON_FORMATS, addFormats } from "@/features/procedures/formats";

/**
 * Sélecteur de formats de fichier « à tags » : les formats retenus s'affichent
 * en puces retirables, une rangée de formats courants s'active d'un clic, et un
 * champ permet d'ajouter une extension libre (Entrée ou virgule pour valider).
 */
export function FormatsPicker({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string[];
  onChange: (formats: string[]) => void;
}) {
  const [draft, setDraft] = React.useState("");

  const remove = (format: string) => onChange(value.filter((f) => f !== format));
  const toggle = (format: string) =>
    value.includes(format) ? remove(format) : onChange(addFormats(value, format));

  function commitDraft() {
    if (!draft.trim()) return;
    onChange(addFormats(value, draft));
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((format) => (
            <span
              key={format}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium uppercase text-primary"
            >
              {format}
              <button
                type="button"
                onClick={() => remove(format)}
                aria-label={`Retirer ${format}`}
                className="text-primary/70 hover:text-primary"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucun format précisé — tous les fichiers seront acceptés.
        </p>
      )}

      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commitDraft();
          }
        }}
        onBlur={commitDraft}
        placeholder="Ajouter un format (ex. pdf) puis Entrée"
        className="h-9"
      />

      <div className="flex flex-wrap gap-1.5">
        {COMMON_FORMATS.map((format) => {
          const active = value.includes(format);
          return (
            <button
              key={format}
              type="button"
              onClick={() => toggle(format)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium uppercase transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {active ? <Check className="size-3" /> : <Plus className="size-3" />}
              {format}
            </button>
          );
        })}
      </div>
    </div>
  );
}
