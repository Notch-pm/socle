import { languageLabel } from "@/features/languages/languages";
import { translatedLanguageCodes } from "@/features/languages/translations";
import { cn } from "@/lib/utils";

/**
 * Langues dans lesquelles un libellé est traduit — l'agent voit d'un coup d'œil
 * ce qui reste à faire, sans ouvrir chaque ligne. Rien à afficher quand rien
 * n'est traduit : une colonne vide sur tout un catalogue monolingue ne dirait
 * rien à personne.
 */
export function TranslatedIn({
  translations,
  className,
}: {
  translations: unknown;
  className?: string;
}) {
  const codes = translatedLanguageCodes(translations);
  if (codes.length === 0) return null;
  return (
    <span
      className={cn("font-mono text-xs uppercase text-muted-foreground", className)}
      title={`Traduit en ${codes.map(languageLabel).join(", ")}`}
    >
      {codes.join(" · ")}
    </span>
  );
}
