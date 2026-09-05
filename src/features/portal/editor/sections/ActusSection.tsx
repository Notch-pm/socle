import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActusSection as ActusSectionData } from "@/features/portal/portalPage";
import type { Device } from "../device";

/**
 * Bloc « Actualités » : le bloc n'a encore aucun article à afficher (la
 * bibliothèque de contenus n'existe pas), donc trois vignettes factices et un
 * rappel discret plutôt qu'un canevas vide qui ferait douter d'un bug.
 */
export function ActusSection({ section, device }: { section: ActusSectionData; device: Device }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
        <span className="shrink-0 text-[12.5px] font-semibold text-primary">Toutes les actualités</span>
      </div>
      <div className={cn("grid gap-2.5", device === "mobile" ? "grid-cols-1" : "grid-cols-3")}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-background">
            <div className="flex h-[94px] items-center justify-center bg-muted">
              <ImageOff className="size-[18px] text-border" />
            </div>
            <div className="flex flex-col gap-1.5 px-3 py-2.5">
              <span className="h-2.5 w-14 rounded-full bg-muted" />
              <span className="h-3 w-4/5 rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Les actualités arrivent bientôt.</p>
    </div>
  );
}
