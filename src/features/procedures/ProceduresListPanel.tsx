import * as React from "react";
import { Plus, Pencil, Trash2, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useCategoriesQuery } from "@/features/categories/useCategories";
import { useIntegrationsCatalogue } from "@/features/integrations/useIntegrations";
import { TranslatedIn } from "@/features/languages/TranslatedIn";
import {
  useProceduresForOrg,
  useDeleteProcedure,
  useUpdateProcedure,
  type Procedure,
} from "@/features/procedures/useProcedures";
import {
  isDraftProcedure,
  statusFromProductionToggle,
} from "@/features/procedures/procedureStatus";

/**
 * Filtre d'origine de la liste : les démarches propres au catalogue Edilumen,
 * ou celles importées d'un partenaire (`integration_id` posé — Arpège…).
 * Simple confort d'affichage : rien n'est enregistré, la liste revient sur
 * « Toutes » à chaque visite.
 */
export type ProcedureOrigin = "toutes" | "edilumen" | "partenaires";

export function matchesOrigin(proc: Pick<Procedure, "integration_id">, origin: ProcedureOrigin): boolean {
  if (origin === "edilumen") return !proc.integration_id;
  if (origin === "partenaires") return Boolean(proc.integration_id);
  return true;
}

const EMPTY_BY_ORIGIN: Record<ProcedureOrigin, string> = {
  toutes: "Aucune démarche pour cette organisation.",
  edilumen: "Aucune démarche Edilumen pour cette organisation.",
  partenaires: "Aucune démarche partenaire pour cette organisation.",
};

export function ProceduresListPanel({
  organizationId,
  canDelete,
  onNew,
  onEdit,
}: {
  organizationId: string;
  /** Suppression réservée au superadmin. */
  canDelete: boolean;
  onNew: () => void;
  onEdit: (id: string) => void;
}) {
  const { data: procedures, isLoading, isError } = useProceduresForOrg(organizationId);
  const { data: categories } = useCategoriesQuery();
  const deleteProc = useDeleteProcedure();
  const updateProc = useUpdateProcedure();
  const [deleting, setDeleting] = React.useState<Procedure | null>(null);
  const [origin, setOrigin] = React.useState<ProcedureOrigin>("toutes");

  const all = procedures ?? [];
  const partnerCount = all.filter((p) => matchesOrigin(p, "partenaires")).length;
  const visible = all.filter((p) => matchesOrigin(p, origin));

  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));
  // Démarches partenaires (Arpège…) : le badge porte le nom du partenaire.
  const { data: integrations } = useIntegrationsCatalogue();
  const partnerName = new Map((integrations ?? []).map((i) => [i.id, i.name]));

  // Le droit d'écrire est porté par le RLS (l'UI ne masque pas le commutateur) :
  // un membre non administrateur reçoit un refus de la base, pas un écran menteur.
  function setProduction(proc: Procedure, enabled: boolean) {
    updateProc.mutate({ id: proc.id, status: statusFromProductionToggle(enabled) });
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteProc.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={origin}
          onChange={setOrigin}
          aria-label="Origine des démarches"
          options={[
            { value: "toutes", label: `Toutes les démarches (${all.length})` },
            { value: "edilumen", label: `Démarches Edilumen (${all.length - partnerCount})` },
            { value: "partenaires", label: `Démarches partenaires (${partnerCount})` },
          ]}
        />
        <Button onClick={onNew} className="ml-auto">
          <Plus />
          Nouvelle démarche
        </Button>
      </div>

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
          ) : visible.length === 0 ? (
            <div className="p-4">
              <EmptyState message={EMPTY_BY_ORIGIN[origin]} />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-16 px-4 py-3">Rang</th>
                  <th className="px-4 py-3">Libellé</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="w-28 px-4 py-3">Production</th>
                  <th className="w-24 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((proc) => (
                  <tr key={proc.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {proc.order_index ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <ListChecks className="size-4 text-muted-foreground" />
                        {proc.name}
                        {isDraftProcedure(proc.status) ? (
                          <Badge variant="outline" className="font-medium">
                            Brouillon
                          </Badge>
                        ) : null}
                        {proc.integration_id ? (
                          <Badge variant="secondary" title="Démarche partenaire : se dépose chez le partenaire, depuis Clara">
                            {partnerName.get(proc.integration_id) ?? "Partenaire"}
                          </Badge>
                        ) : null}
                        <TranslatedIn translations={proc.translations} />
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
                      <Switch
                        checked={!isDraftProcedure(proc.status)}
                        onCheckedChange={(v) => setProduction(proc, v)}
                        aria-label={`Passer « ${proc.name} » en production`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Modifier"
                          onClick={() => onEdit(proc.id)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {canDelete ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Supprimer"
                            onClick={() => setDeleting(proc)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleting?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
