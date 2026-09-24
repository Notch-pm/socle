import * as React from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, BookUser, Settings2, Users as UsersIcon, ListChecks, FileCheck2, FileSignature, MapPin, Mail, Palette, Globe, Languages, LayoutTemplate, KeyRound, Gauge, Tags, ToggleRight, AppWindow, MessagesSquare, MessageCircleQuestion, type LucideIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { useOrganization, type OrgNode } from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { GeneralInfoSection } from "@/features/superadmin/organizations/sections/GeneralInfoSection";
import { SmtpSettingsSection } from "@/features/superadmin/organizations/sections/SmtpSettingsSection";
import { ActivationsSection } from "@/features/superadmin/organizations/sections/ActivationsSection";
import { ApplicationsSection } from "@/features/superadmin/organizations/sections/ApplicationsSection";
import { OnboardingChecklistCard } from "@/features/superadmin/organizations/OnboardingChecklistCard";
import { OrganizationsManager } from "@/features/organizations/OrganizationsManager";
import { BrandingSection } from "@/features/organizations/BrandingSection";
import { DomainsSection } from "@/features/organizations/DomainsSection";
import { LanguagesSection } from "@/features/languages/LanguagesSection";
import { AgentGuidanceSection } from "@/features/organizations/AgentGuidanceSection";
import { UserInfoSection } from "@/features/organizations/UserInfoSection";
import { ApiKeysSection } from "@/features/superadmin/organizations/sections/ApiKeysSection";
import { AiUsageSection } from "@/features/superadmin/organizations/sections/AiUsageSection";
import { PortalAssistantSection } from "@/features/superadmin/organizations/sections/PortalAssistantSection";
import { UsersManagementPage } from "@/features/users/UsersManagementPage";
import { ProceduresListPanel } from "@/features/procedures/ProceduresListPanel";
import { CategoriesManager } from "@/features/categories/CategoriesManager";
import { DocumentTypesManager } from "@/features/document-types/DocumentTypesManager";
import { DocumentTemplatesManager } from "@/features/documents/DocumentTemplatesManager";
import { QuartiersManager } from "@/features/quartiers/QuartiersManager";

type Section =
  | "menu"
  | "general"
  | "charte"
  | "langues"
  | "usagers"
  | "agents"
  | "domaines"
  | "utilisateurs"
  | "applications"
  | "categories"
  | "demarches"
  | "activations"
  | "types-pieces"
  | "documents"
  | "quartiers"
  | "smtp"
  | "api"
  | "ia"
  | "assistant-portail";

const SECTIONS: { key: Exclude<Section, "menu">; title: string; description: string; icon: LucideIcon }[] = [
  { key: "general", title: "Informations générales", description: "Nom, coordonnées, slug, organisation parente", icon: Settings2 },
  { key: "charte", title: "Charte graphique", description: "Logos et couleurs repris par les applications de la gamme", icon: Palette },
  { key: "langues", title: "Langues", description: "Langues activées pour les libellés des démarches et des catégories", icon: Languages },
  { key: "usagers", title: "Informations usagers", description: "Descriptif, horaires d'accueil et FAQ publiés sur le site de démarches — repris par son assistant IA", icon: MessageCircleQuestion },
  { key: "agents", title: "Recommandations aux agents", description: "Rôle des agents, accueil physique, consignes, FAQ et sources — repris par Iris et son assistant IA", icon: BookUser },
  { key: "domaines", title: "Domaines du portail", description: "Adresses par lesquelles les usagers atteignent les démarches en ligne", icon: Globe },
  { key: "utilisateurs", title: "Utilisateurs", description: "Membres et rôles de cette organisation", icon: UsersIcon },
  { key: "applications", title: "Applications souscrites", description: "Nora, Iris, Clara… — ce que cette collectivité a souscrit, et donc ce que chaque application voit", icon: AppWindow },
  { key: "categories", title: "Catégories", description: "Thématiques qui regroupent les démarches — obligatoires pour en créer", icon: Tags },
  { key: "demarches", title: "Catalogue de démarches", description: "Démarches de l'organisation principale", icon: ListChecks },
  { key: "activations", title: "Démarches activées", description: "Quel organisme de l'arbre propose quelle démarche", icon: ToggleRight },
  { key: "types-pieces", title: "Types de pièce justificative", description: "Pièces demandées dans les démarches", icon: FileCheck2 },
  { key: "documents", title: "Documents", description: "Modèles de documents et de courriers à variables", icon: FileSignature },
  { key: "quartiers", title: "Quartiers", description: "Découpage du territoire pour rattacher les usagers", icon: MapPin },
  { key: "smtp", title: "Emails (SMTP)", description: "Serveur SMTP utilisé pour les emails de cette organisation", icon: Mail },
  { key: "api", title: "API publique", description: "Clés d'accès des partenaires : référentiel, usagers, relais, assistant IA", icon: KeyRound },
  { key: "ia", title: "Assistant IA", description: "Plafond mensuel de jetons et consommation par application", icon: Gauge },
  { key: "assistant-portail", title: "Assistant du portail usagers", description: "Ouvrir l'assistant conversationnel du site de démarches, et le dépôt par la conversation", icon: MessagesSquare },
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
 *
 * Clés et libellés sont DÉRIVÉS de `SECTIONS` : une section ajoutée s'y déclare
 * une fois, pas dans trois listes à tenir alignées.
 */
const SECTION_KEYS = new Set<string>(SECTIONS.map((section) => section.key));

const SECTION_LABELS: Record<Section, string> = {
  menu: "",
  ...(Object.fromEntries(SECTIONS.map((section) => [section.key, section.title])) as Record<
    Exclude<Section, "menu">,
    string
  >),
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

  const rootOnly = (section: React.ReactNode, what: string) =>
    organization.parent_id === null ? (
      section
    ) : (
      <EmptyState message={`${what} au niveau de l'organisation principale (racine).`} />
    );

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
        {/* Le composant dit lui-même qu'une sous-organisation suit sa racine. */}
        {activeSection === "langues" && <LanguagesSection organization={organization} />}
        {activeSection === "usagers" && <UserInfoSection organization={organization} />}
        {/* Idem : la doctrine de la collectivité se règle sur sa racine. */}
        {activeSection === "agents" && <AgentGuidanceSection organization={organization} />}
        {activeSection === "domaines" && <DomainsSection organizationId={organization.id} />}
        {activeSection === "utilisateurs" && <UsersManagementPage organizationId={organization.id} />}
        {activeSection === "applications" &&
          rootOnly(<ApplicationsSection organizationId={organization.id} />, "Les applications se souscrivent")}
        {activeSection === "categories" &&
          rootOnly(<CategoriesManager organizationId={organization.id} />, "Les catégories se paramètrent")}
        {activeSection === "demarches" &&
          rootOnly(
            <ProceduresListPanel
              organizationId={organization.id}
              canDelete
              onNew={() =>
                navigate(`/superadmin/organisations/${organization.id}/demarches/nouveau`)
              }
              onEdit={(id) =>
                navigate(`/superadmin/organisations/${organization.id}/demarches/${id}`)
              }
            />,
            "Les démarches se paramètrent",
          )}
        {/* Sur toute organisation : le sélecteur couvre son sous-arbre. */}
        {activeSection === "activations" && <ActivationsSection organization={organization} />}
        {activeSection === "types-pieces" &&
          rootOnly(<DocumentTypesManager organizationId={organization.id} />, "Les types de pièce se paramètrent")}
        {activeSection === "documents" &&
          rootOnly(<DocumentTemplatesManager organizationId={organization.id} />, "Les documents se paramètrent")}
        {activeSection === "quartiers" &&
          rootOnly(<QuartiersManager organizationId={organization.id} />, "Les quartiers se paramètrent")}
        {activeSection === "smtp" && (
          <SmtpSettingsSection
            organizationId={organization.id}
            parentOrganizationId={organization.parent_id}
          />
        )}
        {activeSection === "api" &&
          rootOnly(<ApiKeysSection organizationId={organization.id} />, "Les clés API se gèrent")}
        {/* Un budget est une affaire de collectivité, pas de service : le
            plafond se pose sur la racine, et le trigger le garde en base. */}
        {activeSection === "ia" &&
          rootOnly(<AiUsageSection organizationId={organization.id} />, "Le plafond IA se règle")}
        {/* Le site est celui de la collectivité : l'interrupteur vit sur la
            racine, et le trigger le garde en base. */}
        {activeSection === "assistant-portail" &&
          rootOnly(
            <PortalAssistantSection organizationId={organization.id} />,
            "L'assistant du portail s'active",
          )}
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

      {/* La mise en service, en tête : c'est la première chose qu'un super
          administrateur veut savoir d'un client — où en est-on. Chaque ligne
          mène à sa section. Racines seulement : la RPC refuse le reste. */}
      {organization.parent_id === null ? (
        <OnboardingChecklistCard
          organizationId={organization.id}
          onOpen={(target) =>
            target.kind === "portal"
              ? navigate(`/superadmin/organisations/${organization.id}/portail`)
              : setActiveSection(target.section as Section)
          }
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Arborescence</h2>
        <OrganizationsManager
          canManageRoots
          rootOrganizationId={organization.id}
          onConfigure={(node: OrgNode) => navigate(`/superadmin/organisations/${node.id}`)}
        />
      </section>

      {/* L'éditeur du site a son propre shell plein écran : on y NAVIGUE, il ne
          se monte pas dans une section. Réservé aux racines, comme les démarches
          qu'il épingle. */}
      {organization.parent_id === null ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Site de démarches</h2>
          <Card
            className="cursor-pointer transition-all hover:border-primary/30 hover:shadow-socle-md"
            onClick={() => navigate(`/superadmin/organisations/${organization.id}/portail`)}
          >
            <CardHeader className="flex-row items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <LayoutTemplate className="size-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Composer la page d'accueil</CardTitle>
                <CardDescription>
                  Sections, démarches à la une, aperçu par appareil — brouillon enregistré
                  automatiquement, publication explicite
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </section>
      ) : null}

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
