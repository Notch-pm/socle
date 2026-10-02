import * as React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { IntegrationCard } from "@/features/integrations/IntegrationCard";
import { IntegrationGrid } from "@/features/integrations/IntegrationGrid";
import { catalogueStatus } from "@/features/integrations/integrationStatus";
import {
  useIntegrationTypes,
  useIntegrationsCatalogue,
  useUpdateIntegration,
  type CatalogueIntegration,
} from "@/features/integrations/useIntegrations";

const HTTPS_URL_RE = /^https:\/\/\S+$/;

/**
 * Le catalogue des intégrations partenaires — ce que propose Edilumen, par
 * type de connexion. Aucune donnée de collectivité ici : chaque client se
 * configure depuis sa fiche (section « Intégrations »).
 */
export function IntegrationsCataloguePage() {
  const { data: types, isLoading: typesLoading } = useIntegrationTypes();
  const { data: integrations, isLoading } = useIntegrationsCatalogue();
  const [editing, setEditing] = React.useState<CatalogueIntegration | null>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Intégrations</h1>
        <p className="text-muted-foreground">
          Les partenaires auxquels les applications de la gamme savent se connecter. Chaque
          collectivité se configure depuis sa fiche, section « Intégrations ».
        </p>
      </div>

      {isLoading || typesLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      ) : (
        <IntegrationGrid
          types={types ?? []}
          integrations={integrations ?? []}
          showEmptyTypes
          renderCard={(integration) => (
            <IntegrationCard
              integration={integration}
              status={catalogueStatus(integration)}
              action={
                <Button variant="outline" size="sm" onClick={() => setEditing(integration)}>
                  <Pencil className="size-4" />
                  Modifier
                </Button>
              }
            />
          )}
        />
      )}

      {editing ? (
        <EditIntegrationDialog integration={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

/** Présentation d'une fiche du catalogue : description, logo, disponibilité. */
function EditIntegrationDialog({
  integration,
  onClose,
}: {
  integration: CatalogueIntegration;
  onClose: () => void;
}) {
  const update = useUpdateIntegration();
  const [description, setDescription] = React.useState(integration.description);
  const [logoUrl, setLogoUrl] = React.useState(integration.logo_url ?? "");
  const [available, setAvailable] = React.useState(integration.is_available);

  const logoValue = logoUrl.trim();
  const logoValid = logoValue === "" || HTTPS_URL_RE.test(logoValue);
  const canSubmit = logoValid && description.length <= 1000 && !update.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    update.mutate(
      {
        id: integration.id,
        description: description.trim(),
        logo_url: logoValue === "" ? null : logoValue,
        is_available: available,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{integration.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Description" htmlFor="integration-description" hint={`${description.length} / 1000`}>
            <textarea
              id="integration-description"
              rows={4}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>
          <Field
            label="URL du logo"
            htmlFor="integration-logo"
            hint="Adresse https d'une image. Sans logo, l'initiale du partenaire s'affiche."
            error={logoValid ? undefined : "L'adresse doit commencer par https://"}
          >
            <Input
              id="integration-logo"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
              spellCheck={false}
            />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Proposée aux collectivités</p>
              <p className="text-xs text-muted-foreground">
                Désactivée, elle n'est plus proposée ; les configurations existantes sont
                conservées.
              </p>
            </div>
            <Switch aria-label="Proposée aux collectivités" checked={available} onCheckedChange={setAvailable} />
          </div>
          {update.error ? (
            <p className="text-sm text-destructive">{(update.error as Error).message}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {update.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
