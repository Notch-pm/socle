import { cn } from "@/lib/utils";
import type { TexteSection as TexteSectionData } from "@/features/portal/portalPage";

/** Bandeau texte — aussi le rendu de « Contact et horaires » (bandeau texte pré-rempli). */
export function TexteSection({ section }: { section: TexteSectionData }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl bg-secondary/35 px-[22px] py-[18px]",
        section.align === "center" ? "items-center text-center" : "items-start text-left",
      )}
    >
      <span className="text-base font-bold text-foreground">{section.title}</span>
      <span className="text-[13.5px] leading-relaxed text-foreground/80">{section.body}</span>
    </div>
  );
}
