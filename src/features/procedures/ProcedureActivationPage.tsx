import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useAllOrganizations } from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { useWritableRootOrganizations } from "@/features/procedures/useWritableRootOrganizations";
import { useProceduresForOrg } from "@/features/procedures/useProcedures";
import { useCategoriesQuery } from "@/features/categories/useCategories";
import { isDraftProcedure } from "@/features/procedures/procedureStatus";
import { groupProceduresByCategory } from "@/features/organizations/organizationProcedures";
import {
  useEnabledProcedureBindings,
  useSetProceduresEnabled,
} from "@/features/organizations/useOrganizationProcedures";
import {
  activationColumns,
  bearerGroups,
  buildEnabledMatrix,
  cellKey,
  disableColumn,
  disableRow,
  enableColumn,
  enableRow,
  isEnabled,
  withPendingChanges,
  type ActivationChange,
} from "@/features/procedures/activationMatrix";

const plural = (n: number, one: string, many: string) => (n > 1 ? `${n} ${many}` : `${n} ${one}`);

/** Recherche insensible à la casse et aux accents. */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

interface BulkConfirm {
  title: string;
  description: string;
  action: string;
  changes: ActivationChange[];
}

function BulkButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

/**
 * `/demarches/activation` — « Activation par organisme » (2026-10-25) : qui
 * propose quelle démarche, sur tout l'arbre d'une organisation principale, en
 * un tableau. Démarches en lignes (rangées par catégorie), organismes en
 * colonnes, « Tous / Aucun » sur chaque ligne et chaque colonne.
 *
 * ⚠️ **MÊME DONNÉE QUE LA SECTION « DÉMARCHES » DE LA FICHE** d'un organisme
 * (`OrganizationProceduresTab`) : deux vues sur `organization_procedures`, la
 * fiche pour un organisme, ce tableau pour l'arbre entier.
 *
 * ⚠️ Un lot « Tous » ne coche jamais ce qu'un autre organisme du même porteur
 * tient déjà (une case grisée le dit), et une ligne ne coche jamais un service
 * interne — voir `activationMatrix.ts`. La base reste la seule barrière : son
 * refus s'affiche tel quel.
 */
export function ProcedureActivationPage() {
  const { data: roots, isLoading: rootsLoading } = useWritableRootOrganizations();
  const { data: allOrgs } = useAllOrganizations();
  const [searchParams, setSearchParams] = useSearchParams();
  const root = roots.find((o) => o.id === searchParams.get("org")) ?? roots[0];

  const { data: procedures, isLoading: proceduresLoading } = useProceduresForOrg(root?.id);
  const { data: categories } = useCategoriesQuery(root?.id);
  const columns = React.useMemo(
    () => (root ? activationColumns(allOrgs ?? [], root.id) : []),
    [allOrgs, root],
  );
  const { data: bindings, isLoading: bindingsLoading } = useEnabledProcedureBindings(
    columns.map((c) => c.organization.id),
  );
  const setEnabled = useSetProceduresEnabled();

  const [query, setQuery] = React.useState("");
  const [pending, setPending] = React.useState<Map<string, ActivationChange>>(new Map());
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<BulkConfirm | null>(null);

  const matrix = React.useMemo(
    () => withPendingChanges(buildEnabledMatrix(bindings ?? []), pending),
    [bindings, pending],
  );
  const groups = React.useMemo(() => bearerGroups(columns), [columns]);
  const hasInternalServices = columns.some((c) => c.organization.is_internal_service);

  const shown = React.useMemo(() => {
    const q = fold(query.trim());
    return (procedures ?? []).filter((p) => q === "" || fold(p.name).includes(q));
  }, [procedures, query]);
  const shownIds = shown.map((p) => p.id);
  const filtered = shown.length !== (procedures ?? []).length;
  const categoryGroups = React.useMemo(
    () => groupProceduresByCategory(shown, categories ?? []),
    [shown, categories],
  );

  /**
   * Les cases visées restent affichées pendant l'écriture (et sa relecture) ;
   * un refus les rend à leur état réel et s'affiche au-dessus du tableau.
   */
  const write = async (changes: ActivationChange[]) => {
    if (changes.length === 0) return;
    setError(null);
    setPending((prev) => {
      const next = new Map(prev);
      for (const c of changes) next.set(cellKey(c.organizationId, c.procedureId), c);
      return next;
    });
    try {
      await setEnabled.mutateAsync(changes);
    } catch (e) {
      setError((e as { message?: string }).message ?? "L'activation n'a pas pu être enregistrée.");
    } finally {
      setPending((prev) => {
        const next = new Map(prev);
        for (const c of changes) {
          const key = cellKey(c.organizationId, c.procedureId);
          if (next.get(key) === c) next.delete(key);
        }
        return next;
      });
    }
  };

  const among = filtered ? ` parmi les ${plural(shown.length, "démarche affichée", "démarches affichées")}` : "";
  const ready = !proceduresLoading && !bindingsLoading;

  return (
    <div className="p-6">
      <PageHeader
        section="Démarches"
        title="Activation par organisme"
        subtitle="Quel organisme propose quelle démarche. Une case cochée : la démarche lui est adressée, et c'est lui qui l'instruit."
      />

      {rootsLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
      ) : !root ? (
        <EmptyState message="Aucune organisation principale rattachée à votre compte." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            {roots.length > 1 ? (
              <Field label="Organisation" htmlFor="activation-org" className="w-full max-w-sm">
                <select
                  id="activation-org"
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
            ) : null}
            {(procedures ?? []).length > 0 ? (
              <Field label="Rechercher une démarche" htmlFor="activation-search" className="w-full max-w-sm">
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="activation-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </Field>
            ) : null}
          </div>

          {hasInternalServices ? (
            <p className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
              Un organisme et ses services internes n'instruisent jamais la même démarche : une case grisée dit
              qui la propose déjà. « Tous » sur une ligne coche les organismes, jamais les services internes.
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}

          {!ready ? (
            <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
          ) : (procedures ?? []).length === 0 ? (
            <EmptyState message="Aucune démarche dans le catalogue de cette organisation." />
          ) : shown.length === 0 ? (
            <EmptyState message="Aucune démarche ne correspond à la recherche." />
          ) : (
            <div className="max-h-[max(20rem,calc(100vh-21rem))] w-fit max-w-full overflow-auto rounded-xl border border-border bg-card">
              <table className="border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="sticky left-0 top-0 z-30 min-w-[24rem] border-b border-r border-border bg-card px-4 py-3 text-left align-bottom text-xs font-semibold text-muted-foreground"
                    >
                      Démarche
                    </th>
                    {columns.map(({ organization: org, depth }) => {
                      const count = shownIds.filter((p) => isEnabled(matrix, org.id, p)).length;
                      const toEnable = enableColumn(org.id, shownIds, matrix, groups);
                      const toDisable = disableColumn(org.id, shownIds, matrix);
                      return (
                        <th
                          key={org.id}
                          scope="col"
                          className="sticky top-0 z-20 w-32 min-w-[8rem] border-b border-border bg-card px-2 py-3 align-bottom"
                        >
                          <div className="flex flex-col items-center gap-1 text-center">
                            <span
                              title={org.name}
                              className={cn("line-clamp-3 text-xs", depth === 1 ? "font-bold" : "font-semibold")}
                            >
                              {org.name}
                            </span>
                            {org.is_internal_service ? (
                              <Badge variant="muted" className="px-1.5 py-0 text-[10px]">
                                Service interne
                              </Badge>
                            ) : null}
                            <span className="text-[11px] font-normal text-muted-foreground">
                              {count} / {shown.length}
                            </span>
                            <div className="flex gap-1">
                              <BulkButton
                                label={`Tout activer pour « ${org.name} »`}
                                disabled={toEnable.length === 0}
                                onClick={() =>
                                  setConfirm({
                                    title: `Tout activer pour « ${org.name} » ?`,
                                    description: `${plural(toEnable.length, "démarche sera activée", "démarches seront activées")}${among}. Celles qu'un autre organisme du même porteur propose déjà sont laissées de côté.`,
                                    action: "Tout activer",
                                    changes: toEnable,
                                  })
                                }
                              >
                                Tous
                              </BulkButton>
                              <BulkButton
                                label={`Tout désactiver pour « ${org.name} »`}
                                disabled={toDisable.length === 0}
                                onClick={() =>
                                  setConfirm({
                                    title: `Tout désactiver pour « ${org.name} » ?`,
                                    description: `${plural(toDisable.length, "démarche ne lui sera plus adressée", "démarches ne lui seront plus adressées")}${among}.`,
                                    action: "Tout désactiver",
                                    changes: toDisable,
                                  })
                                }
                              >
                                Aucun
                              </BulkButton>
                            </div>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                {categoryGroups.map((group) => (
                  <tbody key={group.categoryId ?? "sans-categorie"}>
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={columns.length + 1}
                        className="border-b border-border bg-muted/60 px-4 py-1.5 text-left text-xs font-semibold"
                      >
                        <span className="sticky left-4">{group.name}</span>
                      </th>
                    </tr>
                    {group.procedures.map((proc) => {
                      const count = columns.filter((c) => isEnabled(matrix, c.organization.id, proc.id)).length;
                      const toEnable = enableRow(proc.id, columns, matrix, groups);
                      const toDisable = disableRow(proc.id, columns, matrix);
                      return (
                        <tr key={proc.id} className="group">
                          <th
                            scope="row"
                            className="sticky left-0 z-10 border-b border-r border-border bg-card px-4 py-2 text-left font-normal group-hover:bg-muted"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <span className="block font-medium">{proc.name}</span>
                                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  {plural(count, "organisme", "organismes")}
                                  {isDraftProcedure(proc.status) ? (
                                    <Badge variant="muted" className="px-1.5 py-0 text-[10px]">
                                      Brouillon
                                    </Badge>
                                  ) : null}
                                </span>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <BulkButton
                                  label={`Activer « ${proc.name} » partout`}
                                  disabled={toEnable.length === 0}
                                  onClick={() =>
                                    setConfirm({
                                      title: `Activer « ${proc.name} » partout ?`,
                                      description: `Elle sera activée pour ${plural(toEnable.length, "organisme", "organismes")}.${hasInternalServices ? " Les services internes ne sont pas cochés : dans chaque groupe, c'est l'organisme porteur qui la reçoit. Déplacez la case si un service l'instruit." : ""}`,
                                      action: "Activer partout",
                                      changes: toEnable,
                                    })
                                  }
                                >
                                  Tous
                                </BulkButton>
                                <BulkButton
                                  label={`Désactiver « ${proc.name} » partout`}
                                  disabled={toDisable.length === 0}
                                  onClick={() =>
                                    setConfirm({
                                      title: `Désactiver « ${proc.name} » partout ?`,
                                      description: `Elle ne sera plus proposée par aucun organisme (${plural(toDisable.length, "organisme aujourd'hui", "organismes aujourd'hui")}).`,
                                      action: "Désactiver partout",
                                      changes: toDisable,
                                    })
                                  }
                                >
                                  Aucun
                                </BulkButton>
                              </div>
                            </div>
                          </th>
                          {columns.map(({ organization: org }) => {
                            const checked = isEnabled(matrix, org.id, proc.id);
                            // On ne verrouille jamais une case cochée : il faut pouvoir la relâcher.
                            const heldBy = checked ? undefined : groups.heldBy(matrix, org.id, proc.id);
                            return (
                              <td
                                key={org.id}
                                className="border-b border-border px-2 py-2 text-center group-hover:bg-muted/50"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={Boolean(heldBy)}
                                  title={heldBy ? `Déjà proposée par « ${heldBy.name} »` : undefined}
                                  aria-label={`« ${proc.name} » pour « ${org.name} »${heldBy ? ` (déjà proposée par « ${heldBy.name} »)` : ""}`}
                                  onChange={(e) =>
                                    void write([
                                      { organizationId: org.id, procedureId: proc.id, enabled: e.target.checked },
                                    ])
                                  }
                                  className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-30"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "primary", size: "md" })}
              onClick={() => {
                if (confirm) void write(confirm.changes);
              }}
            >
              {confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
