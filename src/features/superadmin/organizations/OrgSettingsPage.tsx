import * as React from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Settings2, Users as UsersIcon, ListChecks, FileCheck2, FileSignature, MapPin, Mail, Palette, KeyRound, Gauge, type LucideIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useOrganization, type OrgNode } from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { GeneralInfoSection } from "@/features/superadmin/organizations/sections/GeneralInfoSection";
import { SmtpSettingsSection } from "@/features/superadmin/organizations/sections/SmtpSettingsSection";
import { OrganizationsManager } from "@/features/organizations/OrganizationsManager";
import { BrandingSection } from "@/features/organizations/BrandingSection";
import { ApiKeysSection } from "@/features/superadmin/organizations/sections/ApiKeysSection";
import { AiUsageSection } from "@/features/superadmin/organizations/sections/AiUsageSection";
import { UsersManagementPage } from "@/features/users/UsersManagementPage";
import { ProceduresListPanel } from "@/features/procedures/ProceduresListPanel";
import { DocumentTypesManager } from "@/features/document-types/DocumentTypesManager";
import { DocumentTemplatesManager } from "@/features/documents/DocumentTemplatesManager";
import { QuartiersManager } from "@/features/quartiers/QuartiersManager";

type Section =
  | "menu"
  | "general"
  | "charte"
  | "utilisateurs"
  | "demarches"
  | "types-pieces"
  | "documents"
  | "quartiers"
  | "smtp"
  | "api"
  | "ia";

const SECTIONS: { key: Section; title: string; description: string; icon: LucideIcon }[] = [
  { key: "general", title: "Informations générales", description: "Nom, slug, type, organisation parente", icon: Settings2 },
  { key: "charte", title: "Charte graphique", description: "Logos et couleurs repris par les applications de la gamme", icon: Palette },
  { key: "utilisateurs", title: "Utilisateurs", description: "Membres et rôles de cette organisation", icon: UsersIcon },
  { key: "demarches", title: "Catalogue de démarches", description: "Démarches de l'organisation principale", icon: ListChecks },
  { key: "types-pieces", title: "Types de pièce justificative", description: "Pièces demandées dans les démarches", icon: FileCheck2 },
  { key: "documents", title: "Documents", description: "Modèles de documents et de courriers à variables", icon: FileSignature },
  { key: "quartiers", title: "Quartiers", description: "Découpage du territoire pour rattacher les usagers", icon: MapPin },
  { key: "smtp", title: "Emails (SMTP)", description: "Serveur SMTP utilisé pour les emails de cette organisation", icon: Mail },
  { key: "api", title: "API publique", description: "Clés d'accès en lecture seule (organisations, démarches, catégories)", icon: KeyRound },
  { key: "ia", title: "Assistant IA", description: "Plafond mensuel de jetons et consommation par application", icon: Gauge },
];

/**
 * La section active vit dans l'URL (`?section=ia`), pas dans un `useState`.
 *
 * Deux raisons, et la seconde n'est apparue qu'avec l'écran inter-clients :
 *  • un réglage se partage et se met en signet (« la config SMTP d'ACCM ») ;
 *  • la page « Assistant IA » de la plateforme renvoie ici, sur la bonne
 *    section — sans quoi son lien déposerait l'éditeur devant un menu, à
 *    recliquer ce qu'il venait de demander.
 *
 * Effet de bord bienvenu : changer d'organisation dans le rail navigue vers une
 * URL SANS `section`, donc revient au menu. L'effet qui le faisait à la main
 * (le composant reste monté d'une organisation à l'autre) n'a plus lieu d'être.
 */
const SECTION_KEYS = new Set<string>([
  "general", "charte", "utilisateurs", "demarches", "types-pieces", "documents", "quartiers", "smtp", "api", "ia",
]);

const SECTION_LABELS: Record<Section, string> = {
  menu: "",
  general: "Informations générales",
  charte: "Charte graphique",
  utilisateurs: "Utilisateurs",
  demarches: "Catalogue de démarches",
  "types-pieces": "Types de pièce justificative",
  documents: "Documents",
  quartiers: "Quartiers",
  smtp: "Emails (SMTP)",
  api: "API publique",
  ia: "Assistant IA",
};

export function OrgSettingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: organization, isLoading } = useOrganization(orgId);

  const requested = searchParams.get("section") ?? "";
  const activeSection: Section = SECTION_KEYS.has(requested) ? (requested as Section) : "menu";
  const setActiveSection = React.useCallback(
    (section: Section) => {
      // `replace` : parcourir les réglages ne doit pas remplir l'historique de
      // retours intermédiaires.
      setSearchParams(section === "menu" ? {} : { section }, { replace: true });
    },
    [setSearchParams],
  );

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
        {activeSection === "charte" && <BrandingSection organization={organization} />}
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
        {activeSection === "types-pieces" &&
          (organization.parent_id === null ? (
            <DocumentTypesManager organizationId={organization.id} />
          ) : (
            <EmptyState message="Les types de pièce se paramètrent au niveau de l'organisation principale (racine)." />
          ))}
        {activeSection === "documents" &&
          (organization.parent_id === null ? (
            <DocumentTemplatesManager organizationId={organization.id} />
          ) : (
            <EmptyState message="Les documents se paramètrent au niveau de l'organisation principale (racine)." />
          ))}
        {activeSection === "quartiers" &&
          (organization.parent_id === null ? (
            <QuartiersManager organizationId={organization.id} />
          ) : (
            <EmptyState message="Les quartiers se paramètrent au niveau de l'organisation principale (racine)." />
          ))}
        {activeSection === "smtp" && (
          <SmtpSettingsSection
            organizationId={organization.id}
            parentOrganizationId={organization.parent_id}
          />
        )}
        {activeSection === "api" &&
          (organization.parent_id === null ? (
            <ApiKeysSection organizationId={organization.id} />
          ) : (
            <EmptyState message="Les clés API se gèrent au niveau de l'organisation principale (racine)." />
          ))}
        {/* Un budget est une affaire de collectivité, pas de service : le
            plafond se pose sur la racine, et le trigger le garde en base. */}
        {activeSection === "ia" &&
          (organization.parent_id === null ? (
            <AiUsageSection organizationId={organization.id} />
          ) : (
            <EmptyState message="Le plafond IA se règle au niveau de l'organisation principale (racine)." />
          ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        {organization.parent_id ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Revenir à l'organisation parente"
            onClick={() => navigate(`/superadmin/organisations/${organization.parent_id}`)}
          >
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{organization.name}</h1>
          <p className="text-muted-foreground">Configuration de l'organisation</p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Arborescence</h2>
        <OrganizationsManager
          canManageRoots
          rootOrganizationId={organization.id}
          onConfigure={(node: OrgNode) => navigate(`/superadmin/organisations/${node.id}`)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Paramétrage</h2>
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
      </section>
    </div>
  );
}
