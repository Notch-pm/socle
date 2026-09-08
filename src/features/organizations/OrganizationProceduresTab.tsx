import * as React from "react";
import { ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  useAllOrganizations,
  bearerByOrganization,
  findRootAncestor,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { useProceduresForOrg } from "@/features/procedures/useProcedures";
import { useCategoriesQuery } from "@/features/categories/useCategories";
import {
  bearerGroupSiblings,
  buildEnabledProcedureIds,
  offersHeldBySiblings,
} from "./organizationProcedures";
import {
  useEnabledProcedureBindings,
  useOrganizationProcedureBindings,
  useSetProcedureEnabled,
} from "./useOrganizationProcedures";

/**
 * Activation des démarches pour l'organisation éditée. Le catalogue affiché est
 * celui de son organisation principale (ancêtre racine) ; chaque démarche peut
 * être rendue active ou non pour cette organisation.
 */
export function OrganizationProceduresTab({ organizationId }: { organizationId: string }) {
  const { data: allOrgs, isLoading: orgsLoading } = useAllOrganizations();
  const root = allOrgs ? findRootAncestor(allOrgs, organizationId) : undefined;

  const { data: procedures, isLoading: procsLoading, isError } = useProceduresForOrg(root?.id);
  // Tant que la liste des orgs charge, la racine n'est pas résolue et la requête
  // des démarches reste désactivée : on affiche le squelette plutôt que « vide ».
  const isLoading = orgsLoading || procsLoading;
  const { data: bindings } = useOrganizationProcedureBindings(organizationId);
  const { data: categories } = useCategoriesQuery();
  const setEnabled = useSetProcedureEnabled();

  const enabledIds = React.useMemo(() => buildEnabledProcedureIds(bindings ?? []), [bindings]);

  // Qui d'autre instruit au nom du même porteur — le porteur lui-même et ses
  // services internes. Une démarche déjà prise par l'un d'eux ne peut pas
  // l'être ici : on le montre, plutôt que de laisser la base refuser.
  const siblings = React.useMemo(
    () => bearerGroupSiblings(allOrgs ?? [], organizationId),
    [allOrgs, organizationId],
  );
  const { data: siblingBindings } = useEnabledProcedureBindings(siblings.map((org) => org.id));
  const heldBySiblings = React.useMemo(
    () => offersHeldBySiblings(siblingBindings ?? [], siblings),
    [siblingBindings, siblings],
  );

  // Le porteur, quand cette organisation est un service interne : c'est son nom
  // que le site de démarches affichera à la place du sien.
  const self = (allOrgs ?? []).find((org) => org.id === organizationId);
  const bearer =
    self?.is_internal_service && self.parent_id
      ? bearerByOrganization(allOrgs ?? []).get(self.parent_id)
      : undefined;
  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const activeCount = (procedures ?? []).filter((p) => enabledIds.has(p.id)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {root ? (
            <>
              Activez les démarches proposées par{" "}
              <span className="font-medium text-foreground">{root.name}</span> pour cette
              organisation.
            </>
          ) : (
            "Catalogue de démarches de l'organisation principale."
          )}
        </p>
        {procedures?.length ? (
          <Badge variant="secondary">
            {activeCount} / {procedures.length} activée{activeCount > 1 ? "s" : ""}
          </Badge>
        ) : null}
      </div>

      {bearer ? (
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          Ce service est interne : sur le site de démarches, ces démarches sont présentées au nom
          de <span className="font-medium text-foreground">{bearer.name}</span>. C'est ici qu'elles
          sont instruites.
        </p>
      ) : null}

      {setEnabled.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {(setEnabled.error as Error).message}
        </p>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse border-b border-border bg-muted/40 last:border-b-0"
                />
              ))}
            </div>
          ) : isError ? (
            <p className="p-4 text-sm text-destructive">Impossible de charger les démarches.</p>
          ) : !procedures?.length ? (
            <div className="p-4">
              <EmptyState message="Aucune démarche dans le catalogue de l'organisation principale." />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Libellé</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="w-32 px-4 py-3 text-right">Activée</th>
                </tr>
              </thead>
              <tbody>
                {procedures.map((proc) => {
                  const checked = enabledIds.has(proc.id);
                  // Déjà prise ailleurs dans le groupe. On ne verrouille jamais
                  // une démarche déjà activée ici : il faut pouvoir la relâcher.
                  const heldBy = checked ? undefined : heldBySiblings.get(proc.id);
                  return (
                    <tr key={proc.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <ListChecks className="size-4 text-muted-foreground" />
                          {proc.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {proc.category_id ? (categoryName.get(proc.category_id) ?? "—") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={proc.type === "interne" ? "muted" : "secondary"}>
                          {proc.type === "interne" ? "Interne" : "Externe"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-1">
                          <Switch
                            checked={checked}
                            disabled={Boolean(heldBy)}
                            aria-label={`Activer « ${proc.name} »`}
                            onCheckedChange={(next) =>
                              setEnabled.mutate({
                                organizationId,
                                procedureId: proc.id,
                                enabled: next,
                              })
                            }
                          />
                          {heldBy ? (
                            <span className="text-right text-xs text-muted-foreground">
                              Déjà activée par « {heldBy} »
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
