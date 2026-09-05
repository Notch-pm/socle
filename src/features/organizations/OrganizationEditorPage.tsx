import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Globe, ListChecks, Mail, Palette, Settings2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { SmtpSettingsSection } from "@/features/superadmin/organizations/sections/SmtpSettingsSection";
import { OrganizationInfoTab } from "@/features/organizations/OrganizationInfoTab";
import { OrganizationProceduresTab } from "@/features/organizations/OrganizationProceduresTab";
import { BrandingSection } from "@/features/organizations/BrandingSection";
import { DomainsSection } from "@/features/organizations/DomainsSection";

type TabKey = "infos" | "charte" | "domaines" | "demarches" | "smtp";

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "infos", label: "Informations de base", icon: Settings2 },
  // Comme le relais SMTP, la charte se règle sur TOUTE organisation : une
  // sous-organisation y choisit entre celle de son parent et la sienne.
  { key: "charte", label: "Charte graphique", icon: Palette },
  // Le portail usagers sert la collectivité que DÉSIGNE le domaine visité :
  // l'onglet vit donc sur toute organisation, sous-organisation comprise, dès
  // lors qu'elle tient son propre guichet.
  { key: "domaines", label: "Domaines du portail", icon: Globe },
  { key: "demarches", label: "Démarches", icon: ListChecks },
  // Onglet visible sur TOUTE organisation depuis l'héritage du relais : une
  // sous-organisation y choisit entre la configuration de son parent et la sienne.
  { key: "smtp", label: "Emails (SMTP)", icon: Mail },
];

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

  const activeTab = TABS.some((tab) => tab.key === requestedTab) ? requestedTab : "infos";

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
        {activeTab === "domaines" && <DomainsSection organizationId={organization.id} />}
        {activeTab === "demarches" && (
          <OrganizationProceduresTab organizationId={organization.id} />
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
