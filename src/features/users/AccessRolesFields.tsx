import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  isApplicationAdminRole,
  NO_ACCESS,
  SOCLE_APPLICATION_ID,
  SOCLE_ROLES,
  setDraftRole,
  toggleDraftOrganizations,
  type AccessApplication,
  type AccessDraft,
  type ManagedOrganization,
} from "@/features/users/agentAccess";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Le Socle en tête, puis les applications abonnées par la collectivité. */
export function withSocle(applications: AccessApplication[]): AccessApplication[] {
  return [{ id: SOCLE_APPLICATION_ID, name: "Socle", roles: SOCLE_ROLES }, ...applications];
}

/**
 * Accès d'un agent : un sélecteur de rôle par application (« Aucun accès » ou
 * l'un des rôles de base qu'elle déclare), puis — si l'administrateur gère des
 * services — un tableau organismes × applications ouvertes, pour choisir où
 * l'accès est donné. Les droits fins (profils, signataire…) se règlent dans
 * l'application elle-même.
 *
 * ⚠️ Un rôle d'administration d'application vaut pour toute la collectivité :
 * il coche la racine et la verrouille ; sans la racine (administrateur de
 * service), ces rôles ne sont pas proposés.
 */
export function AccessRolesFields({
  idPrefix,
  applications,
  organizations,
  rootId,
  value,
  onChange,
}: {
  idPrefix: string;
  /** Applications abonnées, SANS le Socle (ajouté ici). */
  applications: AccessApplication[];
  organizations: ManagedOrganization[];
  rootId: string | null;
  value: AccessDraft;
  onChange: (draft: AccessDraft) => void;
}) {
  const all = withSocle(applications);
  const open = all.filter((app) => (value[app.id]?.role ?? NO_ACCESS) !== NO_ACCESS);
  const showGrid = organizations.length > 1 && open.length > 0;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">Accès aux applications</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {all.map((app) => (
          <Field key={app.id} label={app.name} htmlFor={`${idPrefix}-${app.id}`}>
            <select
              id={`${idPrefix}-${app.id}`}
              value={value[app.id]?.role ?? NO_ACCESS}
              onChange={(e) => onChange(setDraftRole(value, applications, app.id, e.target.value, rootId))}
              className={selectClass}
            >
              <option value={NO_ACCESS}>Aucun accès</option>
              {app.roles
                .filter(
                  (r) =>
                    rootId !== null ||
                    !isApplicationAdminRole(applications, app.id, r.code) ||
                    r.code === value[app.id]?.role,
                )
                .map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
            </select>
          </Field>
        ))}
      </div>

      {showGrid ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Organismes ouverts</p>
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Organisme</th>
                  {open.map((app) => {
                    const ids = organizations.map((o) => o.id);
                    const checked = value[app.id]?.organizationIds ?? [];
                    const allChecked = ids.every((id) => checked.includes(id));
                    const locked = isApplicationAdminRole(applications, app.id, value[app.id].role) ? rootId : null;
                    return (
                      <th key={app.id} className="px-3 py-2 text-center">
                        <div>{app.name}</div>
                        <button
                          type="button"
                          className="text-xs font-normal text-primary underline-offset-2 hover:underline"
                          onClick={() =>
                            onChange(
                              toggleDraftOrganizations(
                                value,
                                app.id,
                                allChecked ? ids.filter((id) => id !== locked) : ids,
                                !allChecked,
                              ),
                            )
                          }
                        >
                          {allChecked ? "Aucun" : "Tous"}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id} className="border-t border-border">
                    <td className="px-3 py-1.5">
                      <span className={cn(org.depth === 0 && "font-medium")} style={{ paddingLeft: `${org.depth * 16}px` }}>
                        {org.name}
                      </span>
                    </td>
                    {open.map((app) => {
                      const isAdmin = isApplicationAdminRole(applications, app.id, value[app.id].role);
                      const locked = isAdmin && org.id === rootId;
                      return (
                        <td key={app.id} className="px-3 py-1.5 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${app.name} — ${org.name}`}
                            checked={value[app.id].organizationIds.includes(org.id)}
                            disabled={locked}
                            title={locked ? "L'administration vaut pour toute la collectivité." : undefined}
                            onChange={(e) =>
                              onChange(toggleDraftOrganizations(value, app.id, [org.id], e.target.checked))
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Le Socle décide de l'accès, du rôle de base et des organismes. Les droits fins se règlent
        dans chaque application. L'administration d'une application vaut pour toute la collectivité.
      </p>
    </fieldset>
  );
}
