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
import type { AnyTranslatableField, TranslationInput } from "@/features/languages/translations";

/** Un texte français à traduire, et la clé qu'il porte dans `translations`. */
export interface TranslationFieldSpec {
  key: AnyTranslatableField;
  /** Étiquette affichée — « Libellé », « Descriptif court ». */
  label: string;
  /** Le texte français, tel qu'il est en train d'être saisi au-dessus. */
  source: string;
  /** Un résumé se saisit sur plusieurs lignes, un intitulé non. */
  multiline?: boolean;
}

/**
 * Les champs de traduction d'une ligne — un par langue **activée par
 * l'organisation principale**, moins le français.
 *
 * Le français n'y figure pas : il est déjà saisi dans les champs du dessus,
 * dont il est la langue. Un champ laissé vide n'est pas une traduction vide,
 * c'est l'absence de traduction — le consommateur retombera sur le français.
 *
 * Plusieurs textes peuvent être traduits pour une même ligne (`fields`) : une
 * démarche y met son libellé ET son descriptif court, une catégorie son seul
 * libellé. Chaque case est indépendante — une langue peut porter le libellé
 * sans le descriptif, et c'est le cas normal, pas une anomalie.
 *
 * **Traduction automatique** (bouton « Traduire automatiquement ») :
 *
 * ⚠️ ELLE NE REMPLIT QUE LES CASES VIDES, champ par champ et langue par langue.
 * Une traduction relue par un agent vaut mieux que celle d'un modèle, et rien
 * ne la distingue à l'écran de celle qu'il vient de recevoir : l'écraser en
 * silence lui ferait perdre un travail qu'il ne saurait même pas avoir perdu.
 * Reprendre tout est possible, mais c'est un second geste, et il se confirme.
 *
 * ⚠️ ELLE NE PERSISTE RIEN : la proposition se pose dans les champs, et c'est
 * l'enregistrement de la démarche ou de la catégorie qui l'écrit. L'agent garde
 * le dernier mot sur ce qui sera publié — d'où l'invitation à relire.
 */
export function TranslationFields({
  enabled,
  value,
  onChange,
  onApply,
  idPrefix,
  className,
  organizationId,
  fields,
  kind,
  reviewHint,
  overwriteHint,
  dense = false,
}: {
  /** Langues activées par l'organisation (français compris). */
  enabled: readonly string[];
  value: TranslationInput<AnyTranslatableField>;
  /** Une frappe dans une case. */
  onChange: (code: string, field: AnyTranslatableField, value: string) => void;
  /**
   * Une réponse de traduction, appliquée EN UNE FOIS.
   *
   * ⚠️ ELLE NE PEUT PAS PASSER PAR `onChange` case par case. Un appelant qui
   * possède un objet plus gros (la page composée, par exemple) repart de l'état
   * de son rendu à chaque appel : trois cases écrites dans le même tick, et
   * seule la dernière survit. Une réponse est donc un seul geste, et l'appelant
   * n'a qu'un seul état à composer.
   */
  onApply: (patch: Record<string, Partial<Record<AnyTranslatableField, string>>>) => void;
  /** Préfixe des `id` de champs — deux formulaires peuvent coexister. */
  idPrefix: string;
  className?: string;
  /**
   * Organisation principale de la ligne éditée. Sans elle, pas de traduction
   * automatique : c'est elle qui active les langues et dont le crédit paie.
   */
  organizationId?: string;
  /** Les textes français traduisibles, dans l'ordre d'affichage. */
  fields: readonly TranslationFieldSpec[];
  /** Ce qu'on traduit : le modèle n'écrit pas pareil pour une catégorie. */
  kind: TranslateLabelKind;
  /**
   * Ce qu'il reste à faire pour que la proposition existe vraiment.
   *
   * ⚠️ CE N'EST PAS UN DÉTAIL DE FORMULATION. Le défaut dit « enregistrer »,
   * ce qui est vrai d'un formulaire qu'on valide — et FAUX dans l'éditeur du
   * portail, où le brouillon s'enregistre tout seul et où le dernier mot est
   * « Publier ». Une phrase qui décrit un geste que l'écran ne propose pas
   * apprend à ne plus lire les phrases.
   */
  reviewHint?: string;
  /** Même raison, pour la confirmation de « Tout retraduire ». */
  overwriteHint?: string;
  /**
   * Mise en page pour une COLONNE ÉTROITE (l'inspecteur de l'éditeur fait
   * 306 px, marges comprises), et non pour la largeur d'un formulaire.
   *
   * ⚠️ Ce n'est pas un réglage de goût : sans lui, les deux boutons se posent
   * côte à côte (~330 px à eux deux) et la grille passe à deux colonnes — le
   * point de rupture `sm:` regarde la fenêtre, pas le conteneur. Les deux
   * débordent du panneau.
   */
  dense?: boolean;
}) {
  const codes = translatableLanguages(enabled);
  const review = reviewHint ?? "relisez avant d'enregistrer.";
  const overwrite = overwriteHint
    ?? "Rien n'est enregistré tant que vous n'avez pas validé le formulaire.";
  const translate = useTranslateLabels();
  const [confirmAll, setConfirmAll] = React.useState(false);
  const [result, setResult] = React.useState<TranslateLabelsResult | null>(null);

  // La saisie AU MOMENT OÙ LA RÉPONSE ARRIVE, pas au moment du clic : un agent
  // qui traduit une case à la main pendant l'appel ne doit pas la voir écrasée
  // par la proposition qui revient.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  const isEmpty = (code: string, field: AnyTranslatableField) =>
    (valueRef.current[code]?.[field] ?? "").trim() === "";

  // Un texte français vide n'a rien à faire traduire — et rien à faire payer.
  const translatable = fields
    .map((field) => ({ ...field, source: field.source.trim() }))
    .filter((field) => field.source !== "");

  const missingFields = translatable.filter((field) =>
    codes.some((code) => isEmpty(code, field.key)),
  );
  const missingCodes = codes.filter((code) =>
    translatable.some((field) => isEmpty(code, field.key)),
  );
  const filledCodes = codes.filter((code) => fields.some((field) => !isEmpty(code, field.key)));
  const ready = Boolean(organizationId) && translatable.length > 0 && codes.length > 0;
  const noSource = translatable.length === 0 ? "Saisissez d'abord le texte français." : undefined;
  // Tant qu'aucun texte français n'est saisi, le bouton reste AFFICHÉ mais
  // désactivé : le faire disparaître laisserait croire que la traduction
  // automatique n'existe pas sur cet écran, au lieu de dire ce qui manque.
  const canFill = missingFields.length > 0;

  /**
   * `vides` ne demande que ce qui manque (les textes encore absents quelque
   * part, les langues encore incomplètes) ; `tout` demande tout ce qui est
   * traduisible. Dans les deux cas, l'application de la réponse est gardée
   * case par case juste en dessous.
   */
  function translateInto(mode: "vides" | "tout") {
    const askedFields = mode === "tout" ? translatable : missingFields;
    const askedCodes = mode === "tout" ? codes : missingCodes;
    if (!organizationId || askedFields.length === 0 || askedCodes.length === 0) return;
    setResult(null);
    translate.mutate(
      {
        organizationId,
        kind,
        codes: askedCodes,
        fields: askedFields.map((field) => ({ key: field.key, value: field.source })),
      },
      {
        onSuccess: (answer) => {
          // On compose la proposition ENTIÈRE, puis on l'applique d'un geste :
          // voir `onApply`. La garde « on ne remplit que le vide » se fait ici,
          // case par case, sur la saisie la plus récente.
          const patch: Record<string, Partial<Record<AnyTranslatableField, string>>> = {};
          for (const [code, entry] of Object.entries(answer.translations)) {
            for (const field of askedFields) {
              const proposal = entry[field.key];
              if (!proposal) continue;
              if (mode === "vides" && !isEmpty(code, field.key)) continue;
              patch[code] = { ...patch[code], [field.key]: proposal };
            }
          }
          if (Object.keys(patch).length > 0) onApply(patch);
          setResult(answer);
        },
      },
    );
  }

  const translatedNames = result ? Object.keys(result.translations).map(languageLabel) : [];
  const missingNames = result ? result.missing.map(languageLabel) : [];
  const single = fields.length === 1 ? fields[0] : null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-2",
          dense && "flex-col items-stretch",
        )}
      >
        <div>
          <h3 className="text-sm font-semibold">Traductions</h3>
          <p className="text-xs text-muted-foreground">
            {codes.length === 0
              ? "Aucune autre langue n'est activée pour cette organisation — voir « Langues » dans son paramétrage."
              : "Un champ vide laisse le texte français s'afficher."}
          </p>
        </div>

        {codes.length === 0 ? null : (
          <div className={cn("flex items-center gap-1", dense && "flex-wrap")}>
            {canFill || translatable.length === 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!ready || !canFill || translate.isPending}
                title={noSource}
                onClick={() => translateInto("vides")}
              >
                {translate.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Sparkles aria-hidden />
                )}
                Traduire automatiquement
              </Button>
            ) : null}
            {filledCodes.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!ready || translate.isPending}
                title={noSource}
                onClick={() => setConfirmAll(true)}
              >
                Tout retraduire
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {codes.length === 0 ? null : (
        <div className={cn("grid gap-4", dense ? "grid-cols-1" : "sm:grid-cols-2")}>
          {codes.map((code) =>
            // Un seul texte traduisible : le nom de la langue EST son étiquette.
            // Encadrer un champ unique n'ajouterait qu'une boîte.
            single ? (
              <Field key={code} label={languageLabel(code)} htmlFor={`${idPrefix}-${code}`}>
                <TranslationControl
                  id={`${idPrefix}-${code}`}
                  code={code}
                  field={single}
                  value={value[code]?.[single.key] ?? ""}
                  onChange={(next) => onChange(code, single.key, next)}
                />
              </Field>
            ) : (
              <fieldset
                key={code}
                className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3"
              >
                <legend className="px-1 text-xs font-semibold">{languageLabel(code)}</legend>
                {fields.map((field) => (
                  <Field
                    key={field.key}
                    label={field.label}
                    htmlFor={`${idPrefix}-${code}-${field.key}`}
                  >
                    <TranslationControl
                      id={`${idPrefix}-${code}-${field.key}`}
                      code={code}
                      field={field}
                      value={value[code]?.[field.key] ?? ""}
                      onChange={(next) => onChange(code, field.key, next)}
                    />
                  </Field>
                ))}
              </fieldset>
            ),
          )}
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
            ? `Traduit en ${translatedNames.join(", ")} — ${review}`
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
              Les traductions déjà saisies ({filledCodes.map(languageLabel).join(", ")}) seront
              remplacées par celles proposées automatiquement. {overwrite}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => translateInto("tout")}>
              Tout retraduire
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * La case de saisie : une ligne, ou un pavé quand le texte en est un.
 *
 * Le texte français est en filigrane (`placeholder`) : c'est exactement ce que
 * le visiteur lira si la case reste vide. Le repli cesse d'être une règle à
 * connaître pour devenir quelque chose qu'on voit.
 */
function TranslationControl({
  id,
  code,
  field,
  value,
  onChange,
}: {
  id: string;
  code: string;
  field: TranslationFieldSpec;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.multiline) {
    return (
      <textarea
        id={id}
        lang={code}
        rows={3}
        placeholder={field.source}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    );
  }
  return (
    <Input
      id={id}
      lang={code}
      value={value}
      placeholder={field.source}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
