import * as React from "react";
import { Copy, Check, KeyRound, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useCreateApiKey } from "@/features/superadmin/organizations/useApiKeys";

/**
 * Création d'une clé API. Deux temps : (1) formulaire (nom + expiration
 * facultative) ; (2) révélation **unique** du secret (copiable), qui ne sera
 * plus jamais affiché.
 */
export function ApiKeyFormDialog({
  open,
  onOpenChange,
  organizationId,
  createdBy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  createdBy: string | null | undefined;
}) {
  const createKey = useCreateApiKey(organizationId, createdBy);

  const [name, setName] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [secret, setSecret] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Réinitialise tout à chaque ouverture/fermeture.
  React.useEffect(() => {
    if (open) {
      setName("");
      setExpiresAt("");
      setSecret(null);
      setCopied(false);
      createKey.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !createKey.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // Expiration : fin de journée locale de la date saisie, sinon pas d'expiration.
    const expiresIso = expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null;
    createKey.mutate(
      { name: trimmed, expiresAt: expiresIso },
      { onSuccess: (createdSecret) => setSecret(createdSecret) },
    );
  }

  async function handleCopy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : l'utilisateur peut sélectionner le champ manuellement.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            {secret ? "Clé API créée" : "Nouvelle clé API"}
          </DialogTitle>
          <DialogDescription>
            {secret
              ? "Copiez cette clé maintenant : elle ne sera plus jamais affichée."
              : "Génère une clé de lecture seule pour cette organisation et sa descendance."}
          </DialogDescription>
        </DialogHeader>

        {secret ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                Conservez cette clé en lieu sûr (secret serveur). Si vous la perdez, révoquez-la
                et créez-en une nouvelle.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input readOnly value={secret} className="font-mono text-xs" aria-label="Clé API" />
              <Button type="button" variant="outline" size="icon" onClick={handleCopy} aria-label="Copier la clé">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Terminé
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Nom" htmlFor="api-key-name">
              <Input
                id="api-key-name"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Clara — production"
              />
            </Field>
            <Field label="Expiration (facultatif)" htmlFor="api-key-expires">
              <Input
                id="api-key-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </Field>
            {createKey.isError ? (
              <p className="text-sm text-destructive">{(createKey.error as Error).message}</p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {createKey.isPending ? "Création…" : "Créer la clé"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
