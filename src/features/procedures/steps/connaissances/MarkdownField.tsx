import * as React from "react";
import { Pencil, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { renderMarkdown } from "@/features/procedures/markdown";

/** Styles du rendu Markdown (préflight Tailwind réinitialise les marges/listes). */
const PROSE =
  "text-sm leading-relaxed [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:font-semibold [&_h5]:mt-2 [&_h5]:font-medium [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs";

function ModeButton({
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
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Champ de texte riche en **Markdown** avec bascule Écrire / Aperçu. Aucune
 * dépendance : l'aperçu passe par `renderMarkdown` (HTML échappé puis balisé).
 */
export function MarkdownField({
  id,
  label,
  hint,
  value,
  onChange,
  rows = 8,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [mode, setMode] = React.useState<"write" | "preview">("write");
  const html = React.useMemo(() => renderMarkdown(value), [value]);

  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="flex flex-col gap-2">
        <div className="inline-flex self-start rounded-lg border border-input p-0.5">
          <ModeButton
            active={mode === "write"}
            onClick={() => setMode("write")}
            icon={<Pencil className="size-3.5" />}
          >
            Écrire
          </ModeButton>
          <ModeButton
            active={mode === "preview"}
            onClick={() => setMode("preview")}
            icon={<Eye className="size-3.5" />}
          >
            Aperçu
          </ModeButton>
        </div>

        {mode === "write" ? (
          <>
            <textarea
              id={id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={rows}
              placeholder={placeholder}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Mise en forme Markdown : <code>**gras**</code>, <code>*italique*</code>, listes
              (<code>-</code>, <code>1.</code>), titres (<code>#</code>), liens{" "}
              <code>[texte](url)</code>.
            </p>
          </>
        ) : value.trim() ? (
          <div
            className={cn(
              "min-h-[6rem] rounded-lg border border-border bg-muted/20 px-3 py-2",
              PROSE,
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="min-h-[6rem] rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Rien à prévisualiser.
          </p>
        )}
      </div>
    </Field>
  );
}
