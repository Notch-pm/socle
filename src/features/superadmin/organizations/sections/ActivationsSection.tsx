import * as React from "react";
import { Field } from "@/components/ui/field";
import { OrganizationProceduresTab } from "@/features/organizations/OrganizationProceduresTab";
import {
  useAllOrganizations,
  collectDescendantIdsFlat,
  type Organization,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";

/**
 * Activation des démarches, organisme par organisme, depuis la page du
 * superadmin. C'est la quatrième règle de publication du portail : une
 * démarche que PERSONNE n'active n'est servie nulle part, même en production.
 * L'écran qui active vivait dans l'app par organisation seulement — le super
 * administrateur en était redirigé, et pouvait livrer un catalogue « prêt »
 * devant un portail vide.
 *
 * Un sélecteur sur l'organisation et sa descendance, puis l'onglet partagé
 * `OrganizationProceduresTab`, tel quel : l'upsert passe sous le RLS
 * `is_admin_of_self_or_ancestor`, que le super administrateur court-circuite.
 */
export function ActivationsSection({ organization }: { organization: Organization }) {
  const { data: allOrgs, isLoading } = useAllOrganizations();
  const [selectedId, setSelectedId] = React.useState(organization.id);

  const options = React.useMemo(() => {
    const byId = new Map((allOrgs ?? []).map((org) => [org.id, org]));
    const descendants = collectDescendantIdsFlat(allOrgs ?? [], organization.id)
      .map((id) => byId.get(id))
      .filter((org): org is Organization => Boolean(org))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return [organization, ...descendants];
  }, [allOrgs, organization]);

  return (
    <div className="flex flex-col gap-6">
      <Field
        label="Organisme"
        htmlFor="activations-org"
        hint="Chaque organisme de l'arbre propose ses propres démarches. Un service interne s'efface derrière son porteur sur le portail, mais c'est lui qui active."
      >
        <select
          id="activations-org"
          value={selectedId}
          disabled={isLoading}
          onChange={(e) => setSelectedId(e.target.value)}
          className="h-11 w-full max-w-md rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {options.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
              {org.status === "obsolete" ? " (obsolète)" : ""}
              {org.is_internal_service ? " — service interne" : ""}
            </option>
          ))}
        </select>
      </Field>

      <OrganizationProceduresTab key={selectedId} organizationId={selectedId} />
    </div>
  );
}
