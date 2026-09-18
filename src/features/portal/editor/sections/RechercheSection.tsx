import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_SHORTCUTS, type RechercheSection as RechercheSectionData } from "@/features/portal/portalPage";
import { imageBackdropStyle } from "@/features/portal/themeStyle";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import type { Device } from "../device";

/**
 * Bloc « Recherche de démarche ». Les raccourcis référencent des ids de
 * démarches : un id absent du catalogue (démarche supprimée depuis) est
 * simplement écarté, pas affiché comme un trou.
 *
 * ⚠️ Les trois tailles de titre par appareil ont disparu au profit de
 * `--pt-h1` : c'est le thème qui gouverne l'échelle de texte, pour tout le site
 * d'un coup. Une taille par appareil rendrait le réglage « Échelle de texte »
 * inopérant sur le seul bloc où il se voit le plus.
 *
 * ⚠️ Avec une image de fond, le bloc **annule le rembourrage** que le canevas
 * pose autour de lui (18 px) — et, en pleine largeur, les marges de la page —
 * puis repose le sien : sans cela l'image s'arrêterait à une gouttière blanche
 * de 18 px et ne « recouvrirait » rien. Même mécanique que le pied de page, avec
 * les mêmes nombres.
 */
export function RechercheSection({
  section,
  device,
  catalogue,
}: {
  section: RechercheSectionData;
  device: Device;
  catalogue: PortalCatalogueEntry[];
}) {
  const shortcutNames = section.shortcuts
    .map((id) => catalogue.find((entry) => entry.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, MAX_SHORTCUTS);

  const backdrop = imageBackdropStyle(section.imageUrl, section.imageFixed);
  const hasImage = backdrop !== undefined;
  // Les deux options ne valent QUE sous une image : elles restent en base quand
  // l'adresse est effacée (le réglage gouverne l'usage, pas la donnée), il
  // revient donc au rendu de les ignorer tant qu'il n'y a rien à habiller.
  const fullWidth = hasImage && section.imageFullWidth;

  return (
    <div
      style={backdrop}
      className={cn(
        "relative flex flex-col items-center gap-3.5",
        hasImage ? "px-6 py-11" : "pb-1.5 pt-3.5",
        // Rembourrage du bloc (18 px) — puis, horizontalement, la marge de la
        // page en plus quand l'image va d'un bord à l'autre (24 px bureau,
        // 14 px mobile). Deux classes distinctes plutôt qu'un `-m-` corrigé par
        // un `-mx-` : deux règles qui se recouvrent se départageraient par
        // l'ordre de la feuille de style, pas par celui écrit ici.
        hasImage && "-my-[18px]",
        hasImage && !fullWidth && "-mx-[18px] rounded-[var(--pt-radius)]",
        fullWidth && (device === "mobile" ? "-mx-[32px]" : "-mx-[42px]"),
      )}
    >
      <h2 className="text-center text-[length:var(--pt-h1)] font-extrabold leading-tight tracking-tight text-[color:var(--pt-ink)]">
        {section.title}
      </h2>
      {/* ⚠️ Le gris de texte passe à l'encre pleine sur une image : il ne tient
          sur aucun fond photographique, et le voile clair qui l'aidait a été
          retiré le 2026-09-12 (voir `imageBackdropStyle`). */}
      <p
        className={cn(
          "text-center text-[length:var(--pt-body)]",
          hasImage ? "text-[color:var(--pt-ink)]" : "text-[color:var(--pt-muted)]",
        )}
      >
        {section.subtitle}
      </p>
      <div className="flex h-12 w-full max-w-[520px] items-center gap-2.5 rounded-[var(--pt-radius-sm)] border border-[color:var(--pt-field-border)] bg-white px-3.5 shadow-[var(--pt-shadow)]">
        <Search className="size-[17px] shrink-0 text-[color:var(--pt-muted)]" />
        <span className="truncate text-[length:var(--pt-body)] text-[color:var(--pt-muted)]">
          {section.placeholder}
        </span>
      </div>
      {section.showShortcuts && shortcutNames.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {shortcutNames.map((name) => (
            <span
              key={name}
              className={cn(
                "rounded-full px-3 py-1.5 text-[length:var(--pt-small)] font-semibold text-[color:var(--pt-ink)]",
                // L'aplat neutre des puces se confondrait avec le voile : sur
                // une image, elles se détachent en blanc plein.
                hasImage ? "bg-white" : "bg-[color:var(--pt-surface)]",
              )}
            >
              {name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
