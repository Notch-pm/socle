import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompteSection as CompteSectionData } from "@/features/portal/portalPage";
import type { Device } from "../device";

/**
 * Bandeau « Espace usager » — bascule en colonne sur mobile, comme la maquette.
 *
 * Le fond sombre est l'encre du thème, pas une couleur de charte : c'est un
 * bandeau d'appel, et il doit rester lisible quelle que soit la couleur de la
 * collectivité — y compris une couleur claire, sur laquelle du blanc
 * disparaîtrait.
 */
export function CompteSection({ section, device }: { section: CompteSectionData; device: Device }) {
  const narrow = device === "mobile";
  return (
    <div
      className={cn(
        "flex gap-[18px] rounded-[var(--pt-radius)] bg-[color:var(--pt-ink)] p-[var(--pt-pad)]",
        narrow ? "flex-col items-stretch" : "flex-row items-center",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--pt-radius-sm)] bg-[color:var(--pt-primary)]">
        <UserRound className="size-5 text-[color:var(--pt-on-primary)]" />
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[length:var(--pt-h2)] font-bold text-white">{section.title}</span>
        <span className="text-[length:var(--pt-small)] text-white/75">{section.subtitle}</span>
      </div>
      <span className="whitespace-nowrap rounded-[var(--pt-radius-sm)] bg-white px-4 py-2.5 text-center text-[length:var(--pt-body)] font-bold text-[color:var(--pt-ink)]">
        Se connecter
      </span>
    </div>
  );
}
