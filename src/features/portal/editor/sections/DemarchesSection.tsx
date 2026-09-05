import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { DemarchesSection as DemarchesSectionData } from "@/features/portal/portalPage";
import { CATALOGUE_VISIBILITY_LABELS, type PortalCatalogueEntry } from "@/features/portal/catalogue";
import { effectiveColumns, type Device } from "../device";

const GRID_COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

/** Comme la maquette (catalogue de démonstration à 6 entrées) : au-delà, la grille déborderait. */
const MAX_CARDS = 6;

/**
 * Grille de démarches. Une démarche non `visible` (brouillon, interne, hors
 * période…) reste affichée mais atténuée, avec le motif exact — l'éditeur
 * montre ce que l'usager NE verra pas, il ne le cache pas.
 */
export function DemarchesSection({
  section,
  device,
  catalogue,
}: {
  section: DemarchesSectionData;
  device: Device;
  catalogue: PortalCatalogueEntry[];
}) {
  const pinned = new Set(section.pinned);
  let entries = catalogue;
  if (section.pinnedFirst) {
    entries = [...catalogue].sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));
  }
  const visible = entries.slice(0, MAX_CARDS);
  const cols = effectiveColumns(section.columns, device);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
        <span className="shrink-0 text-[12.5px] font-semibold text-primary">Toutes les démarches</span>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          Aucune démarche dans le catalogue.
        </p>
      ) : (
        <div className={cn("grid gap-2.5", GRID_COLS_CLASS[cols])}>
          {visible.map((entry) => {
            const isPinned = pinned.has(entry.id);
            const badge = CATALOGUE_VISIBILITY_LABELS[entry.visibility];
            return (
              <div
                key={entry.id}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border border-border bg-background p-3",
                  isPinned && "border-primary bg-primary/5",
                  badge && "opacity-60",
                )}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex size-[26px] items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="size-3.5 text-primary" />
                  </div>
                  {isPinned ? (
                    <span className="whitespace-nowrap rounded-full bg-secondary px-1.5 py-0.5 text-[10.5px] font-extrabold text-secondary-foreground">
                      À la une
                    </span>
                  ) : null}
                </div>
                <span className="text-[13.5px] font-bold leading-tight text-foreground">{entry.name}</span>
                {badge ? (
                  <Badge variant="muted" className="w-fit text-[10px]">
                    {badge}
                  </Badge>
                ) : entry.shortDescription ? (
                  <span className="text-[11.5px] text-muted-foreground">{entry.shortDescription}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
