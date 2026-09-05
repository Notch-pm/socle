import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_LABELS, type PortalSection } from "@/features/portal/portalPage";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import type { Device } from "./device";
import { ActusSection } from "./sections/ActusSection";
import { CompteSection } from "./sections/CompteSection";
import { DemarchesSection } from "./sections/DemarchesSection";
import { RechercheSection } from "./sections/RechercheSection";
import { TexteSection } from "./sections/TexteSection";

export interface SectionBlockProps {
  section: PortalSection;
  device: Device;
  catalogue: PortalCatalogueEntry[];
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** En aperçu : aucun chrome, aucun contour, aucune interaction. */
  previewing: boolean;
  onSelect: () => void;
  onShift: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/**
 * Une section triable du canevas : la poignée porte les `listeners` dnd-kit
 * (jamais la carte entière), sans quoi les champs de l'inspecteur qui vivent
 * dans le prolongement visuel de la section deviendraient inutilisables au
 * survol d'un glisser-déposer.
 */
export function SectionBlock({
  section,
  device,
  catalogue,
  selected,
  isFirst,
  isLast,
  previewing,
  onSelect,
  onShift,
  onRemove,
}: SectionBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled: previewing,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={previewing ? undefined : onSelect}
      className={cn(
        "relative rounded-xl p-[18px]",
        !previewing &&
          "cursor-pointer outline outline-2 outline-offset-[3px] outline-transparent transition-[outline-color,background-color]",
        !previewing && !selected && "hover:outline-dashed hover:outline-primary/45",
        !previewing && selected && "bg-primary/[0.03] outline-primary",
      )}
    >
      {selected && !previewing ? (
        <div className="absolute -top-3.5 left-2.5 z-10 flex items-center gap-0.5 rounded-full bg-primary py-1 pl-2.5 pr-1 text-primary-foreground shadow-socle-md">
          <button
            type="button"
            aria-label="Déplacer la section"
            className="flex cursor-grab items-center justify-center text-primary-foreground/90"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3" />
          </button>
          <span className="mx-1 whitespace-nowrap text-[11.5px] font-bold">{SECTION_LABELS[section.kind]}</span>
          <button
            type="button"
            aria-label="Monter la section"
            disabled={isFirst}
            onClick={(event) => {
              event.stopPropagation();
              onShift(-1);
            }}
            className="flex size-[22px] shrink-0 items-center justify-center rounded-full hover:bg-primary-foreground/20 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Descendre la section"
            disabled={isLast}
            onClick={(event) => {
              event.stopPropagation();
              onShift(1);
            }}
            className="flex size-[22px] shrink-0 items-center justify-center rounded-full hover:bg-primary-foreground/20 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronDown className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Supprimer la section"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="flex size-[22px] shrink-0 items-center justify-center rounded-full hover:bg-primary-foreground/20"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : null}

      <SectionContent section={section} device={device} catalogue={catalogue} />
    </div>
  );
}

function SectionContent({
  section,
  device,
  catalogue,
}: {
  section: PortalSection;
  device: Device;
  catalogue: PortalCatalogueEntry[];
}) {
  switch (section.kind) {
    case "recherche":
      return <RechercheSection section={section} device={device} catalogue={catalogue} />;
    case "demarches":
      return <DemarchesSection section={section} device={device} catalogue={catalogue} />;
    case "actus":
      return <ActusSection section={section} device={device} />;
    case "compte":
      return <CompteSection section={section} device={device} />;
    case "texte":
      return <TexteSection section={section} />;
  }
}
