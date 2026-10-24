import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Globe,
  Languages,
  Library,
  Lock,
  Mail,
  Palette,
  Settings2,
  ToggleRight,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { cn } from "@/lib/utils";
import {
  findRootAncestor,
  useAllOrganizations,
  useOrganization,
  type Organization,
} from "@/features/superadmin/organizations/useOrganizationsAdmin";
import { SmtpSettingsSection } from "@/features/superadmin/organizations/sections/SmtpSettingsSection";
import {
  ChildOrganizations,
  EmailSenderForm,
  GeneralInfoForm,
} from "@/features/organizations/OrganizationInfoTab";
import { OrganizationProceduresTab } from "@/features/organizations/OrganizationProceduresTab";
import { BrandingSection } from "@/features/organizations/BrandingSection";
import { DomainsSection } from "@/features/organizations/DomainsSection";
import { LanguagesSection } from "@/features/languages/LanguagesSection";
import { FreeMailSection } from "@/features/organizations/FreeMailSection";
import { hasUserInfoTab } from "@/features/organizations/userInfo";
import {
  currentOrgSection,
  organizationSectionGroups,
  type OrgSectionKey,
} from "@/features/organizations/organizationSections";

const ICONS: Record<OrgSectionKey, LucideIcon> = {
  general: Settings2,
  charte: Palette,
  "sous-organisations": Building2,
  domaines: Globe,
  langues: Languages,
  demarches: ToggleRight,
  emails: Mail,
};

/**
 * ⚠️ **CE QUE L'ORGANISME DIT N'EST PLUS ICI** (navigation v2, 2026-10-24) :
 * attributions, informations usagers et recommandations aux agents se
 * rédigent dans la rubrique « Connaissances », organisme par organisme. La
 * fiche y renvoie, sur l'organisme courant (`?org=`) — les recommandations,
 * qui ne vivent que sur la racine, sur l'organisation principale.
 */
function KnowledgeLinks({ organization, root }: { organization: Organization; root?: Organization }) {
  const links = [
    {
      to: `/connaissances/recommandations${root ? `?org=${root.id}` : ""}`,
      title:
        root && root.id !== organization.id
          ? `Recommandations (${root.name})`
          : "Recommandations aux agents",
    },
    { to: `/connaissances/attributions?org=${organization.id}`, title: "Attributions" },
    // Un service interne n'a pas d'informations usagers : le site ne l'affiche pas.
    ...(hasUserInfoTab(organization)
      ? [{ to: `/connaissances/informations-usagers?org=${organization.id}`, title: "Informations usagers" }]
      : []),
  ];
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Library aria-hidden="true" className="size-4" />
        Connaissances
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Ce que cet organisme dit à ses agents et au public se rédige dans la rubrique dédiée.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {link.title}
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Titre de section — seulement pour celles dont le contenu n'est pas déjà une
 * carte titrée (charte, langues, domaines, SMTP portent le leur) : deux fois
 * le même mot l'un sous l'autre ne dirait rien de plus.
 */
function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * Édition d'une organisation en pleine page (app par organisation).
 *
 * ⚠️ **UN MENU LATÉRAL EN TROIS GROUPES, PLUS UNE RANGÉE D'ONGLETS**
 * (navigation v2) : l'identité de l'organisme, sa présence sur le site de
 * démarches, l'envoi de ses e-mails. Section choisie en `?section=` — la
 * table est dans `organizationSections.ts` (pure, testée).
 */
export function OrganizationEditorPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: organization, isLoading } = useOrganization(orgId);
  const { data: organizations } = useAllOrganizations();

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

  const isRoot = organization.parent_id === null;
  const parent = organization.parent_id
    ? (organizations ?? []).find((o) => o.id === organization.parent_id)
    : undefined;
  const root = isRoot ? organization : findRootAncestor(organizations ?? [], organization.id);
  const groups = organizationSectionGroups(organization);
  const current = currentOrgSection(groups, searchParams.get("section"));

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
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{organization.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground">
              {isRoot
                ? "Organisation principale"
                : parent
                  ? `Sous-organisation de ${parent.name}`
                  : "Sous-organisation"}
            </p>
            {organization.is_internal_service ? <Badge variant="muted">Service interne</Badge> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 self-start">
          <nav aria-label="Sections de l'organisation" className="flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{group.label}</p>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const Icon = ICONS[item.key];
                    const active = item.key === current.key;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          aria-current={active ? "page" : undefined}
                          onClick={() => setSearchParams({ section: item.key }, { replace: true })}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "bg-primary/10 font-semibold text-primary" : "font-medium hover:bg-muted",
                          )}
                        >
                          <Icon aria-hidden="true" className="size-4 shrink-0" />
                          <span className="min-w-0 flex-1">{item.title}</span>
                          {item.inherited ? (
                            <span title="Réglé sur l'organisation principale">
                              <Lock aria-hidden="true" className="size-3.5 text-muted-foreground" />
                              <span className="sr-only"> (réglé sur l'organisation principale)</span>
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <KnowledgeLinks organization={organization} root={root} />
        </aside>

        {/* `key` : remontage (et réinitialisation des formulaires) au changement d'org ou de section. */}
        <section key={`${organization.id}-${current.key}`} aria-label={current.title} className="min-w-0">
          {current.key === "general" && (
            <>
              <SectionTitle title={current.title} description={current.description} />
              <GeneralInfoForm organization={organization} withEmailSender={false} />
            </>
          )}
          {current.key === "charte" && <BrandingSection organization={organization} />}
          {current.key === "sous-organisations" && (
            <>
              <SectionTitle title={current.title} description={current.description} />
              <ChildOrganizations organization={organization} />
            </>
          )}
          {current.key === "domaines" && <DomainsSection organizationId={organization.id} />}
          {current.key === "langues" && <LanguagesSection organization={organization} />}
          {current.key === "demarches" && (
            <div className="flex flex-col gap-6">
              <div>
                <SectionTitle title={current.title} description={current.description} />
                {/* Ce qu'un usager peut adresser à l'organisme depuis le site : ses démarches,
                    et un courrier libre hors démarche — jamais pour un service interne,
                    que le portail n'affiche pas. */}
                {hasUserInfoTab(organization) && <FreeMailSection organization={organization} />}
              </div>
              <OrganizationProceduresTab organizationId={organization.id} />
            </div>
          )}
          {current.key === "emails" && (
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Expéditeur</CardTitle>
                  <CardDescription>
                    Le nom qui apparaît comme expéditeur des e-mails de cet organisme.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EmailSenderForm organization={organization} />
                </CardContent>
              </Card>
              <SmtpSettingsSection
                organizationId={organization.id}
                parentOrganizationId={organization.parent_id}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
