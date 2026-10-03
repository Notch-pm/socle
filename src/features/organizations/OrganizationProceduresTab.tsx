import * as React from "react";
import { CheckCheck, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  groupProceduresByCategory,
  offersHeldBySiblings,
  procedureIdsToEnable,
} from "./organizationProcedures";
import {
  useEnableProcedures,
  useEnabledProcedureBindings,
  useOrganizationProcedureBindings,
  useSetProcedureEnabled,
} from "./useOrganizationProcedures";

/**
 * Activation des démarches pour l'organisation éditée. Le catalogue affiché est
 * celui de son organisation principale (ancêtre racine), rangé par catégorie ;
 * chaque démarche peut être rendue active ou non pour cette organisation, et
 * « Tout activer » active d'un geste tout le catalogue ou une catégorie — en
 * écartant ce qu'une autre organisation du même porteur tient déjà.
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
  const enableMany = useEnableProcedures();
  const [confirmAll, setConfirmAll] = React.useState(false);

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
  const activeCount = (procedures ?? []).filter((p) => enabledIds.has(p.id)).length;
  const groups = React.useMemo(
    () => groupProceduresByCategory(procedures ?? [], categories ?? []),
    [procedures, categories],
  );
  const allToEnable = procedureIdsToEnable(procedures ?? [], enabledIds, heldBySiblings);
  const enable = (procedureIds: string[], onSuccess?: () => void) =>
    enableMany.mutate({ organizationId, procedureIds }, { onSuccess });
  const error = (setEnabled.error ?? enableMany.error) as Error | null;

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
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {activeCount} / {procedures.length} activée{activeCount > 1 ? "s" : ""}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={allToEnable.length === 0 || enableMany.isPending}
              onClick={() => setConfirmAll(true)}
            >
              <CheckCheck className="size-4" />
              Tout activer
            </Button>
          </div>
        ) : null}
      </div>

      {bearer ? (
        <p className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          Ce service est interne : sur le site de démarches, ces démarches sont présentées au nom
          de <span className="font-medium text-foreground">{bearer.name}</span>. C'est ici qu'elles
          sont instruites.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="p-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse border-b border-border bg-muted/40 last:border-b-0"
              />
            ))}
          </CardContent>
        </Card>
      ) : isError ? (
        <p className="p-4 text-sm text-destructive">Impossible de charger les démarches.</p>
      ) : !procedures?.length ? (
        <EmptyState message="Aucune démarche dans le catalogue de l'organisation principale." />
      ) : (
        groups.map((group) => {
          const groupActive = group.procedures.filter((p) => enabledIds.has(p.id)).length;
          const groupToEnable = procedureIdsToEnable(group.procedures, enabledIds, heldBySiblings);
          return (
            <section key={group.categoryId ?? "sans-categorie"} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {group.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {groupActive} / {group.procedures.length}
                  </span>
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={groupToEnable.length === 0 || enableMany.isPending}
                  onClick={() => enable(groupToEnable)}
                  aria-label={`Tout activer dans « ${group.name} »`}
                >
                  <CheckCheck className="size-4" />
                  Tout activer
                </Button>
              </div>
              <Card>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <tbody>
                      {group.procedures.map((proc) => {
                        const checked = enabledIds.has(proc.id);
                        // Déjà prise ailleurs dans le groupe. On ne verrouille jamais
                        // une démarche déjà activée ici : il faut pouvoir la relâcher.
                        const heldBy = checked ? undefined : heldBySiblings.get(proc.id);
                        return (
                          <tr
                            key={proc.id}
                            className="border-t border-border first:border-t-0 hover:bg-muted/30"
                          >
                            <td className="px-4 py-3 font-medium">
                              <div className="flex items-center gap-2">
                                <ListChecks className="size-4 text-muted-foreground" />
                                {proc.name}
                              </div>
                            </td>
                            <td className="w-28 px-4 py-3">
                              <Badge variant={proc.type === "interne" ? "muted" : "secondary"}>
                                {proc.type === "interne" ? "Interne" : "Externe"}
                              </Badge>
                            </td>
                            <td className="w-48 px-4 py-3">
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
                </CardContent>
              </Card>
            </section>
          );
        })
      )}

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activer toutes les démarches ?</AlertDialogTitle>
            <AlertDialogDescription>
              {allToEnable.length > 1
                ? `${allToEnable.length} démarches seront activées pour cette organisation.`
                : "1 démarche sera activée pour cette organisation."}{" "}
              Celles qu'une autre organisation du même porteur propose déjà sont laissées de côté.
              Chacune reste désactivable une à une.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "primary", size: "md" })}
              disabled={enableMany.isPending}
              onClick={(e) => {
                // Fermée sur succès : un refus de la base doit rester visible.
                e.preventDefault();
                enable(allToEnable, () => setConfirmAll(false));
              }}
            >
              {enableMany.isPending ? "Activation…" : "Tout activer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
