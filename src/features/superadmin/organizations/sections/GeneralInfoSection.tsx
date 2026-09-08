import { GeneralInfoForm } from "@/features/organizations/OrganizationInfoTab";
import type { Organization } from "@/features/superadmin/organizations/useOrganizationsAdmin";

/**
 * Informations générales d'une organisation, côté superadmin.
 *
 * Le formulaire est celui de l'app par organisation (`GeneralInfoForm`) : nom,
 * parent, adresse, téléphone, courriel, type, slug, expéditeur spécifique,
 * service interne. Avant, cette section n'exposait que nom / slug / type /
 * parent : l'adresse et les coordonnées se saisissaient à la création, puis
 * plus jamais côté superadmin — alors qu'elles alimentent le preset « Contact
 * et horaires » du portail et les variables `organisme.*` des documents.
 */
export function GeneralInfoSection({ organization }: { organization: Organization }) {
  return <GeneralInfoForm organization={organization} />;
}
