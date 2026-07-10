import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StepDef } from "@/features/procedures/steps";

/**
 * Stepper horizontal (langage DS Notch). Étapes réparties en colonnes égales,
 * pastilles reliées par un trait, libellé centré dessous. Les étapes au-delà
 * de `enabledUpTo` sont désactivées.
 */
export function Stepper({
  steps,
  current,
  enabledUpTo,
  onSelect,
}: {
  steps: readonly StepDef[];
  current: number;
  enabledUpTo: number;
  onSelect: (index: number) => void;
}) {
  const last = steps.length - 1;

  return (
    <ol className="flex items-start">
      {steps.map((step, i) => {
        const state = i === current ? "current" : i < current ? "done" : "upcoming";
        const enabled = i <= enabledUpTo;
        return (
          <li key={step.key} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "h-0.5 flex-1 rounded-full",
                  i === 0 ? "invisible" : i <= current ? "bg-primary" : "bg-border",
                )}
              />
              <button
                type="button"
                disabled={!enabled}
                aria-current={state === "current" ? "step" : undefined}
                onClick={() => enabled && onSelect(i)}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  state === "current" && "bg-primary text-primary-foreground ring-4 ring-primary/15",
                  state === "done" && "bg-primary/15 text-primary",
                  state === "upcoming" && "border border-border bg-muted text-muted-foreground",
                  enabled && state !== "current" && "cursor-pointer",
                  !enabled && "cursor-not-allowed",
                )}
              >
                {state === "done" ? <Check className="size-4" /> : i + 1}
              </button>
              <span
                className={cn(
                  "h-0.5 flex-1 rounded-full",
                  i === last ? "invisible" : i < current ? "bg-primary" : "bg-border",
                )}
              />
            </div>
            <button
              type="button"
              disabled={!enabled}
              onClick={() => enabled && onSelect(i)}
              className={cn(
                "max-w-[9rem] text-center text-xs leading-tight transition-colors",
                state === "current" ? "font-semibold text-foreground" : "text-muted-foreground",
                enabled ? "cursor-pointer hover:text-foreground" : "cursor-not-allowed opacity-70",
              )}
            >
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
