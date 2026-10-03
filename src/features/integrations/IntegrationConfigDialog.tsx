import * as React from "react";
import { ChevronDown, ChevronRight, CircleCheck, CircleX, Download, Loader2, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getAdapter, readValues, type AdapterField } from "./adapters";
import { applicationNames, IntegrationLogo, StatusBadge } from "./IntegrationCard";
import { organizationStatus } from "./integrationStatus";
import {
  useImportPartnerProcedures,
  useSaveOrganizationIntegration,
  useSetOrganizationIntegrationActive,
  useTestOrganizationIntegration,
  type CatalogueIntegration,
  type OrganizationIntegration,
} from "./useIntegrations";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

/**
 * Fiche d'une intégration pour une collectivité : présentation, statut, puis
 * la configuration — générée depuis l'adaptateur, rien d'inventé.
 *
 * ⚠️ Un secret n'est JAMAIS prérempli : le navigateur n'en connaît que la
 * présence. Champ vide = conserver la valeur enregistrée ; « Effacer » la
 * retire explicitement.
 */
export function IntegrationConfigDialog({
  organizationId,
  integration,
  config,
  secretKeys,
  onClose,
}: {
  organizationId: string;
  integration: CatalogueIntegration;
  config: OrganizationIntegration | null;
  secretKeys: string[];
  onClose: () => void;
}) {
  const adapter = getAdapter(integration.adapter);
  const save = useSaveOrganizationIntegration(organizationId);
  const setActive = useSetOrganizationIntegrationActive(organizationId);
  const test = useTestOrganizationIntegration(organizationId);
  const importProcedures = useImportPartnerProcedures();

  const savedSettings = React.useMemo(() => readValues(config?.settings), [config?.settings]);
  const [settings, setSettings] = React.useState<Record<string, string>>(savedSettings);
  const [secrets, setSecrets] = React.useState<Record<string, string>>({});
  const [erased, setErased] = React.useState<Set<string>>(new Set());
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const fields = adapter?.fields ?? [];
  const status = organizationStatus(integration, config, secretKeys);
  const applications = applicationNames(integration);

  const settingsPayload = React.useMemo(() => {
    const payload: Record<string, string> = {};
    for (const field of fields) {
      if (field.secret) continue;
      const value = (settings[field.key] ?? "").trim();
      if (value !== "") payload[field.key] = value;
    }
    return payload;
  }, [fields, settings]);

  const secretsPayload: Record<string, string | null> = {};
  for (const field of fields) {
    if (!field.secret) continue;
    if (erased.has(field.key)) secretsPayload[field.key] = null;
    else if ((secrets[field.key] ?? "") !== "") secretsPayload[field.key] = secrets[field.key];
  }

  const dirty =
    JSON.stringify(settingsPayload) !== JSON.stringify(sortedEntries(savedSettings, fields)) ||
    Object.keys(secretsPayload).length > 0;

  function handleSave() {
    save.mutate(
      {
        integrationId: integration.id,
        configId: config?.id ?? null,
        settings: settingsPayload,
        secrets: secretsPayload,
      },
      {
        onSuccess: () => {
          setSecrets({});
          setErased(new Set());
          test.reset();
        },
      },
    );
  }

  const canTest = Boolean(config) && !dirty && !test.isPending;
  const canToggleActive =
    Boolean(config) && !dirty && !setActive.isPending && (config!.is_active || config!.last_test_ok === true);

  const renderField = (field: AdapterField) => {
    const id = `integration-${integration.slug}-${field.key}`;
    if (!field.secret) {
      return (
        <Field key={field.key} label={field.label} htmlFor={id} required={field.required} hint={field.hint}>
          <Input
            id={id}
            value={settings[field.key] ?? ""}
            onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
            placeholder={field.placeholder}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      );
    }
    const stored = secretKeys.includes(field.key);
    const willErase = erased.has(field.key);
    return (
      <Field
        key={field.key}
        label={field.label}
        htmlFor={id}
        required={field.required}
        hint={
          willErase
            ? "Sera effacé à l'enregistrement."
            : stored
              ? "Renseigné — laisser vide pour conserver la valeur enregistrée."
              : field.hint
        }
      >
        <div className="flex gap-2">
          <Input
            id={id}
            type="password"
            value={secrets[field.key] ?? ""}
            onChange={(e) => setSecrets({ ...secrets, [field.key]: e.target.value })}
            placeholder={stored ? "••••••••" : field.placeholder}
            autoComplete="new-password"
            disabled={willErase}
          />
          {stored ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto"
              onClick={() => {
                const next = new Set(erased);
                if (willErase) next.delete(field.key);
                else next.add(field.key);
                setErased(next);
                setSecrets({ ...secrets, [field.key]: "" });
              }}
            >
              {willErase ? "Conserver" : "Effacer"}
            </Button>
          ) : null}
        </div>
      </Field>
    );
  };

  const basicFields = fields.filter((f) => !f.advanced);
  const advancedFields = fields.filter((f) => f.advanced);

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <IntegrationLogo integration={integration} />
            <div>
              <DialogTitle>{integration.name}</DialogTitle>
              <p className="text-sm text-muted-foreground">{integration.integration_types?.name}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {integration.description ? <p className="text-sm">{integration.description}</p> : null}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs font-medium text-muted-foreground">Applications concernées</dt>
              <dd className="flex flex-wrap gap-1.5">
                {applications.map((name) => (
                  <Badge key={name} variant="secondary">
                    {name}
                  </Badge>
                ))}
              </dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <dt className="text-xs font-medium text-muted-foreground">Statut</dt>
              <dd>
                <StatusBadge status={status} />
              </dd>
            </div>
          </dl>

          {config?.last_tested_at ? (
            <p className="text-xs text-muted-foreground">
              Dernier test le {dateFormat.format(new Date(config.last_tested_at))} :{" "}
              {config.last_test_ok ? "réussi" : `échec — ${config.last_test_error ?? "erreur inconnue"}`}
            </p>
          ) : null}

          {!adapter ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Cette intégration n'est pas encore configurable.
            </p>
          ) : (
            <section className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold">Configuration</h3>
              {basicFields.map(renderField)}
              {advancedFields.length > 0 ? (
                <div className="flex flex-col gap-4">
                  <button
                    type="button"
                    className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
                    aria-expanded={showAdvanced}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    {showAdvanced ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    Paramètres avancés
                  </button>
                  {showAdvanced ? advancedFields.map(renderField) : null}
                </div>
              ) : null}

              {save.error ? <p className="text-sm text-destructive">{(save.error as Error).message}</p> : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={handleSave} disabled={!dirty || save.isPending}>
                  {save.isPending ? "Enregistrement…" : "Enregistrer"}
                </Button>
                <Button variant="outline" onClick={() => config && test.mutate(config.id)} disabled={!canTest}>
                  {test.isPending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
                  Tester la connexion
                </Button>
              </div>
              {dirty && config ? (
                <p className="text-xs text-muted-foreground">Enregistrez avant de tester la connexion.</p>
              ) : null}

              {test.data ? (
                <p
                  role="status"
                  className={
                    test.data.ok
                      ? "flex items-start gap-2 text-sm text-success"
                      : "flex items-start gap-2 text-sm text-destructive"
                  }
                >
                  {test.data.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleX className="mt-0.5 size-4 shrink-0" />}
                  {test.data.message}
                </p>
              ) : null}
              {test.error ? <p className="text-sm text-destructive">{(test.error as Error).message}</p> : null}

              {config ? (
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Intégration active</p>
                    <p className="text-xs text-muted-foreground">
                      {config.is_active
                        ? "Les applications concernées peuvent l'utiliser. Désactiver la suspend sans rien effacer."
                        : "Un test de connexion réussi est nécessaire pour l'activer."}
                    </p>
                  </div>
                  <Switch
                    aria-label="Intégration active"
                    checked={config.is_active}
                    disabled={!canToggleActive}
                    onCheckedChange={(active) => setActive.mutate({ configId: config.id, active })}
                  />
                </div>
              ) : null}
              {setActive.error ? (
                <p className="text-sm text-destructive">{(setActive.error as Error).message}</p>
              ) : null}

              {config?.is_active && integration.adapter === "arpege" ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Démarches {integration.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Importées dans le catalogue de la collectivité, chacune dans sa catégorie{" "}
                        {integration.name} (« … ({integration.name}) »), puis à activer organisation
                        par organisation dans « Démarches activées ».
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => importProcedures.mutate(config.id)}
                      disabled={importProcedures.isPending}
                    >
                      {importProcedures.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      Récupérer les démarches
                    </Button>
                  </div>
                  {importProcedures.data ? (
                    <p role="status" className="text-sm">
                      {importProcedures.data.created} créée(s), {importProcedures.data.updated} mise(s) à
                      jour, {importProcedures.data.unchanged} inchangée(s)
                      {importProcedures.data.categories_created
                        ? ` ; ${importProcedures.data.categories_created} catégorie(s) créée(s)`
                        : ""}
                      {importProcedures.data.recategorized
                        ? ` ; ${importProcedures.data.recategorized} démarche(s) rangée(s) dans leur catégorie`
                        : ""}
                      .
                      {importProcedures.data.missing.length > 0
                        ? ` Plus proposées par ${integration.name} (conservées) : ${importProcedures.data.missing.join(", ")}.`
                        : ""}
                    </p>
                  ) : null}
                  {importProcedures.error ? (
                    <p className="text-sm text-destructive">{(importProcedures.error as Error).message}</p>
                  ) : null}
                </div>
              ) : null}
            </section>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Paramètres enregistrés, réduits aux champs non secrets non vides, dans l'ordre de l'adaptateur. */
function sortedEntries(saved: Record<string, string>, fields: AdapterField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    if (field.secret) continue;
    const value = (saved[field.key] ?? "").trim();
    if (value !== "") out[field.key] = value;
  }
  return out;
}
