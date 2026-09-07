import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
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
import { languageLabel, translatableLanguages } from "@/features/languages/languages";
import {
  useTranslateLabels,
  type TranslateLabelKind,
  type TranslateLabelsResult,
} from "@/features/languages/useTranslateLabels";
import type { TranslationInput } from "@/features/languages/translations";

/**
 * Saisie du libellé dans chacune des langues activées par la collectivité —
 * partagée par les catégories et par les démarches, pour que les deux écrans
 * disent la même chose de la même façon.
 *
 * Le français n'y figure pas : il est déjà saisi dans le champ « libellé », dont
 * il est la langue. Un champ laissé vide n'est pas une traduction vide, c'est
 * l'absence de traduction — le consommateur retombera sur le français.
 *
 * **Traduction automatique** (bouton « Traduire automatiquement ») :
 *
 * ⚠️ ELLE NE REMPLIT QUE LES CHAMPS VIDES. Une traduction relue par un agent
 * vaut mieux que celle d'un modèle, et rien ne la distingue à l'écran de celle
 * qu'il vient de recevoir : l'écraser en silence lui ferait perdre un travail
 * qu'il ne saurait même pas avoir perdu. Reprendre tout est possible, mais
 * c'est un second geste, et il se confirme.
 *
 * ⚠️ ELLE NE PERSISTE RIEN : la proposition se pose dans les champs, et c'est
 * l'enregistrement de la démarche ou de la catégorie qui l'écrit. L'agent garde
 * le dernier mot sur ce qui sera publié — d'où l'invitation à relire.
 */
export function TranslationFields({
  enabled,
  value,
  onChange,
  idPrefix,
  className,
  organizationId,
  sourceLabel,
  kind,
}: {
  /** Langues activées par l'organisation (français compris). */
  enabled: readonly string[];
  value: TranslationInput;
  onChange: (code: string, name: string) => void;
  /** Préfixe des `id` de champs — deux formulaires peuvent coexister. */
  idPrefix: string;
  className?: string;
  /**
   * Organisation principale de la ligne éditée. Sans elle, pas de traduction
   * automatique : c'est elle qui active les langues et dont le crédit paie.
   */
  organizationId?: string;
  /** Le libellé français à traduire — la langue pivot. */
  sourceLabel: string;
  /** Ce qu'on traduit : le modèle n'écrit pas pareil pour une catégorie. */
  kind: TranslateLabelKind;
}) {
  const codes = translatableLanguages(enabled);
  const translate = useTranslateLabels();
  const [confirmAll, setConfirmAll] = React.useState(false);
  const [result, setResult] = React.useState<TranslateLabelsResult | null>(null);

  const label = sourceLabel.trim();
  const missing = codes.filter((code) => (value[code] ?? "").trim() === "");
  const alreadyFilled = codes.filter((code) => (value[code] ?? "").trim() !== "");
  const ready = Boolean(organizationId) && label !== "" && codes.length > 0;

  function translateInto(targets: string[]) {
    if (!organizationId || targets.length === 0) return;
    setResult(null);
    translate.mutate(
      { organizationId, label, kind, codes: targets },
      {
        onSuccess: (answer) => {
          // Les deux appelants posent leur état par fonction
          // (`setState((current) => …)`) : la boucle compose sans écraser.
          for (const [code, name] of Object.entries(answer.translations)) {
            onChange(code, name);
          }
          setResult(answer);
        },
      },
    );
  }

  const translatedNames = result ? Object.keys(result.translations).map(languageLabel) : [];
  const missingNames = result ? result.missing.map(languageLabel) : [];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Traductions du libellé</h3>
          <p className="text-xs text-muted-foreground">
            {codes.length === 0
              ? "Aucune autre langue n'est activée pour cette organisation — voir « Langues » dans son paramétrage."
              : "Un champ vide laisse le libellé français s'afficher."}
          </p>
        </div>

        {codes.length === 0 ? null : (
          <div className="flex items-center gap-1">
            {missing.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!ready || translate.isPending}
                title={label === "" ? "Saisissez d'abord le libellé français." : undefined}
                onClick={() => translateInto(missing)}
              >
                {translate.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Sparkles aria-hidden />
                )}
                Traduire automatiquement
              </Button>
            ) : null}
            {alreadyFilled.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!ready || translate.isPending}
                title={label === "" ? "Saisissez d'abord le libellé français." : undefined}
                onClick={() => setConfirmAll(true)}
              >
                Tout retraduire
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {codes.length === 0 ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          {codes.map((code) => (
            <Field key={code} label={languageLabel(code)} htmlFor={`${idPrefix}-${code}`}>
              <Input
                id={`${idPrefix}-${code}`}
                lang={code}
                value={value[code] ?? ""}
                onChange={(e) => onChange(code, e.target.value)}
              />
            </Field>
          ))}
        </div>
      )}

      {translate.isPending ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Traduction en cours…
        </p>
      ) : null}

      {translate.isError ? (
        <p className="text-xs text-destructive" role="alert">
          {translate.error instanceof Error
            ? translate.error.message
            : "La traduction automatique a échoué."}
        </p>
      ) : null}

      {result && !translate.isPending && !translate.isError ? (
        <p className="text-xs text-muted-foreground" role="status">
          {translatedNames.length > 0
            ? `Traduit en ${translatedNames.join(", ")} — relisez avant d'enregistrer.`
            : "Aucune traduction n'a pu être proposée."}
          {translatedNames.length > 0 && missingNames.length > 0
            ? ` Aucune proposition pour ${missingNames.join(", ")}.`
            : ""}
        </p>
      ) : null}

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retraduire toutes les langues ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les traductions déjà saisies ({alreadyFilled.map(languageLabel).join(", ")}) seront
              remplacées par celles proposées automatiquement. Rien n'est enregistré tant que vous
              n'avez pas validé le formulaire.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => translateInto(codes)}>
              Tout retraduire
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
