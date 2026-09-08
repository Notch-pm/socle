import { cn } from "@/lib/utils";
import { isDarkColor, type FooterSection as FooterSectionData } from "@/features/portal/portalPage";
import { effectiveColumns, type Device } from "../device";

/**
 * Pied de page : pleine largeur — il annule les marges de la page ET le
 * rembourrage du bloc qui l'entoure — à la couleur de fond choisie, sous-blocs
 * répartis sur ses colonnes dans l'ordre. Le texte se lit en clair ou en
 * sombre selon la luminance du fond.
 */
export function FooterSection({
  section,
  device,
  flush = false,
}: {
  section: FooterSectionData;
  device: Device;
  /** Dernier bloc de la page : annule aussi le rembourrage du bas, le fond touche le bord. */
  flush?: boolean;
}) {
  const dark = isDarkColor(section.background);
  const cols = effectiveColumns(section.columns, device);
  return (
    <div
      className={cn(
        "px-6 py-7",
        // Rembourrage du bloc (18 px) + marge de la page (24 px bureau, 14 px mobile).
        device === "mobile" ? "-mx-[32px]" : "-mx-[42px]",
        flush && "-mb-[18px]",
        dark ? "text-white" : "text-[color:var(--pt-ink)]",
      )}
      style={{ backgroundColor: section.background }}
    >
      {section.title ? <div className="mb-4 text-[length:var(--pt-body)] font-bold">{section.title}</div> : null}
      {section.children.length === 0 ? (
        <p className={cn("text-[length:var(--pt-small)]", dark ? "text-white/60" : "text-black/55")}>
          Ajoutez des blocs depuis le panneau de droite — coordonnées, horaires, mentions.
        </p>
      ) : (
        <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {section.children.map((child) => (
            <div
              key={child.id}
              className={cn("flex flex-col gap-1", child.align === "center" && "items-center text-center")}
            >
              <span className="text-[length:var(--pt-body)] font-bold">{child.title}</span>
              <span
                className={cn(
                  "whitespace-pre-line text-[length:var(--pt-small)] leading-relaxed",
                  dark ? "text-white/75" : "text-black/70",
                )}
              >
                {child.body}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
