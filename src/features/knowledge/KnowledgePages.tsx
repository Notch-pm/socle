import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/ui/field";
import {
  sortedRootOrganizations,
  useAllOrganizations,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { AgentGuidanceSection } from "@/features/organizations/AgentGuidanceSection";
import { AttributionsSection } from "@/features/organizations/AttributionsSection";
import { UserInfoSection } from "@/features/organizations/UserInfoSection";
import { useFilledAttributions } from "@/features/organizations/useAttributions";
import { useFilledUserInfo } from "@/features/organizations/useUserInfo";
import { hasUserInfoTab } from "@/features/organizations/userInfo";
import { KnowledgeHeader } from "@/features/knowledge/KnowledgeHeader";
import { OrganizationKnowledgePage } from "@/features/knowledge/OrganizationKnowledgePage";

/**
 * Rubrique « Connaissances » du rail (navigation v2, 2026-10-24) : ce que la
 * collectivité dit à ses agents et au public, sorti des onglets de chaque
 * organisation pour être rédigé au même endroit. Les éditeurs sont les
 * sections partagées avec le superadmin, inchangées : seule la page change.
 */

/** `/connaissances/attributions` — un texte par organisme, services internes compris. */
export function AttributionsPage() {
  return (
    <OrganizationKnowledgePage
      header={{
        crumb: "Pour les agents",
        title: "Attributions",
        description:
          "Ce que traite chaque organisme et ce qu'il ne traite pas. Un texte court par organisme, services internes compris, pour orienter les demandes et les courriers vers le bon service.",
        audience: "interne",
        usedBy: ["Clara", "Iris"],
      }}
      listLabel="Organismes"
      useFilled={useFilledAttributions}
      renderEditor={(organization) => <AttributionsSection organization={organization} intro={false} />}
    />
  );
}

/**
 * `/connaissances/informations-usagers` — ⚠️ sans les services internes : le
 * site de démarches ne les affiche pas (`hasUserInfoTab`).
 */
export function UserInfoPage() {
  return (
    <OrganizationKnowledgePage
      header={{
        crumb: "Pour les usagers",
        title: "Informations usagers",
        description:
          "Ce que chaque organisme dit au public : présentation, horaires d'accueil, questions fréquentes. Tout ce qui est écrit ici est publié dès l'enregistrement.",
        audience: "public",
        usedBy: ["Site de démarches", "Assistant du site"],
      }}
      listLabel="Organismes visibles sur le site"
      include={hasUserInfoTab}
      useFilled={useFilledUserInfo}
      renderEditor={(organization) => <UserInfoSection organization={organization} intro={false} />}
    />
  );
}

/**
 * `/connaissances/recommandations` — ⚠️ **un seul texte par collectivité** :
 * il se règle sur l'organisation principale et vaut pour tous ses services
 * (trigger `enforce_agent_guidance_root_org`). Pas de liste d'organismes, donc ;
 * un sélecteur seulement si le compte voit plusieurs racines.
 */
export function AgentGuidancePage() {
  const { data: organizations, isLoading, isError } = useAllOrganizations();
  const [searchParams, setSearchParams] = useSearchParams();
  const roots = React.useMemo(() => sortedRootOrganizations(organizations ?? []), [organizations]);
  const requested = searchParams.get("org");
  const root = roots.find((o) => o.id === requested) ?? roots[0];

  return (
    <div className="p-6">
      <KnowledgeHeader
        crumb="Pour les agents"
        title="Recommandations aux agents"
        description="Ce que la collectivité dit à ses agents, pour toutes ses démarches à la fois : rôle, accueil, consignes générales, FAQ et sources. Se règle sur l'organisation principale et vaut pour tous ses services ; la consigne d'une démarche l'emporte sur la consigne générale."
        audience="interne"
        usedBy={["Iris", "Assistant IA de l'agent"]}
      />

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
      ) : isError ? (
        <EmptyState message="La liste des organisations n'a pas pu être lue. Réessayez dans un instant." />
      ) : !root ? (
        <EmptyState message="Les recommandations aux agents se règlent sur l'organisation principale, que votre compte ne voit pas." />
      ) : (
        <div className="flex max-w-4xl flex-col gap-4">
          {roots.length > 1 ? (
            <Field label="Organisation" htmlFor="agent-guidance-org" className="max-w-sm">
              <select
                id="agent-guidance-org"
                value={root.id}
                onChange={(e) => setSearchParams({ org: e.target.value }, { replace: true })}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {roots.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <AgentGuidanceSection key={root.id} organization={root} intro={false} />
        </div>
      )}
    </div>
  );
}
