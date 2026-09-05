import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, type SortingStrategy } from "@dnd-kit/sortable";
import { Menu, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalSection } from "@/features/portal/portalPage";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import { DEVICE_PAGE_WIDTH, type Device } from "./device";
import { SectionBlock } from "./SectionBlock";

/** Id de la zone de dépôt racine : toute la liste des sections. */
export const CANVAS_DROP_ID = "canvas";

/**
 * Pas de glissement automatique des voisins : c'est l'OMBRE qui dit où le
 * bloc va. Les deux mécanismes ensemble se contrediraient — les voisins
 * s'écarteraient d'un côté pendant que l'ombre se dessinerait de l'autre.
 */
const noShift: SortingStrategy = () => null;

export interface PortalCanvasProps {
  organizationName: string;
  sections: PortalSection[];
  device: Device;
  selectedId: string | null;
  catalogue: PortalCatalogueEntry[];
  /** La palette flottante occupe la gauche du canevas — la page laisse la place. */
  paletteOpen: boolean;
  previewing: boolean;
  /** Pendant un glisser : l'index où le bloc tomberait, `null` sinon. */
  dropIndex: number | null;
  /** Libellé du bloc en cours de déplacement, pour l'ombre. */
  dropLabel: string | null;
  onSelect: (id: string) => void;
  onShift: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onOpenPalette: () => void;
}

/**
 * L'ombre : la place que prendra le bloc si on le lâche maintenant. Dessinée
 * à l'index de destination, entre les sections existantes, avec le libellé du
 * bloc — pour qu'on sache ce qui va tomber là, pas seulement où.
 */
function DropShadow({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-[72px] items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/[0.06] text-[12.5px] font-semibold text-primary"
    >
      {label} — déposer ici
    </div>
  );
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
  dropIndex,
  dropLabel,
  onSelect,
  onShift,
  onRemove,
  onOpenPalette,
}: PortalCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(1128);
  // `null` = ajusté à la fenêtre ; un nombre = zoom choisi à la molette.
  const [zoom, setZoom] = React.useState<number | null>(null);
  const { setNodeRef: setListRef } = useDroppable({ id: CANVAS_DROP_ID, disabled: previewing });

  // Un pied de page en dernière position est le bas de la page : plus de
  // marge sous lui, et « Ajouter une section » passe au-dessus. Sauf pendant
  // qu'on glisse un bloc sous lui — l'ombre a besoin de la place.
  const endsWithFooter = sections[sections.length - 1]?.kind === "footer";
  const flushFooter = endsWithFooter && dropIndex !== sections.length;

  const addButton = previewing ? null : (
    <button
      type="button"
      onClick={onOpenPalette}
      className="flex h-14 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-border text-[13.5px] font-semibold text-muted-foreground transition-colors hover:border-primary hover:bg-primary/[0.04] hover:text-primary"
    >
      <Plus className="size-4" />
      Ajouter une section
    </button>
  );

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
  const scale = zoom ?? fit;

  // Ctrl (ou ⌘) + molette zoome le canevas — c'est aussi ce qu'envoie un
  // pincement sur pavé tactile. La molette seule continue de faire défiler.
  // Écouteur natif non passif : `preventDefault` doit empêcher le zoom du
  // navigateur entier. `fitRef` : le zoom part de l'échelle affichée à cet
  // instant, que l'écouteur — posé une fois — ne peut pas voir autrement.
  const fitRef = React.useRef(fit);
  fitRef.current = fit;
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setZoom((current) => {
        const from = current ?? fitRef.current;
        const next = from * (event.deltaY < 0 ? 1.1 : 1 / 1.1);
        return Math.min(2, Math.max(0.25, Math.round(next * 100) / 100));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomHint = scale < 0.995 || scale > 1.005 ? ` · affiché à ${Math.round(scale * 100)} %` : "";
  const layoutHint =
    device === "mobile"
      ? "les grilles passent sur une colonne"
      : device === "tablette"
        ? "grilles limitées à 2 colonnes"
        : "mise en page complète";

  const shadow = dropIndex !== null && dropLabel !== null ? <DropShadow label={dropLabel} /> : null;

  return (
    <div className="relative min-w-0 flex-1 bg-muted">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-auto transition-[padding] duration-200 ease-out"
        style={{ padding: `30px ${padRight}px 60px ${padLeft}px` }}
      >
        <div className="flex flex-col items-center gap-2">
          <span className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
            {pageWidth} px{zoomHint} — {layoutHint}
            {zoom === null ? (
              <span className="text-muted-foreground/70">· Ctrl + molette pour zoomer</span>
            ) : (
              <button
                type="button"
                onClick={() => setZoom(null)}
                className="rounded-full border border-border px-2 py-0.5 font-semibold text-foreground hover:border-primary hover:text-primary"
              >
                Ajuster à la fenêtre
              </button>
            )}
          </span>
          {/* `zoom` et non `transform: scale()` : le zoom agit sur la mise en
              page, le conteneur défilant suit donc la page agrandie au lieu de
              la couper sur les bords — et centre celle qui est réduite. */}
          <div
            className="overflow-hidden rounded-[14px] bg-background shadow-socle-lg transition-[width] duration-200 ease-out"
            style={{ width: pageWidth, zoom: scale }}
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

            <SortableContext items={sections.map((s) => s.id)} strategy={noShift}>
              <div
                ref={setListRef}
                className={cn(
                  "flex flex-col gap-[22px]",
                  device === "mobile" ? "px-3.5 pt-5" : "px-6 pt-[26px]",
                  flushFooter ? "pb-0" : device === "mobile" ? "pb-7" : "pb-[34px]",
                )}
              >
                {sections.map((section, index) => (
                  <React.Fragment key={section.id}>
                    {endsWithFooter && index === sections.length - 1 ? addButton : null}
                    {dropIndex === index ? shadow : null}
                    <SectionBlock
                      section={section}
                      device={device}
                      catalogue={catalogue}
                      scale={scale}
                      selected={!previewing && section.id === selectedId}
                      isFirst={index === 0}
                      isLast={index === sections.length - 1}
                      flush={flushFooter && index === sections.length - 1}
                      previewing={previewing}
                      onSelect={() => onSelect(section.id)}
                      onShift={(direction) => onShift(section.id, direction)}
                      onRemove={() => onRemove(section.id)}
                    />
                  </React.Fragment>
                ))}
                {dropIndex === sections.length ? shadow : null}
                {endsWithFooter ? null : addButton}
              </div>
            </SortableContext>
          </div>
        </div>
      </div>
    </div>
  );
}
