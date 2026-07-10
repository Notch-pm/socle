import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Stepper } from "@/features/procedures/Stepper";
import { PROCEDURE_STEPS } from "@/features/procedures/steps";
import { DescriptifStep, type DescriptifValues } from "@/features/procedures/steps/DescriptifStep";
import { DemandeurStep } from "@/features/procedures/steps/DemandeurStep";
import { FormulaireStep } from "@/features/procedures/steps/FormulaireStep";
import { PlaceholderStep } from "@/features/procedures/steps/PlaceholderStep";
import type { RequesterConfig } from "@/features/procedures/requesterFields";
import type { FormSchema } from "@/features/procedures/formSchema";
import {
  useProcedure,
  useCreateProcedure,
  useUpdateProcedure,
} from "@/features/procedures/useProcedures";
import type { Json } from "@/types/database.types";

const DESCRIPTIF_FORM_ID = "procedure-descriptif-form";
const DEMANDEUR_FORM_ID = "procedure-demandeur-form";
const FORMULAIRE_FORM_ID = "procedure-formulaire-form";
const LAST_STEP = PROCEDURE_STEPS.length - 1;

export function ProcedureEditor({
  organizationId,
  procedureId,
  initialStep = 0,
  onClose,
  onCreated,
}: {
  /** Organisation principale (racine) — requise en création. */
  organizationId?: string;
  procedureId?: string;
  initialStep?: number;
  onClose: () => void;
  onCreated: (newId: string) => void;
}) {
  const isEdit = Boolean(procedureId);
  const { data: procedure, isLoading, isError } = useProcedure(procedureId);
  const createProc = useCreateProcedure();
  const updateProc = useUpdateProcedure();

  const [current, setCurrent] = React.useState(initialStep);

  if (procedureId && isLoading) {
    return <div className="m-6 h-40 animate-pulse rounded-lg bg-muted/40" />;
  }
  if (procedureId && (isError || !procedure)) {
    return <div className="p-6"><EmptyState message="Démarche introuvable." /></div>;
  }

  const resolvedOrgId = organizationId ?? procedure?.organization_id ?? undefined;
  if (!resolvedOrgId) {
    return (
      <div className="p-6">
        <EmptyState message="Organisation principale manquante pour créer une démarche." />
      </div>
    );
  }

  const enabledUpTo = isEdit ? LAST_STEP : 0;
  const submitting = createProc.isPending || updateProc.isPending;
  const error = (createProc.error || updateProc.error) as Error | null;

  function handleDescriptifSubmit(values: DescriptifValues) {
    if (isEdit) {
      updateProc.mutate(
        { id: procedureId!, ...values },
        { onSuccess: () => setCurrent((c) => Math.min(c + 1, LAST_STEP)) },
      );
    } else {
      createProc.mutate(
        { ...values, organization_id: resolvedOrgId },
        { onSuccess: (data) => onCreated(data.id) },
      );
    }
  }

  function handleDemandeurSubmit(config: RequesterConfig) {
    // Config typée de l'app → colonne JSONB générique de Supabase.
    updateProc.mutate(
      { id: procedureId!, requester_config: config as unknown as Json },
      { onSuccess: () => setCurrent((c) => Math.min(c + 1, LAST_STEP)) },
    );
  }

  function handleFormulaireSubmit(schema: FormSchema) {
    updateProc.mutate(
      { id: procedureId!, form_schema: schema as unknown as Json },
      { onSuccess: () => setCurrent((c) => Math.min(c + 1, LAST_STEP)) },
    );
  }

  // Étapes fonctionnelles : chacune a un formulaire soumis depuis le pied de page.
  const currentFormId =
    current === 0
      ? DESCRIPTIF_FORM_ID
      : current === 1
        ? DEMANDEUR_FORM_ID
        : current === 2
          ? FORMULAIRE_FORM_ID
          : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* En-tête fixe : titre + stepper */}
      <div className="shrink-0 border-b border-border bg-background px-6 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Retour" onClick={onClose}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? "Modifier la démarche" : "Nouvelle démarche"}
          </h1>
        </div>
        <div className="mt-5">
          <Stepper
            steps={PROCEDURE_STEPS}
            current={current}
            enabledUpTo={enabledUpTo}
            onSelect={setCurrent}
          />
        </div>
      </div>

      {/* Zone scrollable : formulaire de l'étape */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {error ? (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            {error.message}
          </p>
        ) : null}

        <Card>
          <CardContent className="p-6">
            {current === 0 ? (
              <DescriptifStep
                formId={DESCRIPTIF_FORM_ID}
                organizationId={resolvedOrgId}
                procedure={procedure ?? null}
                onSubmit={handleDescriptifSubmit}
              />
            ) : current === 1 && procedure ? (
              <DemandeurStep
                formId={DEMANDEUR_FORM_ID}
                procedure={procedure}
                onSubmit={handleDemandeurSubmit}
              />
            ) : current === 2 && procedure ? (
              <FormulaireStep
                formId={FORMULAIRE_FORM_ID}
                procedure={procedure}
                onSubmit={handleFormulaireSubmit}
              />
            ) : (
              <PlaceholderStep label={PROCEDURE_STEPS[current].label} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pied fixe : navigation */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-background px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={current === 0}
            onClick={() => setCurrent((c) => Math.max(c - 1, 0))}
          >
            Précédent
          </Button>
          {currentFormId ? (
            <Button type="submit" form={currentFormId} disabled={submitting}>
              {submitting ? "Enregistrement…" : "Enregistrer et continuer"}
            </Button>
          ) : current < LAST_STEP ? (
            <Button onClick={() => setCurrent((c) => Math.min(c + 1, LAST_STEP))}>Suivant</Button>
          ) : (
            <Button onClick={onClose}>Terminer</Button>
          )}
        </div>
      </div>
    </div>
  );
}
