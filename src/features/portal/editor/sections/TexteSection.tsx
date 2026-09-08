import { cn } from "@/lib/utils";
import type { TexteSection as TexteSectionData } from "@/features/portal/portalPage";

/** Bandeau texte — aussi le rendu de « Contact et horaires » (bandeau texte pré-rempli). */
export function TexteSection({ section }: { section: TexteSectionData }) {
  return (
    <div
      // L'aplat est la couleur secondaire de la collectivité, diluée : posé en
      // style parce qu'une transparence sur une variable CSS ne s'écrit pas en
      // modificateur d'opacité Tailwind (il ne sait pas décomposer un `var()`).
      style={{ background: "var(--pt-accent-soft)" }}
      className={cn(
        "flex flex-col gap-1.5 rounded-[var(--pt-radius)] p-[var(--pt-pad)]",
        section.align === "center" ? "items-center text-center" : "items-start text-left",
      )}
    >
      <span className="text-[length:var(--pt-h2)] font-bold text-[color:var(--pt-ink)]">
        {section.title}
      </span>
      <span className="text-[length:var(--pt-body)] leading-relaxed text-[color:var(--pt-ink)]">
        {section.body}
      </span>
    </div>
  );
}
