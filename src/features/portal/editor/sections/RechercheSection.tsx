import { Search } from "lucide-react";
import { MAX_SHORTCUTS, type RechercheSection as RechercheSectionData } from "@/features/portal/portalPage";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";

/**
 * Bloc « Recherche de démarche ». Les raccourcis référencent des ids de
 * démarches : un id absent du catalogue (démarche supprimée depuis) est
 * simplement écarté, pas affiché comme un trou.
 *
 * ⚠️ Les trois tailles de titre par appareil ont disparu au profit de
 * `--pt-h1` : c'est le thème qui gouverne l'échelle de texte, pour tout le site
 * d'un coup. Une taille par appareil rendrait le réglage « Échelle de texte »
 * inopérant sur le seul bloc où il se voit le plus.
 */
export function RechercheSection({
  section,
  catalogue,
}: {
  section: RechercheSectionData;
  catalogue: PortalCatalogueEntry[];
}) {
  const shortcutNames = section.shortcuts
    .map((id) => catalogue.find((entry) => entry.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, MAX_SHORTCUTS);

  return (
    <div className="flex flex-col items-center gap-3.5 pb-1.5 pt-3.5">
      <h2 className="text-center text-[length:var(--pt-h1)] font-extrabold leading-tight tracking-tight text-[color:var(--pt-ink)]">
        {section.title}
      </h2>
      <p className="text-center text-[length:var(--pt-body)] text-[color:var(--pt-muted)]">
        {section.subtitle}
      </p>
      <div className="flex h-12 w-full max-w-[520px] items-center gap-2.5 rounded-[var(--pt-radius-sm)] border border-[color:var(--pt-border)] bg-white px-3.5 shadow-[var(--pt-shadow)]">
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
              className="rounded-full bg-[color:var(--pt-surface)] px-3 py-1.5 text-[length:var(--pt-small)] font-semibold text-[color:var(--pt-ink)]"
            >
              {name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
