import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { languageLabel, translatableLanguages } from "@/features/languages/languages";
import { TranslationFields } from "@/features/languages/TranslationFields";

type TranslationFieldsProps = React.ComponentProps<typeof TranslationFields>;

/**
 * `TranslationFields` replié sous le texte qu'il traduit — pour un écran qui
 * en porte PLUSIEURS (le descriptif, la note, chaque pièce, chaque question de
 * l'étape « Communication usager »), là où l'étape « Descriptif » n'en a qu'un.
 *
 * ⚠️ RIEN NE S'AFFICHE SI LA COLLECTIVITÉ EST MONOLINGUE (motif
 * `SectionTranslations` du portail) : répéter « aucune autre langue n'est
 * activée » sous chaque question n'apprendrait rien de plus que la première
 * fois — l'étape « Descriptif » le dit déjà, avec le renvoi vers « Langues ».
 *
 * Replié par défaut, ouvert d'emblée si l'entrée porte déjà une traduction :
 * un agent qui revient sur son travail le voit, un agent qui rédige ne le subit
 * pas sous chacune de ses lignes. ⚠️ L'ouverture est un état LOCAL, décidé au
 * montage : la dériver des traductions refermerait le bloc sous les doigts de
 * l'agent au moment où il efface la dernière lettre de la dernière case.
 */
export function TranslationsDisclosure({
  translated,
  className,
  ...fields
}: TranslationFieldsProps & {
  /** Codes des langues déjà traduites — ouvre le bloc et s'affiche dans le résumé. */
  translated: readonly string[];
}) {
  const codes = translatableLanguages(fields.enabled);
  const [open, setOpen] = React.useState(() => translated.length > 0);
  if (codes.length === 0) return null;

  const done = codes.filter((code) => translated.includes(code));

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={cn("group rounded-lg border border-border bg-muted/20 px-3 py-2", className)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold marker:content-none">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        Traductions
        <span className="font-normal text-muted-foreground">
          —{" "}
          {done.length === 0
            ? `${codes.length} ${codes.length > 1 ? "langues" : "langue"}, aucune traduite`
            : `traduit en ${done.map(languageLabel).join(", ")}`}
        </span>
      </summary>
      <div className="pt-3">
        <TranslationFields {...fields} />
      </div>
    </details>
  );
}
