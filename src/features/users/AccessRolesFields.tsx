import { Field } from "@/components/ui/field";
import {
  NO_ACCESS,
  SOCLE_APPLICATION_ID,
  SOCLE_ROLES,
  type AccessApplication,
} from "@/features/users/agentAccess";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Le Socle en tête, puis les applications abonnées par la collectivité. */
export function withSocle(applications: AccessApplication[]): AccessApplication[] {
  return [{ id: SOCLE_APPLICATION_ID, name: "Socle", roles: SOCLE_ROLES }, ...applications];
}

/**
 * Un sélecteur par application : « Aucun accès » ou l'un des rôles de base
 * qu'elle déclare. Les droits fins (profils, signataire…) se règlent dans
 * l'application elle-même.
 */
export function AccessRolesFields({
  idPrefix,
  applications,
  value,
  onChange,
}: {
  idPrefix: string;
  applications: AccessApplication[];
  value: Record<string, string>;
  onChange: (applicationId: string, roleCode: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">Accès aux applications</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {withSocle(applications).map((app) => (
          <Field key={app.id} label={app.name} htmlFor={`${idPrefix}-${app.id}`}>
            <select
              id={`${idPrefix}-${app.id}`}
              value={value[app.id] ?? NO_ACCESS}
              onChange={(e) => onChange(app.id, e.target.value)}
              className={selectClass}
            >
              <option value={NO_ACCESS}>Aucun accès</option>
              {app.roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Le Socle décide de l'accès et du rôle de base. Les droits fins se règlent dans chaque
        application.
      </p>
    </fieldset>
  );
}
