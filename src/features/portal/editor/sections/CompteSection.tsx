import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompteSection as CompteSectionData } from "@/features/portal/portalPage";
import type { Device } from "../device";

/** Bandeau « Espace usager » — bascule en colonne sur mobile, comme la maquette. */
export function CompteSection({ section, device }: { section: CompteSectionData; device: Device }) {
  const narrow = device === "mobile";
  return (
    <div
      className={cn(
        "flex gap-[18px] rounded-xl bg-sidebar px-[22px] py-5",
        narrow ? "flex-col items-stretch" : "flex-row items-center",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
        <UserRound className="size-5 text-sidebar" />
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-base font-bold text-sidebar-foreground">{section.title}</span>
        <span className="text-[12.5px] text-sidebar-foreground/80">{section.subtitle}</span>
      </div>
      <span className="whitespace-nowrap rounded-[10px] bg-background px-4 py-2.5 text-center text-sm font-bold text-foreground">
        Se connecter
      </span>
    </div>
  );
}
