import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  cleanCommunicationConfig,
  parseCommunicationConfig,
  publicationPeriodError,
  type CommunicationConfig,
  type VisibilityConfig,
} from "@/features/procedures/communication";
import type { Procedure } from "@/features/procedures/useProcedures";

/** Ligne « libellé + explication » à gauche, commutateur à droite. */
function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

/**
 * Étape « Communication » : paramètres de diffusion de la démarche. Premier bloc,
 * « Visibilité » — persisté dans `procedures.communication_config` (schéma
 * possédé), exposé par l'API publique et exploité en aval par le portail usagers.
 */
export function CommunicationStep({
  formId,
  procedure,
  onSubmit,
}: {
  formId: string;
  procedure: Procedure;
  onSubmit: (config: CommunicationConfig) => void;
}) {
  const [config, setConfig] = React.useState<CommunicationConfig>(() =>
    parseCommunicationConfig(procedure.communication_config),
  );
  const { visibility } = config;
  const periodError = publicationPeriodError(visibility);

  function setVisibility<K extends keyof VisibilityConfig>(key: K, value: VisibilityConfig[K]) {
    setConfig((c) => ({ ...c, visibility: { ...c.visibility, [key]: value } }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Une période impossible ne partirait jamais en publication : on bloque ici.
    if (periodError) return;
    onSubmit(cleanCommunicationConfig(config));
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex max-w-5xl flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Communication</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paramètres de diffusion de la démarche auprès des usagers.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-border p-5">
        <div>
          <h3 className="text-base font-semibold">Visibilité</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Où et quand la démarche est proposée aux usagers.
          </p>
        </div>

        <ToggleRow
          id="comm-portal-visible"
          label="Visible sur le portail"
          description="La démarche est proposée aux usagers sur le portail en ligne."
          checked={visibility.portalVisible}
          onCheckedChange={(v) => setVisibility("portalVisible", v)}
        />

        <ToggleRow
          id="comm-period-enabled"
          label="Limiter la publication à une période"
          description="En dehors de la période, la démarche n'est pas proposée aux usagers."
          checked={visibility.publicationPeriodEnabled}
          onCheckedChange={(v) => setVisibility("publicationPeriodEnabled", v)}
        />

        {visibility.publicationPeriodEnabled ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Date de début de publication"
              htmlFor="comm-publication-start"
              hint="Jour inclus. Vide : aucune date de début."
            >
              <Input
                id="comm-publication-start"
                type="date"
                value={visibility.publicationStart ?? ""}
                onChange={(e) => setVisibility("publicationStart", e.target.value || null)}
              />
            </Field>

            <Field
              label="Date de fin de publication"
              htmlFor="comm-publication-end"
              hint="Jour inclus. Vide : aucune date de fin."
              error={periodError ?? undefined}
            >
              <Input
                id="comm-publication-end"
                type="date"
                value={visibility.publicationEnd ?? ""}
                onChange={(e) => setVisibility("publicationEnd", e.target.value || null)}
              />
            </Field>
          </div>
        ) : null}
      </section>
    </form>
  );
}
