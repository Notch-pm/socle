import { ChevronRight, Globe, Library, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * En-tête des pages Connaissances. ⚠️ **À QUI S'ADRESSE LE TEXTE, ET QUI LE
 * REPREND**, avant même qu'on écrive : « Interne » ou « Public », puis les
 * applications qui le lisent. Trois textes voisins (attributions,
 * recommandations, informations usagers) ne se distinguent que par là — et se
 * tromper de case, c'est publier ce qui devait rester interne.
 */
export function KnowledgeHeader({
  crumb,
  title,
  description,
  audience,
  usedBy,
}: {
  /** Sous-rubrique de la bulle (« Pour les agents »…). */
  crumb: string;
  title: string;
  description: string;
  audience: "interne" | "public";
  /** Applications ou fonctions qui reprennent ce texte. */
  usedBy: string[];
}) {
  const isPublic = audience === "public";
  const AudienceIcon = isPublic ? Globe : Lock;
  return (
    <div className="mb-6">
      <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
        <Library aria-hidden="true" className="size-3.5" />
        Connaissances
        <ChevronRight aria-hidden="true" className="size-3" />
        <span className="sr-only"> : </span>
        {crumb}
      </p>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold",
            isPublic ? "bg-primary/10 text-primary" : "bg-muted text-foreground",
          )}
        >
          <AudienceIcon aria-hidden="true" className="size-3" />
          {isPublic ? "Public" : "Interne"}
        </span>
        <span className="text-muted-foreground">Repris par</span>
        {usedBy.map((name) => (
          <span key={name} className="rounded-full border border-border px-2.5 py-0.5 font-medium">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
