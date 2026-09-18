import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/shared/EmptyState";
import { Stepper } from "@/features/procedures/Stepper";
import { PROCEDURE_STEPS } from "@/features/procedures/steps";
import { DescriptifStep, type DescriptifValues } from "@/features/procedures/steps/DescriptifStep";
import { DemandeurStep } from "@/features/procedures/steps/DemandeurStep";
import { FormulaireStep } from "@/features/procedures/steps/FormulaireStep";
import { CommunicationStep } from "@/features/procedures/steps/CommunicationStep";
import {
  UserCommunicationStep,
  type UserCommunicationValues,
} from "@/features/procedures/steps/UserCommunicationStep";
import { KnowledgeBaseStep } from "@/features/procedures/steps/KnowledgeBaseStep";
import { PlaceholderStep } from "@/features/procedures/steps/PlaceholderStep";
import type { RequesterConfig } from "@/features/procedures/requesterFields";
import type { FormSchema } from "@/features/procedures/formSchema";
import type { CommunicationConfig } from "@/features/procedures/communication";
import { isDraftProcedure } from "@/features/procedures/procedureStatus";
import type { KnowledgeBase } from "@/features/procedures/knowledgeBase";
import {
  useProcedure,
  useCreateProcedure,
  useUpdateProcedure,
} from "@/features/procedures/useProcedures";
import type { Json } from "@/types/database.types";

const DESCRIPTIF_FORM_ID = "procedure-descriptif-form";
const DEMANDEUR_FORM_ID = "procedure-demandeur-form";
const FORMULAIRE_FORM_ID = "procedure-formulaire-form";
const USAGER_FORM_ID = "procedure-usager-form";
const COMMUNICATION_FORM_ID = "procedure-communication-form";
const CONNAISSANCES_FORM_ID = "procedure-connaissances-form";
const LAST_STEP = PROCEDURE_STEPS.length - 1;

/** Formulaire soumis depuis le pied de page, par rang d'étape (cf. PROCEDURE_STEPS). */
const STEP_FORM_IDS: readonly string[] = [
  DESCRIPTIF_FORM_ID,
  DEMANDEUR_FORM_ID,
  FORMULAIRE_FORM_ID,
  USAGER_FORM_ID,
  COMMUNICATION_FORM_ID,
  CONNAISSANCES_FORM_ID,
];

export function ProcedureEditor({
  organizationId,
  procedureId,
  initialStep = 0,
  onClose,
  onCreated,
  onStepChange,
}: {
  /** Organisation principale (racine) — requise en création. */
  organizationId?: string;
  procedureId?: string;
  initialStep?: number;
  onClose: () => void;
  onCreated: (newId: string, step: number) => void;
  /** Notifié à chaque changement d'étape (ex. pour refléter l'étape dans l'URL). */
  onStepChange?: (step: number) => void;
}) {
  const isEdit = Boolean(procedureId);
  const { data: procedure, isLoading, isError } = useProcedure(procedureId);
  const createProc = useCreateProcedure();
  const updateProc = useUpdateProcedure();

  // ⚠️ L'étape vient de l'URL (`?step=`) : hors bornes, `PROCEDURE_STEPS[current]` serait
  // `undefined` et l'éditeur planterait. On borne au lieu de faire confiance.
  const [current, setCurrent] = React.useState(() =>
    Math.min(Math.max(Math.trunc(initialStep) || 0, 0), LAST_STEP),
  );
  // Le bouton cliqué décide si l'enregistrement avance le stepper ou non.
  const advanceRef = React.useRef(true);
  const [justSaved, setJustSaved] = React.useState(false);
  const savedTimer = React.useRef<number>();
  React.useEffect(() => () => window.clearTimeout(savedTimer.current), []);
  // Proposition de mise en production, au bout du stepper (voir afterSave).
  const [askProduction, setAskProduction] = React.useState(false);

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

  function goToStep(step: number) {
    setCurrent(step);
    onStepChange?.(step);
  }

  /** Après un enregistrement : avance ou confirme sur place, selon le bouton cliqué. */
  function afterSave() {
    if (advanceRef.current) {
      goToStep(Math.min(current + 1, LAST_STEP));
      return;
    }
    setJustSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setJustSaved(false), 2500);
    // Bout du stepper, démarche encore en brouillon : c'est le moment où la
    // question se pose d'elle-même — le paramétrage vient d'être bouclé.
    if (current === LAST_STEP && isDraftProcedure(procedure?.status)) setAskProduction(true);
  }

  function goToProduction() {
    updateProc.mutate(
      { id: procedureId!, status: "production" },
      { onSuccess: () => setAskProduction(false) },
    );
  }

  function handleDescriptifSubmit(values: DescriptifValues) {
    // Traductions typées de l'app → colonne JSONB générique de Supabase.
    const payload = { ...values, translations: values.translations as unknown as Json };
    if (isEdit) {
      updateProc.mutate({ id: procedureId!, ...payload }, { onSuccess: afterSave });
    } else {
      createProc.mutate(
        { ...payload, organization_id: resolvedOrgId },
        { onSuccess: (data) => onCreated(data.id, advanceRef.current ? 1 : 0) },
      );
    }
  }

  function handleDemandeurSubmit(config: RequesterConfig) {
    // Config typée de l'app → colonne JSONB générique de Supabase.
    updateProc.mutate(
      { id: procedureId!, requester_config: config as unknown as Json },
      { onSuccess: afterSave },
    );
  }

  function handleFormulaireSubmit(schema: FormSchema) {
    updateProc.mutate(
      { id: procedureId!, form_schema: schema as unknown as Json },
      { onSuccess: afterSave },
    );
  }

  /**
   * ⚠️ Seule étape qui écrit une colonne TEXTE en plus de son JSON — et, depuis
   * le 2026-09-18, la traduction de ce texte dans `translations`. Les trois
   * partent dans la MÊME mutation : un descriptif enregistré sans sa FAQ, ou
   * sans sa traduction, laisserait l'agent devant un écran à moitié sauvegardé.
   */
  function handleUsagerSubmit(values: UserCommunicationValues) {
    updateProc.mutate(
      {
        id: procedureId!,
        user_description: values.userDescription,
        user_communication: values.config as unknown as Json,
        translations: values.translations as unknown as Json,
      },
      { onSuccess: afterSave },
    );
  }

  function handleCommunicationSubmit(config: CommunicationConfig) {
    updateProc.mutate(
      { id: procedureId!, communication_config: config as unknown as Json },
      { onSuccess: afterSave },
    );
  }

  function handleConnaissancesSubmit(kb: KnowledgeBase) {
    updateProc.mutate(
      { id: procedureId!, knowledge_base: kb as unknown as Json },
      { onSuccess: afterSave },
    );
  }

  // Chaque étape a un formulaire soumis depuis le pied de page.
  const currentFormId = STEP_FORM_IDS[current] ?? null;

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
          {isDraftProcedure(procedure?.status) && isEdit ? (
            <Badge variant="outline" className="font-medium">
              Brouillon
            </Badge>
          ) : null}
        </div>
        <div className="mt-5">
          <Stepper
            steps={PROCEDURE_STEPS}
            current={current}
            enabledUpTo={enabledUpTo}
            onSelect={goToStep}
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
            ) : current === 3 && procedure ? (
              <UserCommunicationStep
                formId={USAGER_FORM_ID}
                procedure={procedure}
                onSubmit={handleUsagerSubmit}
              />
            ) : current === 4 && procedure ? (
              <CommunicationStep
                formId={COMMUNICATION_FORM_ID}
                procedure={procedure}
                onSubmit={handleCommunicationSubmit}
              />
            ) : current === 5 && procedure ? (
              <KnowledgeBaseStep
                formId={CONNAISSANCES_FORM_ID}
                procedure={procedure}
                onSubmit={handleConnaissancesSubmit}
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
        <div className="flex items-center gap-2">
          {justSaved ? (
            <span role="status" className="mr-1 text-sm text-muted-foreground">
              Enregistré ✓
            </span>
          ) : null}
          <Button
            variant="outline"
            disabled={current === 0}
            onClick={() => goToStep(Math.max(current - 1, 0))}
          >
            Précédent
          </Button>
          {currentFormId ? (
            <>
              <Button
                type="submit"
                form={currentFormId}
                variant={current === LAST_STEP ? "primary" : "outline"}
                disabled={submitting}
                onClick={() => {
                  advanceRef.current = false;
                }}
              >
                {submitting && !advanceRef.current ? "Enregistrement…" : "Enregistrer"}
              </Button>
              {current < LAST_STEP ? (
                <Button
                  type="submit"
                  form={currentFormId}
                  disabled={submitting}
                  onClick={() => {
                    advanceRef.current = true;
                  }}
                >
                  {submitting && advanceRef.current ? "Enregistrement…" : "Enregistrer et continuer"}
                </Button>
              ) : null}
            </>
          ) : current < LAST_STEP ? (
            <Button onClick={() => goToStep(Math.min(current + 1, LAST_STEP))}>Suivant</Button>
          ) : (
            <Button onClick={onClose}>Terminer</Button>
          )}
        </div>
      </div>

      <AlertDialog open={askProduction} onOpenChange={setAskProduction}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Passer la démarche en production ?</AlertDialogTitle>
            <AlertDialogDescription>
              La démarche est actuellement à l'état brouillon. Souhaitez-vous la passer en
              production ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Rester en brouillon</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "primary", size: "md" })}
              disabled={submitting}
              onClick={(e) => {
                // La modale se ferme sur succès (goToProduction), pas au clic :
                // un refus du RLS doit rester visible, pas disparaître avec elle.
                e.preventDefault();
                goToProduction();
              }}
            >
              {submitting ? "Enregistrement…" : "Passer en production"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
