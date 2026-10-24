import * as React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  Languages,
  Library,
  ListChecks,
  Mail,
  Palette,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  findRootAncestor,
  useAllOrganizations,
  useOrganization,
  type Organization,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { SmtpSettingsSection } from "@/features/superadmin/organizations/sections/SmtpSettingsSection";
import { OrganizationInfoTab } from "@/features/organizations/OrganizationInfoTab";
import { OrganizationProceduresTab } from "@/features/organizations/OrganizationProceduresTab";
import { BrandingSection } from "@/features/organizations/BrandingSection";
import { DomainsSection } from "@/features/organizations/DomainsSection";
import { LanguagesSection } from "@/features/languages/LanguagesSection";
import { FreeMailSection } from "@/features/organizations/FreeMailSection";
import { hasUserInfoTab } from "@/features/organizations/userInfo";

type TabKey = "infos" | "charte" | "langues" | "domaines" | "demarches" | "smtp";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "infos", label: "Informations de base", icon: Settings2 },
  // Comme le relais SMTP, la charte se règle sur TOUTE organisation : une
  // sous-organisation y choisit entre celle de son parent et la sienne.
  { key: "charte", label: "Charte graphique", icon: Palette },
  // Les langues, elles, ne se découpent pas par service : le réglage n'existe
  // que sur l'organisation principale, l'onglet le dit sur les autres.
  { key: "langues", label: "Langues", icon: Languages },
  // Le portail usagers sert la collectivité que DÉSIGNE le domaine visité :
  // l'onglet vit donc sur toute organisation, sous-organisation comprise, dès
  // lors qu'elle tient son propre guichet.
  { key: "domaines", label: "Domaines du portail", icon: Globe },
  { key: "demarches", label: "Démarches", icon: ListChecks },
  // Onglet visible sur TOUTE organisation depuis l'héritage du relais : une
  // sous-organisation y choisit entre la configuration de son parent et la sienne.
  { key: "smtp", label: "Emails (SMTP)", icon: Mail },
];

/**
 * ⚠️ **CE QUE L'ORGANISME DIT N'EST PLUS ICI** (navigation v2, 2026-10-24) :
 * attributions, informations usagers et recommandations aux agents se
 * rédigent dans la rubrique « Connaissances », organisme par organisme. La
 * fiche y renvoie, sur l'organisme courant (`?org=`) — les recommandations,
 * qui ne vivent que sur la racine, sur l'organisation principale.
 */
function KnowledgeLinks({ organization }: { organization: Organization }) {
  const { data: organizations } = useAllOrganizations();
  const root =
    organization.parent_id === null
      ? organization
      : findRootAncestor(organizations ?? [], organization.id);
  const links = [
    {
      to: `/connaissances/recommandations${root ? `?org=${root.id}` : ""}`,
      title:
        root && root.id !== organization.id
          ? `Recommandations aux agents (${root.name})`
          : "Recommandations aux agents",
    },
    { to: `/connaissances/attributions?org=${organization.id}`, title: "Attributions" },
    // Un service interne n'a pas d'informations usagers : le site ne l'affiche pas.
    ...(hasUserInfoTab(organization)
      ? [{ to: `/connaissances/informations-usagers?org=${organization.id}`, title: "Informations usagers" }]
      : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
      <span className="flex items-center gap-1.5 font-semibold">
        <Library aria-hidden="true" className="size-4" />
        Connaissances
      </span>
      <span className="text-muted-foreground">Ce que cet organisme dit à ses agents et au public :</span>
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          {link.title}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      ))}
    </div>
  );
}

/** Édition d'une organisation en pleine page, organisée en onglets (app par organisation). */
export function OrganizationEditorPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { data: organization, isLoading } = useOrganization(orgId);
  const [requestedTab, setRequestedTab] = React.useState<TabKey>("infos");

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-32 animate-pulse rounded-lg bg-muted/40" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="p-6">
        <EmptyState message="Organisation introuvable." />
      </div>
    );
  }

  const activeTab = requestedTab;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Retour aux organisations"
          onClick={() => navigate("/organisations")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{organization.name}</h1>
          <p className="text-muted-foreground">Édition de l'organisation</p>
        </div>
      </div>

      <KnowledgeLinks organization={organization} />

      <div className="border-b border-border">
        <nav className="flex gap-1" role="tablist" aria-label="Sections de l'organisation">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRequestedTab(tab.key)}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* `key` force le remontage (et la réinitialisation des formulaires) au changement d'org. */}
      <div key={organization.id}>
        {activeTab === "infos" && <OrganizationInfoTab organization={organization} />}
        {activeTab === "charte" && <BrandingSection organization={organization} />}
        {activeTab === "langues" && <LanguagesSection organization={organization} />}
        {activeTab === "domaines" && <DomainsSection organizationId={organization.id} />}
        {activeTab === "demarches" && (
          <div className="flex flex-col gap-6">
            {/* Ce qu'un usager peut adresser à l'organisme depuis le site : ses démarches,
                et un courrier libre hors démarche — jamais pour un service interne,
                que le portail n'affiche pas. */}
            {hasUserInfoTab(organization) && <FreeMailSection organization={organization} />}
            <OrganizationProceduresTab organizationId={organization.id} />
          </div>
        )}
        {activeTab === "smtp" && (
          <SmtpSettingsSection
            organizationId={organization.id}
            parentOrganizationId={organization.parent_id}
          />
        )}
      </div>
    </div>
  );
}
