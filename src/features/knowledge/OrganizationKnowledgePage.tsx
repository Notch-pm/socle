import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CircleCheck, CircleDashed } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  useAllOrganizations,
  type Organization,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { KnowledgeHeader } from "@/features/knowledge/KnowledgeHeader";
import { knowledgeOrgEntries, selectedKnowledgeOrg } from "@/features/knowledge/knowledgeOrgs";

/**
 * Page Connaissances « un texte par organisme » (attributions, informations
 * usagers) : la liste des organismes à gauche, l'éditeur de celui qu'on a
 * choisi à droite.
 *
 * ⚠️ **L'ÉTAT DE CHAQUE ORGANISME SE LIT D'UN COUP D'ŒIL** — c'est la raison
 * d'être de la page : du temps où ces textes étaient un onglet de chaque
 * organisation, rien ne disait quels services n'avaient encore rien rédigé.
 *
 * L'organisme choisi vit dans l'URL (`?org=`) : la fiche d'une organisation y
 * renvoie directement. Un identifiant inconnu retombe sur le premier organisme.
 * Changer d'organisme abandonne une saisie non enregistrée, comme le faisait
 * déjà le changement d'onglet.
 */
export function OrganizationKnowledgePage({
  header,
  listLabel,
  include = () => true,
  useFilled,
  renderEditor,
}: {
  header: React.ComponentProps<typeof KnowledgeHeader>;
  listLabel: string;
  /** Organismes concernés (les informations usagers écartent les services internes). */
  include?: (organization: Organization) => boolean;
  /** Identifiants des organismes dont le texte est rédigé. */
  useFilled: (organizationIds: string[]) => { data?: Set<string> };
  renderEditor: (organization: Organization) => React.ReactNode;
}) {
  const { data: organizations, isLoading, isError } = useAllOrganizations();
  const [searchParams, setSearchParams] = useSearchParams();

  const entries = React.useMemo(
    () => knowledgeOrgEntries((organizations ?? []).filter(include)),
    // `include` est une fonction pure déclarée par la page : seule la liste compte.
    [organizations],
  );
  const ids = React.useMemo(() => entries.map((e) => e.organization.id), [entries]);
  const { data: filled } = useFilled(ids);
  const selected = selectedKnowledgeOrg(entries, searchParams.get("org"));

  return (
    <div className="p-6">
      <KnowledgeHeader {...header} />

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
      ) : isError ? (
        <EmptyState message="La liste des organisations n'a pas pu être lue. Réessayez dans un instant." />
      ) : !selected ? (
        <EmptyState message="Aucune organisation à renseigner." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label={listLabel} className="self-start rounded-xl border border-border bg-card p-2">
            <p className="px-2 pb-1.5 pt-1 text-xs font-semibold text-muted-foreground">{listLabel}</p>
            <ul>
              {entries.map(({ organization, depth }) => {
                const active = organization.id === selected.id;
                const isFilled = filled?.has(organization.id) ?? false;
                const StatusIcon = isFilled ? CircleCheck : CircleDashed;
                const status = isFilled ? "Renseigné" : "À rédiger";
                return (
                  <li key={organization.id}>
                    <button
                      type="button"
                      onClick={() => setSearchParams({ org: organization.id }, { replace: true })}
                      aria-current={active ? "true" : undefined}
                      style={{ paddingLeft: `${0.5 + (depth - 1) * 0.75}rem` }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "bg-primary/10 font-semibold text-primary" : "font-medium hover:bg-muted",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{organization.name}</span>
                      {/* L'état ne s'annonce qu'une fois connu : un « À rédiger » provisoire mentirait. */}
                      {filled ? (
                        <span title={status} className="shrink-0">
                          <StatusIcon
                            aria-hidden="true"
                            className={cn("size-4", isFilled ? "text-primary" : "text-muted-foreground")}
                          />
                          <span className="sr-only">{status}</span>
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section aria-label={selected.name} className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{selected.name}</h2>
              <Link
                to={`/organisations/${selected.id}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Fiche de l'organisation
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </div>
            {/* `key` : un autre organisme repart d'un formulaire neuf. */}
            <div key={selected.id}>{renderEditor(selected)}</div>
          </section>
        </div>
      )}
    </div>
  );
}
