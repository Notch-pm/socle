import type { Organization } from "@/features/superadmin/organizations/orgTree";

export type OrgSectionKey =
  | "general"
  | "charte"
  | "sous-organisations"
  | "domaines"
  | "langues"
  | "demarches"
  | "emails";

export interface OrgSection {
  key: OrgSectionKey;
  title: string;
  description: string;
  /**
   * Réglé sur l'organisation principale : la section s'ouvre quand même sur
   * une sous-organisation (elle le dit et renvoie à la racine), le menu
   * l'annonce d'un cadenas.
   */
  inherited?: boolean;
}

export interface OrgSectionGroup {
  label: string;
  items: OrgSection[];
}

/** Section ouverte quand l'URL n'en demande pas (ou en demande une absente). */
export const DEFAULT_ORG_SECTION: OrgSectionKey = "general";

/**
 * Menu de l'éditeur d'organisation (navigation v2, 2026-10-24) : **trois
 * groupes** — ce qu'est l'organisme, ce qu'il montre sur le site de
 * démarches, comment il envoie ses e-mails.
 *
 * - ⚠️ « Domaines » est retiré d'un **service interne** : le site ne
 *   l'affiche pas, il n'a pas d'adresse à y tenir.
 * - « Langues » reste sur une sous-organisation, cadenassée : le réglage vit
 *   sur la racine et l'écran le dit (`LanguagesSection`).
 * - « Démarches proposées » reste sur un service interne : il instruit, c'est
 *   même souvent lui qui active (le courrier libre, lui, y est retiré).
 */
export function organizationSectionGroups(
  organization: Pick<Organization, "parent_id" | "is_internal_service">,
): OrgSectionGroup[] {
  const isRoot = organization.parent_id === null;
  const internal = organization.is_internal_service === true;
  const groups: OrgSectionGroup[] = [
    {
      label: "Identité",
      items: [
        {
          key: "general",
          title: "Informations générales",
          description: "Nom, coordonnées, slug et organisation parente.",
        },
        {
          key: "charte",
          title: "Charte graphique",
          description: "Logos, favicon et couleurs repris par les applications de la gamme.",
        },
        {
          key: "sous-organisations",
          title: "Sous-organisations",
          description: "Organisations rattachées directement à celle-ci.",
        },
      ],
    },
    {
      label: "Site de démarches",
      items: [
        ...(internal
          ? []
          : [
              {
                key: "domaines" as const,
                title: "Domaines",
                description: "Adresses par lesquelles les usagers atteignent les démarches en ligne.",
              },
            ]),
        {
          key: "langues",
          title: "Langues",
          description: "Langues des libellés des démarches et des catégories.",
          inherited: !isRoot,
        },
        {
          key: "demarches",
          title: "Démarches proposées",
          description: "Ce que cet organisme propose aux usagers, et le courrier libre.",
        },
      ],
    },
    {
      label: "Envoi des e-mails",
      items: [
        {
          key: "emails",
          title: "Expéditeur et SMTP",
          description: "Nom d'expéditeur et serveur utilisé pour les e-mails de cet organisme.",
        },
      ],
    },
  ];
  return groups;
}

/** Section affichée : celle de l'URL si elle existe pour cet organisme, sinon la première. */
export function currentOrgSection(groups: OrgSectionGroup[], requested: string | null): OrgSection {
  const all = groups.flatMap((g) => g.items);
  return (
    all.find((s) => s.key === requested) ??
    all.find((s) => s.key === DEFAULT_ORG_SECTION) ??
    all[0]
  );
}
