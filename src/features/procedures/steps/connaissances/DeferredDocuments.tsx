import { UploadCloud } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Section « documents » en attente de l'infrastructure de stockage : dropzone
 * désactivée + formats indicatifs. Le vrai téléversement sera branché plus tard
 * (le schéma réserve déjà les tableaux `agentDocuments` / `trainingDocuments`).
 */
export function DeferredDocuments({
  title,
  description,
  formats,
  maxFiles,
  note,
}: {
  title: string;
  description: string;
  formats: readonly string[];
  maxFiles: number;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant="muted">Bientôt disponible</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      <div className="mt-3 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/50 py-6 text-center opacity-60">
        <UploadCloud className="size-6 text-muted-foreground" />
        <p className="max-w-sm text-xs text-muted-foreground">
          Le téléversement de fichiers sera activé prochainement (jusqu'à {maxFiles} fichiers).
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {formats.map((format) => (
          <span
            key={format}
            className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium uppercase text-muted-foreground"
          >
            {format}
          </span>
        ))}
      </div>

      {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
