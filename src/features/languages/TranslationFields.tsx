import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { languageLabel, translatableLanguages } from "@/features/languages/languages";
import type { TranslationInput } from "@/features/languages/translations";

/**
 * Saisie du libellé dans chacune des langues activées par la collectivité —
 * partagée par les catégories et par les démarches, pour que les deux écrans
 * disent la même chose de la même façon.
 *
 * Le français n'y figure pas : il est déjà saisi dans le champ « libellé », dont
 * il est la langue. Un champ laissé vide n'est pas une traduction vide, c'est
 * l'absence de traduction — le consommateur retombera sur le français.
 */
export function TranslationFields({
  enabled,
  value,
  onChange,
  idPrefix,
  className,
}: {
  /** Langues activées par l'organisation principale (français compris). */
  enabled: readonly string[];
  value: TranslationInput;
  onChange: (code: string, name: string) => void;
  /** Préfixe des `id` de champs — deux formulaires peuvent coexister. */
  idPrefix: string;
  className?: string;
}) {
  const codes = translatableLanguages(enabled);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div>
        <h3 className="text-sm font-semibold">Traductions du libellé</h3>
        <p className="text-xs text-muted-foreground">
          {codes.length === 0
            ? "Aucune autre langue n'est activée pour cette organisation — voir « Langues » dans son paramétrage."
            : "Un champ vide laisse le libellé français s'afficher."}
        </p>
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
    </div>
  );
}
