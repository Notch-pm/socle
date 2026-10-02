import * as React from "react";
import { Copy, Check, KeyRound, TriangleAlert, Globe } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useCreateApiKey, type ApiKeyOwner } from "@/features/superadmin/organizations/useApiKeys";
import { useApplications } from "@/features/superadmin/applications/useApplications";

/** Accès attribuables à une clé (colonne `api_keys.scopes`). */
const SCOPE_OPTIONS = [
  {
    scope: "read",
    label: "Référentiel (lecture)",
    description: "Organisations, démarches, catégories, types de pièce — API public-api.",
  },
  {
    scope: "contacts",
    label: "Usagers (lecture + écriture)",
    description: "Référentiel des usagers (données personnelles) — API contacts-api.",
  },
  {
    scope: "smtp",
    label: "Serveur d'envoi (identifiants)",
    description:
      "Relais SMTP de l'organisation principale, mot de passe compris — à ne cocher que pour "
      + "une application de la gamme qui expédie les mails de la collectivité (Iris…).",
  },
  {
    scope: "integrations",
    label: "Intégrations partenaires (identifiants)",
    description:
      "Configuration des intégrations de l'organisation principale (Arpège…), secrets compris — "
      + "à ne cocher que pour l'application de la gamme qui exécute l'intégration (Clara…).",
  },
  {
    scope: "ai",
    label: "Assistant IA (jetons facturés)",
    description:
      "Appels au fournisseur LLM par le Socle, décomptés du plafond de la collectivité — "
      + "à ne cocher que pour une application de la gamme (Iris, Clara…), jamais pour un "
      + "partenaire. Exige de nommer l'application, pour que la dépense soit imputable.",
  },
  {
    scope: "audience",
    label: "Audience du portail (écriture)",
    description:
      "Compteurs de fréquentation du site de démarches — API audience-api. À ne cocher que "
      + "pour le portail usagers (Nora), le seul qui voie les pages s'afficher. Écriture "
      + "seule : elle ne permet de lire aucun chiffre.",
  },
] as const;

/** Scope dont la dépense est facturée : il exige une application imputable. */
export const BILLED_SCOPE = "ai";

export const CONSUMER_HINT =
  "Une clé = une application. Partagée entre deux produits, la ventilation de la consommation s'effondre en un seul seau.";

/** Libellé de la case d'assentiment exigée pour créer une clé plateforme. */
export const PLATFORM_ACK_LABEL =
  "Je comprends que cette clé verra toutes les collectivités abonnées à cette application.";

/**
 * Création d'une clé API. Deux temps : (1) formulaire (nom + accès + application
 * + expiration facultative) ; (2) révélation **unique** du secret (copiable),
 * qui ne sera plus jamais affiché.
 *
 * `owner = null` crée une **clé plateforme** : rattachée à une application du
 * registre, elle voit les collectivités ABONNÉES à cette application — et
 * seulement elles. Le dialogue exige l'application et une case d'assentiment.
 * Sur une clé LIÉE à une racine, l'application n'est demandée que pour le
 * scope facturé (la dépense s'impute).
 */
export function ApiKeyFormDialog({
  open,
  onOpenChange,
  owner,
  createdBy,
  application,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: ApiKeyOwner;
  createdBy: string | null | undefined;
  /** Application pré-liée (page des applications) : le sélecteur est verrouillé. */
  application?: string;
}) {
  const isPlatform = owner === null;
  const createKey = useCreateApiKey(owner, createdBy);
  const { data: applications } = useApplications();

  const [name, setName] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>(["read"]);
  const [consumer, setConsumer] = React.useState(application ?? "");
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Réinitialise tout à chaque ouverture/fermeture.
  React.useEffect(() => {
    if (open) {
      setName("");
      setExpiresAt("");
      setScopes(["read"]);
      setConsumer(application ?? "");
      setAcknowledged(false);
      setSecret(null);
      setCopied(false);
      createKey.reset();
    }
  }, [open, application]); // eslint-disable-line react-hooks/exhaustive-deps

  const trimmed = name.trim();
  // Le scope facturé exige une application imputable : sans elle, `ai-api`
  // refuserait la clé à l'usage (403). Une clé plateforme l'exige toujours :
  // c'est l'application qui borne son périmètre.
  const billed = scopes.includes(BILLED_SCOPE);
  const applicationRequired = isPlatform || billed;
  const consumerValid = consumer !== "";
  const canSubmit =
    trimmed.length > 0 &&
    scopes.length > 0 &&
    (!applicationRequired || consumerValid) &&
    !createKey.isPending &&
    (!isPlatform || acknowledged);

  function toggleScope(scope: string, enabled: boolean) {
    setScopes((prev) => (enabled ? [...prev, scope] : prev.filter((s) => s !== scope)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // Expiration : fin de journée locale de la date saisie, sinon pas d'expiration.
    const expiresIso = expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null;
    createKey.mutate(
      {
        name: trimmed,
        expiresAt: expiresIso,
        scopes,
        consumer: applicationRequired ? consumer : null,
      },
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

  let title: string;
  let description: string;
  if (secret) {
    title = isPlatform ? "Clé plateforme créée" : "Clé API créée";
    description = "Copiez cette clé maintenant : elle ne sera plus jamais affichée.";
  } else if (isPlatform) {
    title = "Nouvelle clé plateforme";
    description =
      "Génère la clé d'une application de la gamme : son périmètre est l'ensemble des collectivités abonnées à cette application.";
  } else {
    title = "Nouvelle clé API";
    description = "Génère une clé d'accès aux API pour cette organisation et sa descendance.";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPlatform ? <Globe className="size-5" /> : <KeyRound className="size-5" />}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
            {isPlatform ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p>
                  <strong>Clé d'application.</strong> Cette clé lira{" "}
                  <strong>toutes les collectivités abonnées</strong> à l'application choisie, tous
                  clients confondus — et, avec l'accès « Usagers », leurs référentiels d'usagers.
                  Réservez-la à une application de la gamme ; pour un partenaire ou un client,
                  créez la clé depuis la page de son organisation.
                </p>
              </div>
            ) : null}
            <Field label="Nom" htmlFor="api-key-name">
              <Input
                id="api-key-name"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isPlatform ? "Ex. Clara — production" : "Ex. Partenaire X — production"}
              />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Accès de la clé</legend>
              {SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.scope}
                  className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </span>
                  <Switch
                    checked={scopes.includes(option.scope)}
                    onCheckedChange={(checked) => toggleScope(option.scope, checked)}
                    aria-label={option.label}
                  />
                </label>
              ))}
              {scopes.length === 0 ? (
                <p className="text-xs text-destructive">Sélectionnez au moins un accès.</p>
              ) : null}
            </fieldset>
            {applicationRequired ? (
              <Field label="Application" htmlFor="api-key-consumer">
                <select
                  id="api-key-consumer"
                  value={consumer}
                  disabled={Boolean(application)}
                  onChange={(e) => setConsumer(e.target.value)}
                  aria-describedby="api-key-consumer-hint"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Choisir une application…</option>
                  {(applications ?? []).map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </select>
                <p id="api-key-consumer-hint" className="text-xs text-muted-foreground">
                  {CONSUMER_HINT}
                  {isPlatform ? " Le périmètre de la clé est celui de l'application." : ""}
                </p>
              </Field>
            ) : null}
            <Field label="Expiration (facultatif)" htmlFor="api-key-expires">
              <Input
                id="api-key-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </Field>
            {isPlatform ? (
              <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-destructive/40 p-3">
                <span className="text-sm font-medium">{PLATFORM_ACK_LABEL}</span>
                <Switch
                  checked={acknowledged}
                  onCheckedChange={setAcknowledged}
                  aria-label={PLATFORM_ACK_LABEL}
                />
              </label>
            ) : null}
            {createKey.isError ? (
              <p className="text-sm text-destructive">{(createKey.error as Error).message}</p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {createKey.isPending
                  ? "Création…"
                  : isPlatform
                    ? "Créer la clé plateforme"
                    : "Créer la clé"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
