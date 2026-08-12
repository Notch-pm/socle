import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useImportQuartiers, useQuartiers } from "@/features/quartiers/useQuartiers";
import {
  extractFeatures,
  prepareImportRows,
  QUARTIER_COLOR_PALETTE,
  type ParsedQuartierRow,
} from "@/features/quartiers/quartiersGeojson";

function ColorSwatches({
  value,
  onChange,
  size = "h-5 w-5",
}: {
  value: string;
  onChange: (color: string) => void;
  size?: string;
}) {
  return (
    <div className="flex gap-1">
      {QUARTIER_COLOR_PALETTE.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.name}
          aria-label={c.name}
          onClick={() => onChange(c.value)}
          className={`${size} rounded-full border-2 transition-all ${
            value === c.value ? "scale-110 border-foreground" : "border-transparent"
          }`}
          style={{ backgroundColor: c.value }}
        />
      ))}
    </div>
  );
}

export { ColorSwatches };

/**
 * Import de quartiers depuis un fichier GeoJSON : détection des polygones,
 * ajustement nom/couleur par ligne, envoi en un lot atomique (RPC
 * `create_quartiers_batch`) suivi du recalcul des assignations.
 *
 * L'import **remplace** le découpage existant : le fichier fait foi. La
 * suppression et la création se font dans la même transaction côté serveur.
 */
export function ImportQuartiersDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}) {
  const [rows, setRows] = React.useState<ParsedQuartierRow[] | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const importQuartiers = useImportQuartiers(organizationId);
  const { data: existing } = useQuartiers(organizationId);
  const existingCount = existing?.length ?? 0;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        const features = extractFeatures(json);
        if (!features.length) throw new Error("Aucun polygone trouvé dans ce fichier.");
        setRows(prepareImportRows(features));
      } catch (err) {
        setFileError(err instanceof Error ? err.message : "Fichier GeoJSON invalide.");
        setRows(null);
      }
    };
    reader.readAsText(file);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setRows(null);
      setFileError(null);
      setConfirmOpen(false);
      importQuartiers.reset();
    }
  }

  function handleImport() {
    if (!rows) return;
    setConfirmOpen(false);
    importQuartiers.mutate(
      rows.map((r) => ({ name: r.name, color: r.color, geometry: r.geometry })),
      { onSuccess: () => handleOpenChange(false) },
    );
  }

  const invalidRow = rows?.some((r) => !r.name.trim()) ?? false;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importer des quartiers (GeoJSON)</DialogTitle>
          <DialogDescription>
            Fichier .geojson contenant un ou plusieurs polygones (FeatureCollection, Feature ou
            géométrie) — par exemple un export QGIS ou un jeu de données ouvertes de la commune.
            Le fichier fait foi : il <strong>remplace</strong> le découpage actuel.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="flex flex-col gap-3">
            <Input
              type="file"
              accept=".geojson,application/geo+json,application/json,.json"
              onChange={handleFile}
            />
            {fileError && <p className="text-sm text-destructive">{fileError}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {rows.length} polygone(s) détecté(s). Ajustez le nom et la couleur de chaque quartier
              avant l'import. Les doublons de nom au sein du fichier seront suffixés
              automatiquement.
            </p>

            {existingCount > 0 && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
                Les {existingCount} quartier(s) actuels seront supprimés et remplacés par ce
                fichier. Les usagers seront rattachés au nouveau découpage.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Input
                    value={row.name}
                    aria-label={`Nom du quartier ${i + 1}`}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev!.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)),
                      )
                    }
                    className="flex-1"
                  />
                  <ColorSwatches
                    value={row.color}
                    onChange={(color) =>
                      setRows((prev) => prev!.map((r, j) => (j === i ? { ...r, color } : r)))
                    }
                  />
                </div>
              ))}
            </div>
            {importQuartiers.isError && (
              <p className="text-sm text-destructive">
                L'import a échoué (aucun quartier créé). Vérifiez le fichier et réessayez.
              </p>
            )}
            <Button
              className="w-full"
              onClick={() => (existingCount > 0 ? setConfirmOpen(true) : handleImport())}
              disabled={importQuartiers.isPending || invalidRow}
            >
              {importQuartiers.isPending
                ? "Import…"
                : existingCount > 0
                  ? `Remplacer le découpage par ${rows.length} quartier(s)`
                  : `Importer ${rows.length} quartier(s)`}
            </Button>
          </div>
        )}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Remplacer les {existingCount} quartier(s) existants ?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Le découpage actuel sera supprimé et remplacé par les {rows?.length ?? 0} quartier(s)
                du fichier. Les usagers ne sont pas supprimés : ils sont rattachés au nouveau
                découpage. Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleImport}>Remplacer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
