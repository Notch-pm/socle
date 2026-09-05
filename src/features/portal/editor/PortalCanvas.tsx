import * as React from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Menu, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalSection } from "@/features/portal/portalPage";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import { DEVICE_PAGE_WIDTH, type Device } from "./device";
import { SectionBlock } from "./SectionBlock";

export interface PortalCanvasProps {
  organizationName: string;
  sections: PortalSection[];
  device: Device;
  selectedId: string | null;
  catalogue: PortalCatalogueEntry[];
  /** La palette flottante occupe la gauche du canevas — la page laisse la place. */
  paletteOpen: boolean;
  previewing: boolean;
  onSelect: (id: string) => void;
  onShift: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onOpenPalette: () => void;
}

/**
 * Le canevas défilant : page blanche mise à l'échelle pour tenir dans la
 * largeur libre entre la palette et l'inspecteur flottants. Le calcul (comme
 * la maquette) dépend de la largeur réelle du conteneur — d'où le
 * `ResizeObserver`, une donnée que Tailwind ne peut pas exprimer en classes.
 */
export function PortalCanvas({
  organizationName,
  sections,
  device,
  selectedId,
  catalogue,
  paletteOpen,
  previewing,
  onSelect,
  onShift,
  onRemove,
  onOpenPalette,
}: PortalCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(1128);

  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasInspector = !previewing && selectedId != null;
  const padLeft = previewing ? 32 : paletteOpen ? 254 : 72;
  const padRight = previewing ? 32 : hasInspector ? 338 : 32;
  const pageWidth = DEVICE_PAGE_WIDTH[device];
  const freeWidth = Math.max(320, containerWidth - padLeft - padRight);
  const fit = Math.min(1, Math.round((freeWidth / pageWidth) * 100) / 100);
  const zoomHint = fit < 0.995 ? ` · affiché à ${Math.round(fit * 100)} %` : "";
  const layoutHint =
    device === "mobile"
      ? "les grilles passent sur une colonne"
      : device === "tablette"
        ? "grilles limitées à 2 colonnes"
        : "mise en page complète";

  return (
    <div className="relative min-w-0 flex-1 bg-muted">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto transition-[padding] duration-200 ease-out"
        style={{ padding: `30px ${padRight}px 60px ${padLeft}px` }}
      >
        <div className="flex flex-col items-center gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {pageWidth} px{zoomHint} — {layoutHint}
          </span>
          <div
            className="overflow-hidden rounded-[14px] bg-background shadow-socle-lg transition-[width] duration-200 ease-out"
            style={{ width: pageWidth, transform: `scale(${fit})`, transformOrigin: "top center" }}
          >
            <header className="flex h-14 items-center gap-3.5 border-b border-border px-6">
              <div className="size-[26px] shrink-0 rounded-lg bg-primary" />
              <span className="truncate text-sm font-extrabold tracking-tight">{organizationName}</span>
              <div className="flex-1" />
              <nav className={cn("flex items-center gap-3.5", device === "mobile" && "hidden")}>
                <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">Démarches</span>
                <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">Actualités</span>
                <span className="whitespace-nowrap text-[12.5px] text-muted-foreground">Contact</span>
              </nav>
              <span className="whitespace-nowrap rounded-full border border-primary px-2.5 py-1 text-[12.5px] font-bold text-primary">
                Mon compte
              </span>
              {device === "mobile" ? (
                <div className="flex size-[30px] shrink-0 items-center justify-center rounded-lg border border-border">
                  <Menu className="size-[15px]" />
                </div>
              ) : null}
            </header>

            <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div
                className={cn(
                  "flex flex-col gap-[22px]",
                  device === "mobile" ? "px-3.5 pb-7 pt-5" : "px-6 pb-[34px] pt-[26px]",
                )}
              >
                {sections.map((section, index) => (
                  <SectionBlock
                    key={section.id}
                    section={section}
                    device={device}
                    catalogue={catalogue}
                    selected={!previewing && section.id === selectedId}
                    isFirst={index === 0}
                    isLast={index === sections.length - 1}
                    previewing={previewing}
                    onSelect={() => onSelect(section.id)}
                    onShift={(direction) => onShift(section.id, direction)}
                    onRemove={() => onRemove(section.id)}
                  />
                ))}

                {previewing ? null : (
                  <button
                    type="button"
                    onClick={onOpenPalette}
                    className="flex h-14 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-border text-[13.5px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:bg-primary/[0.04] hover:text-primary"
                  >
                    <Plus className="size-4" />
                    Ajouter une section
                  </button>
                )}
              </div>
            </SortableContext>
          </div>
        </div>
      </div>
    </div>
  );
}
