import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleCheck, CircleDashed } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { useWritableRootOrganizations } from "@/features/procedures/useWritableRootOrganizations";
import { useProceduresForOrg } from "@/features/procedures/useProcedures";
import { useCategoriesQuery } from "@/features/categories/useCategories";
import { PROCEDURE_STEPS } from "@/features/procedures/steps";
import { KnowledgeHeader } from "@/features/knowledge/KnowledgeHeader";
import {
  COVERAGE_COLUMNS,
  coverageLabel,
  isCoverageComplete,
  knowledgeCoverage,
} from "@/features/knowledge/knowledgeCoverage";

/** Étape « Base de connaissances » de l'éditeur de démarche (`?step=`, 0-based). */
const KNOWLEDGE_STEP = PROCEDURE_STEPS.findIndex((s) => s.key === "connaissances");

/**
 * `/connaissances/demarches` — « Bases des démarches » : où en est la base de
 * connaissances de chaque démarche du catalogue (navigation v2, 2026-10-24).
 *
 * ⚠️ **VUE TRANSVERSE, EN LECTURE** : la base d'une démarche se rédige dans
 * l'éditeur de démarche, étape « Base de connaissances » ; « Compléter » y
 * mène directement. Rien ne s'écrit ici — une seconde façon d'éditer le même
 * JSON serait une seconde façon de le casser.
 */
export function ProcedureKnowledgePage() {
  const { data: roots, isLoading: rootsLoading } = useWritableRootOrganizations();
  const [searchParams, setSearchParams] = useSearchParams();
  const root = roots.find((o) => o.id === searchParams.get("org")) ?? roots[0];
  const { data: procedures, isLoading: proceduresLoading } = useProceduresForOrg(root?.id);
  const { data: categories } = useCategoriesQuery(root?.id);
  const [onlyIncomplete, setOnlyIncomplete] = React.useState(false);

  const rows = React.useMemo(() => {
    const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));
    return (procedures ?? []).map((p) => {
      const coverage = knowledgeCoverage(p.knowledge_base);
      return {
        id: p.id,
        name: p.name,
        category: p.category_id ? (categoryName.get(p.category_id) ?? "") : "",
        coverage,
        complete: isCoverageComplete(coverage),
      };
    });
  }, [procedures, categories]);
  const completeCount = rows.filter((r) => r.complete).length;
  const shown = onlyIncomplete ? rows.filter((r) => !r.complete) : rows;

  return (
    <div className="p-6">
      <KnowledgeHeader
        crumb="Par démarche"
        title="Bases des démarches"
        description="Aide à l'agent, FAQ, sources et garde-fous propres à chaque démarche. La base d'une démarche se rédige dans son éditeur ; la consigne d'une démarche l'emporte sur la consigne générale."
        audience="interne"
        usedBy={["Iris", "Assistant IA de l'agent"]}
      />

      {rootsLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
      ) : !root ? (
        <EmptyState message="Aucune organisation principale rattachée à votre compte." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            {roots.length > 1 ? (
              <Field label="Organisation" htmlFor="kb-procedures-org" className="max-w-sm flex-1">
                <select
                  id="kb-procedures-org"
                  value={root.id}
                  onChange={(e) => setSearchParams({ org: e.target.value }, { replace: true })}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {roots.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <span />
            )}
            {rows.length > 0 ? (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  {completeCount} sur {rows.length} complète{completeCount > 1 ? "s" : ""}
                </span>
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={onlyIncomplete}
                    onChange={(e) => setOnlyIncomplete(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  Seulement les bases à compléter
                </label>
              </div>
            ) : null}
          </div>

          {proceduresLoading ? (
            <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
          ) : rows.length === 0 ? (
            <EmptyState message="Aucune démarche dans le catalogue de cette organisation." />
          ) : shown.length === 0 ? (
            <EmptyState message="Toutes les bases sont complètes." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground">
                    <th scope="col" className="px-4 py-3">
                      Démarche
                    </th>
                    {COVERAGE_COLUMNS.map((c) => (
                      <th key={c.key} scope="col" className="px-3 py-3">
                        {c.label}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <th scope="row" className="px-4 py-3 text-left font-medium">
                        <span className="block">{row.name}</span>
                        {row.category ? (
                          <span className="block text-xs font-normal text-muted-foreground">{row.category}</span>
                        ) : null}
                      </th>
                      {COVERAGE_COLUMNS.map((c) => {
                        const count = row.coverage[c.key];
                        const Icon = count > 0 ? CircleCheck : CircleDashed;
                        return (
                          <td key={c.key} className="px-3 py-3">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5",
                                count > 0 ? "text-foreground" : "text-muted-foreground",
                              )}
                            >
                              <Icon
                                aria-hidden="true"
                                className={cn("size-4", count > 0 ? "text-primary" : "text-muted-foreground")}
                              />
                              {coverageLabel(c.key, count)}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/demarches/${row.id}?step=${KNOWLEDGE_STEP}`}
                          className="inline-flex rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                          aria-label={`${row.complete ? "Ouvrir" : "Compléter"} la base de « ${row.name} »`}
                        >
                          {row.complete ? "Ouvrir" : "Compléter"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
