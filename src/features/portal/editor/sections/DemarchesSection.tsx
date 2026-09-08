import type { ReactNode } from "react";
import { Building2, ChevronDown, FileText, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemarchesSection as DemarchesSectionData } from "@/features/portal/portalPage";
import {
  AUDIENCE_FILTER_LABELS,
  catalogueAudiences,
  catalogueOrganizations,
  type PortalCatalogueEntry,
} from "@/features/portal/catalogue";
import { effectiveColumns, type Device } from "../device";

const GRID_COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

/**
 * Un filtre de la grille tel que le portail le rend — figé ici, comme le champ
 * de recherche : le canevas montre la page, il ne la fait pas fonctionner.
 * Chacun n'apparaît que s'il y a de quoi choisir.
 */
function FilterPreview({
  icon,
  label,
  choices,
}: {
  icon: ReactNode;
  label: string;
  /** Ce que l'usager pourra choisir — en infobulle, la liste est parlante ici. */
  choices: string;
}) {
  return (
    <span
      aria-hidden="true"
      title={choices}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[12px] text-muted-foreground"
    >
      {icon}
      {label}
      <ChevronDown className="size-3.5" />
    </span>
  );
}

/**
 * Grille de démarches : la liste RÉELLE, celle que le portail sert. Les
 * démarches que l'usager ne verra pas (brouillon, interne, hors période, non
 * activée…) n'y figurent pas — l'inspecteur les surface avec leur motif quand
 * on les épingle. Chaque carte nomme les organismes qui proposent la
 * démarche, et l'en-tête porte le filtre par organisme dès que deux organismes
 * au moins en proposent.
 */
export function DemarchesSection({
  section,
  device,
  catalogue,
}: {
  section: DemarchesSectionData;
  device: Device;
  catalogue: PortalCatalogueEntry[];
}) {
  const pinned = new Set(section.pinned);
  let entries = catalogue.filter((entry) => entry.visibility === "visible");
  if (section.pinnedFirst) {
    entries = [...entries].sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)));
  }
  const organizations = catalogueOrganizations(entries);
  // ⚠️ Les publics se lisent sur les démarches AFFICHÉES, pas sur les trois
  // valeurs possibles : proposer « Entreprise » quand aucune démarche ne s'y
  // adresse ne mènerait qu'à une liste vide. Et le réglage ne suffit pas — il
  // dit ce que la collectivité veut, le catalogue dit si ça a un sens.
  const audiences = section.audienceFilter ? catalogueAudiences(entries) : [];
  const cols = effectiveColumns(section.columns, device);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
        {/* Les deux filtres se CUMULENT — chacun sur sa dimension : qui je
            suis, et à qui je m'adresse. Ils se rangent donc côte à côte. */}
        <div className="flex flex-wrap items-center gap-2">
          {audiences.length > 1 ? (
            <FilterPreview
              icon={<UserRound className="size-3.5" />}
              label="Je suis…"
              choices={audiences.map((a) => AUDIENCE_FILTER_LABELS[a]).join(", ")}
            />
          ) : null}
          {organizations.length > 1 ? (
            <FilterPreview
              icon={<Building2 className="size-3.5" />}
              label="Tous les organismes"
              choices={organizations.map((org) => org.name).join(", ")}
            />
          ) : null}
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          Aucune démarche n'est proposée en ligne pour le moment.
        </p>
      ) : (
        <div className={cn("grid gap-2.5", GRID_COLS_CLASS[cols])}>
          {entries.map((entry) => {
            const isPinned = pinned.has(entry.id);
            return (
              <div
                key={entry.id}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border border-border bg-background p-3",
                  isPinned && "border-primary bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex size-[26px] items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="size-3.5 text-primary" />
                  </div>
                  {isPinned ? (
                    <span className="whitespace-nowrap rounded-full bg-secondary px-1.5 py-0.5 text-[10.5px] font-extrabold text-secondary-foreground">
                      À la une
                    </span>
                  ) : null}
                </div>
                <span className="text-[13.5px] font-bold leading-tight text-foreground">{entry.name}</span>
                {entry.shortDescription ? (
                  <span className="text-[11.5px] text-muted-foreground">{entry.shortDescription}</span>
                ) : null}
                <ul className="mt-auto flex flex-wrap gap-1 pt-1" aria-label="Organismes proposant cette démarche">
                  {entry.organizations.map((org) => (
                    <li
                      key={org.id}
                      className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                    >
                      {org.name}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
