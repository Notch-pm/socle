import * as React from "react";
import { Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DOCUMENT_VARIABLE_GROUPS,
  variableToken,
  type DocumentVariable,
} from "@/features/documents/documentVariables";

/** Bouton de copie qui confirme sur place, sans dépendre d'un système de toast. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Presse-papiers indisponible (permission, contexte non sécurisé) : le
      // jeton reste affiché et sélectionnable à la main, rien n'est perdu.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label}
      aria-label={label}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
    </button>
  );
}

function VariableRow({ variable, token }: { variable: DocumentVariable; token: string }) {
  return (
    <li className="flex items-center gap-3 border-t border-border px-3 py-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{variable.title}</p>
        {variable.hint ? (
          <p className="text-xs text-muted-foreground">{variable.hint}</p>
        ) : null}
      </div>
      <code className="shrink-0 rounded bg-muted px-2 py-1 text-xs">{token}</code>
      <CopyButton text={token} label={`Copier ${token}`} />
    </li>
  );
}

/**
 * Liste des variables utilisables dans les documents, avec leur titre et le
 * jeton à recopier. Ouverte depuis la liste des documents : c'est là que
 * l'agent en a besoin, au moment de préparer son fichier.
 */
export function VariablesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Variables disponibles</DialogTitle>
          <DialogDescription>
            Recopiez le jeton tel quel dans votre fichier Word ou LibreOffice, accolades
            comprises. Il sera remplacé par la valeur du dossier au moment de produire le
            document.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {DOCUMENT_VARIABLE_GROUPS.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <div>
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>

              <ul className="overflow-hidden rounded-lg border border-border">
                {group.variables.map((variable) => (
                  <VariableRow
                    key={variable.key}
                    variable={variable}
                    token={variableToken(variable.key)}
                  />
                ))}
              </ul>

              {group.loops?.map((loop) => (
                <div
                  key={loop.key}
                  className={cn("rounded-lg border border-dashed border-border p-3")}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{loop.title}</p>
                      {loop.hint ? (
                        <p className="text-xs text-muted-foreground">{loop.hint}</p>
                      ) : null}
                    </div>
                    <CopyButton text={loop.sample} label={`Copier le bloc ${loop.key}`} />
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                    {loop.sample}
                  </pre>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
