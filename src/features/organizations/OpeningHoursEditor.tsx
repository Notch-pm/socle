import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  WEEKDAY_LABELS,
  type DayHoursDraft,
  type Weekday,
} from "@/features/organizations/userInfo";

type TimeKey = "morningOpen" | "morningClose" | "afternoonOpen" | "afternoonClose";

/** Les quatre heures d'un jour, dans l'ordre de la journée. */
const TIME_FIELDS: { key: TimeKey; label: string; required: boolean }[] = [
  { key: "morningOpen", label: "Ouverture", required: true },
  { key: "morningClose", label: "Fin de matinée", required: false },
  { key: "afternoonOpen", label: "Début d'après-midi", required: false },
  { key: "afternoonClose", label: "Fermeture", required: true },
];

/**
 * Horaires d'accueil, jour par jour : un interrupteur « Ouvert », puis quatre
 * heures `HH:MM` (champs `time` natifs). Ouverture et fermeture sont
 * obligatoires sur un jour ouvert ; la pause de midi est facultative mais va
 * par paire. La règle vit dans `dayHoursError` — l'écran ne fait qu'afficher
 * les erreurs qu'on lui passe.
 */
export function OpeningHoursEditor({
  value,
  onChange,
  errors,
}: {
  value: DayHoursDraft[];
  onChange: (value: DayHoursDraft[]) => void;
  errors: Partial<Record<Weekday, string>>;
}) {
  const update = (day: Weekday, patch: Partial<DayHoursDraft>) =>
    onChange(value.map((row) => (row.day === day ? { ...row, ...patch } : row)));

  const first = value.find((row) => row.open);
  const copyFirst = () => {
    if (!first) return;
    onChange(
      value.map((row) =>
        row.open && row.day !== first.day
          ? {
              ...row,
              morningOpen: first.morningOpen,
              morningClose: first.morningClose,
              afternoonOpen: first.afternoonOpen,
              afternoonClose: first.afternoonClose,
            }
          : row,
      ),
    );
  };

  return (
    <Field
      label="Horaires d'accueil"
      hint="Pour chaque jour ouvert : l'ouverture et la fermeture sont obligatoires. Sans pause de midi, l'accueil est continu. Un jour décoché est fermé."
    >
      <div className="flex flex-col gap-2">
        {value.map((row) => {
          const label = WEEKDAY_LABELS[row.day];
          const error = errors[row.day];
          return (
            <div key={row.day} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex w-36 items-center gap-2 text-sm font-medium">
                  <Switch
                    checked={row.open}
                    onCheckedChange={(open) => update(row.day, { open })}
                    aria-label={`${label} — ouvert`}
                  />
                  {label}
                </label>
                {row.open ? (
                  <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                    {TIME_FIELDS.map((field) => (
                      <label key={field.key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span>
                          {field.label}
                          {field.required ? " *" : ""}
                        </span>
                        <Input
                          type="time"
                          value={row[field.key]}
                          onChange={(e) => update(row.day, { [field.key]: e.target.value })}
                          aria-required={field.required}
                          aria-label={`${label} — ${field.label.toLowerCase()}`}
                          aria-invalid={error ? true : undefined}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Fermé</span>
                )}
              </div>
              {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
            </div>
          );
        })}
        {first ? (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={copyFirst}>
              <Copy className="size-4" />
              Recopier le {WEEKDAY_LABELS[first.day].toLowerCase()} sur les autres jours ouverts
            </Button>
          </div>
        ) : null}
      </div>
    </Field>
  );
}
