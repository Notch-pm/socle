import { cn } from "@/lib/utils";
import { CATALOGUE_VISIBILITY_LABELS, type PortalCatalogueEntry } from "@/features/portal/catalogue";

export interface ProcedurePickListProps {
  entries: PortalCatalogueEntry[];
  selected: string[];
  onToggle: (id: string) => void;
  /** Au-delà, les entrées non sélectionnées se désactivent (mais restent visibles). */
  max?: number;
  activeLabel?: string;
  inactiveLabel?: string;
}

/**
 * Liste de choix de démarches (raccourcis de recherche, mise en avant de la
 * grille…) : une ligne par démarche du catalogue, jamais masquée — une
 * démarche non `visible` porte son motif en badge, mais reste sélectionnable.
 * Le catalogue et ses formulaires se paramètrent ailleurs (outil Démarches) ;
 * ici on choisit seulement ce qui remonte sur l'accueil.
 */
export function ProcedurePickList({
  entries,
  selected,
  onToggle,
  max,
  activeLabel = "À la une",
  inactiveLabel = "Épingler",
}: ProcedurePickListProps) {
  // Exception à « jamais masquée » : une démarche partenaire (Arpège…) ne peut
  // JAMAIS paraître au portail, quel que soit son paramétrage — la proposer
  // serait un piège. Restée épinglée, elle reste listée pour qu'on la retire.
  entries = entries.filter((entry) => entry.visibility !== "partenaire" || selected.includes(entry.id));
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune démarche dans le catalogue.</p>;
  }

  const atMax = max != null && selected.length >= max;

  return (
    <div className="flex flex-col gap-1.5">
      {entries.map((entry) => {
        const active = selected.includes(entry.id);
        const badge = CATALOGUE_VISIBILITY_LABELS[entry.visibility];
        const disabled = !active && atMax;
        return (
          <button
            key={entry.id}
            type="button"
            disabled={disabled}
            title={disabled ? `Limite de ${max} atteinte` : undefined}
            onClick={() => onToggle(entry.id)}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-left transition-colors",
              active ? "bg-secondary/40" : "bg-background hover:border-primary",
              badge && "opacity-70",
              disabled && "cursor-not-allowed opacity-50 hover:border-border",
            )}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[12.5px] font-semibold">{entry.name}</span>
              {badge ? (
                <span className="w-fit rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {badge}
                </span>
              ) : null}
            </span>
            <span
              className={cn(
                "shrink-0 text-[10.5px] font-extrabold",
                active ? "text-secondary-foreground" : "text-muted-foreground",
              )}
            >
              {active ? activeLabel : inactiveLabel}
            </span>
          </button>
        );
      })}
      {atMax ? (
        <p className="text-xs text-muted-foreground">
          Limite de {max} atteinte — désélectionnez une démarche pour en choisir une autre.
        </p>
      ) : null}
    </div>
  );
}
