import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  useUpdateQuartier,
  UNIQUE_VIOLATION,
  type Quartier,
} from "@/features/quartiers/useQuartiers";
import { QUARTIER_COLOR_PALETTE } from "@/features/quartiers/quartiersGeojson";
import { ColorSwatches } from "@/features/quartiers/ImportQuartiersDialog";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

/** Renommage et couleur d'un quartier (la géométrie ne s'édite pas dans l'app). */
export function QuartierEditDialog({
  quartier,
  organizationId,
  existing,
  onOpenChange,
}: {
  quartier: Quartier | null;
  organizationId: string;
  /** Quartiers existants, pour valider l'unicité du nom côté client. */
  existing: Quartier[];
  onOpenChange: (open: boolean) => void;
}) {
  const updateQuartier = useUpdateQuartier(organizationId);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState(QUARTIER_COLOR_PALETTE[0].value);

  React.useEffect(() => {
    if (!quartier) return;
    setName(quartier.name);
    setColor(quartier.color ?? QUARTIER_COLOR_PALETTE[0].value);
    updateQuartier.reset();
  }, [quartier]);

  const trimmed = name.trim();
  const isDuplicate = existing.some(
    (q) => q.id !== quartier?.id && q.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && !isDuplicate && !updateQuartier.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quartier || !canSubmit) return;
    updateQuartier.mutate(
      { id: quartier.id, name: trimmed, color },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  const serverError = updateQuartier.isError
    ? isUniqueViolation(updateQuartier.error)
      ? "Ce nom existe déjà pour cette organisation."
      : "L'enregistrement a échoué. Réessayez."
    : null;

  return (
    <Dialog open={Boolean(quartier)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier le quartier</DialogTitle>
          <DialogDescription>
            Ajustez le nom et la couleur — le contour se remplace en réimportant un GeoJSON.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Nom" htmlFor="quartier-name" required>
            <Input
              id="quartier-name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Centre-ville"
              aria-invalid={isDuplicate || Boolean(serverError)}
            />
            {isDuplicate ? (
              <p className="mt-1.5 text-sm text-destructive">
                Ce nom existe déjà pour cette organisation.
              </p>
            ) : serverError ? (
              <p className="mt-1.5 text-sm text-destructive">{serverError}</p>
            ) : null}
          </Field>

          <Field label="Couleur">
            <ColorSwatches value={color} onChange={setColor} size="h-6 w-6" />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {updateQuartier.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
