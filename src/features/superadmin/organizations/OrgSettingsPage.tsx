import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Settings2, Network, Users as UsersIcon, ListChecks, Mail, type LucideIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useOrganization } from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { GeneralInfoSection } from "@/features/superadmin/organizations/sections/GeneralInfoSection";
import { SubOrganizationsSection } from "@/features/superadmin/organizations/sections/SubOrganizationsSection";
import { SmtpSettingsSection } from "@/features/superadmin/organizations/sections/SmtpSettingsSection";
import { UsersManagementPage } from "@/features/users/UsersManagementPage";
import { ProceduresListPanel } from "@/features/procedures/ProceduresListPanel";

type Section = "menu" | "general" | "sous-organisations" | "utilisateurs" | "demarches" | "smtp";

const SECTIONS: { key: Section; title: string; description: string; icon: LucideIcon }[] = [
  { key: "general", title: "Informations générales", description: "Nom, slug, type, organisation parente", icon: Settings2 },
  { key: "sous-organisations", title: "Sous-organisations", description: "Organisations rattachées à celle-ci", icon: Network },
  { key: "utilisateurs", title: "Utilisateurs", description: "Membres et rôles de cette organisation", icon: UsersIcon },
  { key: "demarches", title: "Catalogue de démarches", description: "Démarches de l'organisation principale", icon: ListChecks },
  { key: "smtp", title: "Emails (SMTP)", description: "Serveur SMTP utilisé pour les emails de cette organisation", icon: Mail },
];

const SECTION_LABELS: Record<Section, string> = {
  menu: "",
  general: "Informations générales",
  "sous-organisations": "Sous-organisations",
  utilisateurs: "Utilisateurs",
  demarches: "Catalogue de démarches",
  smtp: "Emails (SMTP)",
};

export function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = React.useState<Section>("menu");
  const { data: organization, isLoading } = useOrganization(orgId);

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

  if (activeSection !== "menu") {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Retour au menu"
            onClick={() => setActiveSection("menu")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{organization.name}</h1>
            <p className="text-muted-foreground">{SECTION_LABELS[activeSection]}</p>
          </div>
        </div>

        {activeSection === "general" && <GeneralInfoSection organization={organization} />}
        {activeSection === "sous-organisations" && (
          <SubOrganizationsSection organization={organization} />
        )}
        {activeSection === "utilisateurs" && <UsersManagementPage organizationId={organization.id} />}
        {activeSection === "demarches" &&
          (organization.parent_id === null ? (
            <ProceduresListPanel
              organizationId={organization.id}
              canDelete
              onNew={() =>
                navigate(`/superadmin/organisations/${organization.id}/demarches/nouveau`)
              }
              onEdit={(id) =>
                navigate(`/superadmin/organisations/${organization.id}/demarches/${id}`)
              }
            />
          ) : (
            <EmptyState message="Les démarches se paramètrent au niveau de l'organisation principale (racine)." />
          ))}
        {activeSection === "smtp" && <SmtpSettingsSection organizationId={organization.id} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Retour aux organisations"
          onClick={() => navigate("/superadmin/organisations")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{organization.name}</h1>
          <p className="text-muted-foreground">Configuration de l'organisation</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Card
            key={section.key}
            className="cursor-pointer transition-all hover:border-primary/30 hover:shadow-socle-md"
            onClick={() => setActiveSection(section.key)}
          >
            <CardHeader className="flex-row items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <section.icon className="size-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
