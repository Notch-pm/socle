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
import { FooterSection } from "./sections/FooterSection";
import { RechercheSection } from "./sections/RechercheSection";
import { TexteImageSection } from "./sections/TexteImageSection";
import { TexteSection } from "./sections/TexteSection";

export interface SectionBlockProps {
  section: PortalSection;
  device: Device;
  catalogue: PortalCatalogueEntry[];
  selected: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** Pied de page en dernière position : il épouse le bas de la page, sans marge sous lui. */
  flush: boolean;
  /** Échelle d'affichage de la page — la pastille de sélection l'annule pour rester lisible. */
  scale: number;
  /** En aperçu : aucun chrome, aucun contour, aucune interaction. */
  previewing: boolean;
  onSelect: () => void;
  onShift: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/**
 * Une section triable du canevas. Le bloc ENTIER se saisit — comme dans la
 * maquette — pas seulement une poignée qui n'apparaîtrait qu'une fois le bloc
 * sélectionné : le capteur exige 5 px de déplacement avant de commencer, le
 * clic de sélection passe donc toujours. Les boutons du chrome arrêtent la
 * propagation, ils restent des boutons.
 *
 * Pendant le glisser, le bloc suit le pointeur, atténué ; l'ombre dessinée par
 * le canevas dit où il tombera.
 */
export function SectionBlock({
  section,
  device,
  catalogue,
  selected,
  isFirst,
  isLast,
  flush,
  scale,
  previewing,
  onSelect,
  onShift,
  onRemove,
}: SectionBlockProps) {
  // `transition: null` : sans transition, le bloc se pose là où il est lâché.
  // Avec, sa transformation reviendrait à zéro en glissant — depuis l'endroit
  // du dépôt vers sa nouvelle place — et donnerait l'impression de repartir
  // dans la liste alors qu'il y est déjà.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: section.id,
    disabled: previewing,
    transition: null,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={previewing ? undefined : onSelect}
      {...(previewing ? {} : attributes)}
      {...(previewing ? {} : listeners)}
      className={cn(
        "relative rounded-xl p-[18px]",
        !previewing &&
          "cursor-grab outline outline-2 outline-offset-[3px] outline-transparent transition-[outline-color,background-color] active:cursor-grabbing",
        !previewing && !selected && "hover:outline-dashed hover:outline-primary/45",
        !previewing && selected && "bg-primary/[0.03] outline-primary",
      )}
    >
      {selected && !previewing ? (
        <div
          // La page est réduite pour tenir dans le canevas ; ses commandes, non.
          // À 36 %, une corbeille de 22 px en ferait 8 — inutilisable.
          style={{ zoom: 1 / scale }}
          className="absolute -top-3.5 left-2.5 z-10 flex items-center gap-0.5 rounded-full bg-primary py-1 pl-2.5 pr-1 text-primary-foreground shadow-socle-md"
        >
          <span aria-hidden="true" className="flex items-center justify-center text-primary-foreground/90">
            <GripVertical className="size-3" />
          </span>
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

      <SectionContent section={section} device={device} catalogue={catalogue} flush={flush} />
    </div>
  );
}

function SectionContent({
  section,
  device,
  catalogue,
  flush,
}: {
  section: PortalSection;
  device: Device;
  catalogue: PortalCatalogueEntry[];
  flush: boolean;
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
    case "texte-image":
      return <TexteImageSection section={section} device={device} />;
    case "footer":
      return <FooterSection section={section} device={device} flush={flush} />;
  }
}
