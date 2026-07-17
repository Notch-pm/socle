import * as React from "react";
import { Pencil, Trash2, Upload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  useQuartiers,
  useQuartiersGeoJson,
  useQuartierContactCounts,
  useDeleteQuartier,
  useRecalculateQuartiers,
  type Quartier,
} from "@/features/quartiers/useQuartiers";
import { readableTextColor } from "@/features/quartiers/quartiersGeojson";
import { QuartiersMap } from "@/features/quartiers/QuartiersMap";
import { ImportQuartiersDialog } from "@/features/quartiers/ImportQuartiersDialog";
import { QuartierEditDialog } from "@/features/quartiers/QuartierEditDialog";

/**
 * Paramétrage des quartiers d'une organisation principale (racine) : carte,
 * liste avec nombre d'usagers rattachés, import GeoJSON, renommage/couleur,
 * suppression, recalcul des assignations. Utilisé par la page admin
 * `/quartiers` et la section superadmin de `OrgSettingsPage` — les droits
 * d'écriture sont portés par le RLS (`is_org_admin`).
 */
export function QuartiersManager({ organizationId }: { organizationId: string }) {
  const { data: quartiers, isLoading, isError } = useQuartiers(organizationId);
  const { data: geoQuartiers } = useQuartiersGeoJson(organizationId);
  const { data: counts } = useQuartierContactCounts(organizationId);
  const deleteQuartier = useDeleteQuartier(organizationId);
  const recalculate = useRecalculateQuartiers(organizationId);

  const [importOpen, setImportOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Quartier | null>(null);
  const [deleting, setDeleting] = React.useState<Quartier | null>(null);
  const [recalcDone, setRecalcDone] = React.useState(false);

  const countByQuartier = new Map((counts ?? []).map((c) => [c.quartier_id, c.count]));
  const unassignedCount = counts?.find((c) => c.quartier_id === null)?.count ?? 0;

  function handleRecalculate() {
    setRecalcDone(false);
    recalculate.mutate(undefined, {
      onSuccess: () => {
        setRecalcDone(true);
        window.setTimeout(() => setRecalcDone(false), 2500);
      },
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteQuartier.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {recalcDone && <span className="text-sm text-muted-foreground">Assignations recalculées ✓</span>}
        <Button
          variant="outline"
          onClick={handleRecalculate}
          disabled={recalculate.isPending}
          title="Réapplique le rattachement automatique des usagers géolocalisés"
        >
          <RefreshCw />
          {recalculate.isPending ? "Recalcul…" : "Recalculer les assignations"}
        </Button>
        <Button onClick={() => setImportOpen(true)}>
          <Upload />
          Importer un GeoJSON
        </Button>
      </div>

      {recalculate.isError && (
        <p className="text-sm text-destructive">
          Le recalcul a échoué — cette action est réservée aux administrateurs de l'organisation.
        </p>
      )}

      <QuartiersMap quartiers={geoQuartiers ?? []} />

      {isLoading ? (
        <div className="rounded-lg border border-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse border-b border-border bg-muted/40 last:border-b-0" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Impossible de charger les quartiers.</p>
      ) : quartiers && quartiers.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Quartier</th>
                <th className="px-4 py-3">Usagers</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {quartiers.map((quartier) => (
                <tr key={quartier.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className="font-medium"
                      style={
                        quartier.color
                          ? {
                              backgroundColor: quartier.color,
                              color: readableTextColor(quartier.color),
                            }
                          : undefined
                      }
                    >
                      {quartier.name}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {countByQuartier.get(quartier.id) ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Modifier"
                        onClick={() => setEditing(quartier)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Supprimer"
                        onClick={() => setDeleting(quartier)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {unassignedCount > 0 && (
                <tr className="border-t border-border">
                  <td className="px-4 py-3">
                    <Badge variant="outline">Sans quartier</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{unassignedCount}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="Aucun quartier défini. Importez un fichier GeoJSON pour commencer." />
      )}

      <ImportQuartiersDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        organizationId={organizationId}
      />

      <QuartierEditDialog
        quartier={editing}
        organizationId={organizationId}
        existing={quartiers ?? []}
        onOpenChange={(open) => !open && setEditing(null)}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleting?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les usagers rattachés à ce quartier ne seront pas supprimés mais perdront ce
              rattachement.
            </AlertDialogDescription>
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
