import * as React from "react";
import { UploadCloud, FileText, ExternalLink, Loader2 } from "lucide-react";
import type { KbDocument } from "@/features/procedures/knowledgeBase";
import {
  acceptAttribute,
  validateDocumentFile,
  type DocumentKind,
} from "@/features/procedures/procedureStorage";
import {
  useUploadProcedureDocument,
  useRemoveProcedureDocument,
  createSignedDocumentUrl,
} from "@/features/procedures/useProcedureDocuments";
import { RemoveButton } from "./controls";

/**
 * Section « documents » fonctionnelle : téléversement vers le bucket privé
 * `procedure-documents` (RLS par organisation). Chaque fichier accepté est
 * envoyé immédiatement ; sa référence `{ path, name }` est ajoutée à la liste
 * `value`, persistée dans `procedures.knowledge_base` à l'enregistrement de
 * l'étape. Consultation via URL signée temporaire.
 */
export function DocumentsUploader({
  title,
  description,
  formats,
  maxFiles,
  note,
  organizationId,
  procedureId,
  kind,
  value,
  onChange,
}: {
  title: string;
  description: string;
  formats: readonly string[];
  maxFiles: number;
  note?: string;
  organizationId: string;
  procedureId: string;
  kind: DocumentKind;
  value: KbDocument[];
  onChange: (value: KbDocument[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const upload = useUploadProcedureDocument();
  const remove = useRemoveProcedureDocument();
  const [error, setError] = React.useState<string | null>(null);
  const [pendingPath, setPendingPath] = React.useState<string | null>(null);

  const remaining = maxFiles - value.length;
  const busy = upload.isPending || remove.isPending;

  async function handleFiles(fileList: FileList | null) {
    setError(null);
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;

    if (files.length > remaining) {
      setError(
        remaining <= 0
          ? `Nombre maximum de fichiers atteint (${maxFiles}).`
          : `Il ne reste que ${remaining} emplacement${remaining > 1 ? "s" : ""} sur ${maxFiles}.`,
      );
      return;
    }

    // Validation avant tout envoi : on refuse le lot entier si un fichier est invalide.
    for (const file of files) {
      const message = validateDocumentFile(file, formats);
      if (message) {
        setError(`${file.name} — ${message}`);
        return;
      }
    }

    const added: KbDocument[] = [];
    try {
      for (const file of files) {
        const doc = await upload.mutateAsync({ organizationId, procedureId, kind, file });
        added.push(doc);
      }
      onChange([...value, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec du téléversement.");
      // On conserve ce qui a déjà été envoyé avec succès.
      if (added.length > 0) onChange([...value, ...added]);
    }
  }

  async function handleRemove(doc: KbDocument) {
    setError(null);
    setPendingPath(doc.path);
    try {
      await remove.mutateAsync(doc.path);
    } catch {
      // Suppression best-effort : on retire quand même la référence de la démarche.
    } finally {
      setPendingPath(null);
      onChange(value.filter((d) => d.path !== doc.path));
    }
  }

  async function handleView(doc: KbDocument) {
    setError(null);
    try {
      const url = await createSignedDocumentUrl(doc.path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d'ouvrir le document.");
    }
  }

  const canAdd = remaining > 0 && !busy;

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">
          {value.length} / {maxFiles}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      {value.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {value.map((doc) => (
            <li
              key={doc.path}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <button
                type="button"
                onClick={() => handleView(doc)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm hover:text-primary hover:underline"
                title="Ouvrir le document"
              >
                <span className="truncate">{doc.name}</span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
              {pendingPath === doc.path ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <RemoveButton onClick={() => handleRemove(doc)} label={`Retirer ${doc.name}`} />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={!canAdd}
        className="mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/50 py-6 text-center transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {upload.isPending ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        ) : (
          <UploadCloud className="size-6 text-muted-foreground" />
        )}
        <span className="max-w-sm text-xs text-muted-foreground">
          {upload.isPending
            ? "Téléversement en cours…"
            : remaining > 0
              ? `Cliquez pour ajouter un fichier (${remaining} restant${remaining > 1 ? "s" : ""}).`
              : `Nombre maximum de fichiers atteint (${maxFiles}).`}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple={maxFiles > 1}
        accept={acceptAttribute(formats)}
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

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

      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
