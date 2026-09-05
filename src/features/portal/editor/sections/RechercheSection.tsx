import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_SHORTCUTS, type RechercheSection as RechercheSectionData } from "@/features/portal/portalPage";
import type { PortalCatalogueEntry } from "@/features/portal/catalogue";
import type { Device } from "../device";

const TITLE_SIZE: Record<Device, string> = {
  bureau: "text-[28px]",
  tablette: "text-[26px]",
  mobile: "text-[23px]",
};

/**
 * Bloc « Recherche de démarche ». Les raccourcis référencent des ids de
 * démarches : un id absent du catalogue (démarche supprimée depuis) est
 * simplement écarté, pas affiché comme un trou.
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

  return (
    <div className="flex flex-col items-center gap-3.5 pb-1.5 pt-3.5">
      <h2 className={cn("text-center font-extrabold tracking-tight text-foreground", TITLE_SIZE[device])}>
        {section.title}
      </h2>
      <p className="text-center text-sm text-muted-foreground">{section.subtitle}</p>
      <div className="flex h-12 w-full max-w-[520px] items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 shadow-socle-sm">
        <Search className="size-[17px] shrink-0 text-muted-foreground" />
        <span className="truncate text-sm text-muted-foreground">{section.placeholder}</span>
      </div>
      {section.showShortcuts && shortcutNames.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-2">
          {shortcutNames.map((name) => (
            <span
              key={name}
              className="rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-foreground"
            >
              {name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
