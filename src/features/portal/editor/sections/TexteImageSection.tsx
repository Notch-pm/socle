import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TexteImageSection as TexteImageSectionData } from "@/features/portal/portalPage";
import type { Device } from "../device";

/**
 * Texte et image : deux moitiés côte à côte, dans l'ordre choisi
 * (`layout`) — et **empilées sur mobile**, où il n'y a plus de gauche ni de
 * droite. L'ordre survit à l'empilement : c'est bien un ordre de lecture qu'on
 * règle, pas une position.
 *
 * Le titre est facultatif : absent, la moitié texte commence par son
 * paragraphe, sans ligne vide à sa place.
 */
export function TexteImageSection({
  section,
  device,
}: {
  section: TexteImageSectionData;
  device: Device;
}) {
  const stacked = device === "mobile";
  const imageFirst = section.layout === "image-first";

  return (
    <div className={cn("flex items-center gap-5", stacked ? "flex-col" : "flex-row")}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {section.title ? (
          <span className="text-base font-bold text-foreground">{section.title}</span>
        ) : null}
        <span className="whitespace-pre-line text-[13.5px] leading-relaxed text-foreground/80">
          {section.body}
        </span>
      </div>
      {/* Une seule classe pour l'ordre, valable empilé comme côte à côte : le
          `order` de flex ne connaît que « avant » et « après », pas « à
          gauche ». C'est ce qui fait qu'un bloc « image d'abord » reste image
          d'abord sur un téléphone. */}
      <div
        className={cn(
          "shrink-0 overflow-hidden rounded-xl",
          stacked ? "w-full" : "w-[45%]",
          imageFirst && "order-first",
        )}
      >
        {section.imageUrl ? (
          // `alt` vide = image décorative pour une synthèse vocale. C'est le
          // comportement HTML attendu, et c'est ce que l'inspecteur annonce.
          <img
            src={section.imageUrl}
            alt={section.alt}
            className="aspect-[4/3] w-full bg-muted object-cover"
          />
        ) : (
          <ImagePlaceholder />
        )}
      </div>
    </div>
  );
}

/**
 * Tant qu'aucune image n'est choisie : la place qu'elle prendra, et de quoi
 * savoir où la choisir. Un bloc vide se lirait comme un bloc cassé.
 */
function ImagePlaceholder() {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground">
      <ImageIcon className="size-5" aria-hidden="true" />
      <span className="px-3 text-center text-[11.5px]">Adresse de l'image à renseigner</span>
    </div>
  );
}
