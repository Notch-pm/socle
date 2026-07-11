import * as React from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  AUDIENCES,
  FIELD_VISIBILITIES,
  parseRequesterConfig,
  type Audience,
  type FieldVisibility,
  type RequesterConfig,
} from "@/features/procedures/requesterFields";
import type { Procedure } from "@/features/procedures/useProcedures";

/** Contrôle segmenté à 3 états pour un champ (Masqué / Visible / Obligatoire). */
function VisibilityControl({
  value,
  onChange,
  label,
}: {
  value: FieldVisibility;
  onChange: (v: FieldVisibility) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`État du champ ${label}`}
      className="inline-flex shrink-0 rounded-lg border border-input bg-background p-0.5"
    >
      {FIELD_VISIBILITIES.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground shadow-socle-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Étape « Informations demandeur » : pour chaque public activé, choix de l'état
 * (masqué / visible / obligatoire) de chaque donnée demandée au requérant.
 */
export function DemandeurStep({
  formId,
  procedure,
  onSubmit,
}: {
  formId: string;
  procedure: Procedure;
  onSubmit: (config: RequesterConfig) => void;
}) {
  const [config, setConfig] = React.useState<RequesterConfig>(() =>
    parseRequesterConfig(procedure.requester_config),
  );

  function setEnabled(audience: Audience, enabled: boolean) {
    setConfig((c) => ({ ...c, [audience]: { ...c[audience], enabled } }));
  }

  function setField(audience: Audience, key: string, visibility: FieldVisibility) {
    setConfig((c) => ({
      ...c,
      [audience]: { ...c[audience], fields: { ...c[audience].fields, [key]: visibility } },
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(config);
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="flex max-w-5xl flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Public concerné</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Activez les publics autorisés à effectuer cette démarche, puis choisissez pour chaque
          donnée si elle est masquée, visible (facultative) ou obligatoire.
        </p>
      </div>

      {AUDIENCES.map((audience) => {
        const audienceConfig = config[audience.key];
        return (
          <section key={audience.key} className="overflow-hidden rounded-xl border border-border">
            <header className="flex items-center justify-between gap-4 bg-muted/30 px-4 py-3">
              <label
                htmlFor={`audience-${audience.key}`}
                className="text-sm font-semibold text-foreground"
              >
                {audience.label}
              </label>
              <Switch
                id={`audience-${audience.key}`}
                checked={audienceConfig.enabled}
                onCheckedChange={(v) => setEnabled(audience.key, v)}
                aria-label={`Activer le public ${audience.label}`}
              />
            </header>

            {audienceConfig.enabled ? (
              <ul className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
                {audience.fields.map((field) => (
                  <li
                    key={field.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2"
                  >
                    <span className="text-sm text-foreground">{field.label}</span>
                    <VisibilityControl
                      label={field.label}
                      value={audienceConfig.fields[field.key]}
                      onChange={(v) => setField(audience.key, field.key, v)}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </form>
  );
}
