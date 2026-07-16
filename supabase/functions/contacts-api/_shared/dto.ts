/**
 * DTO de l'API usagers (contrat consommé en aval par Ariane, Clara, Iris,
 * portail citoyen). **Découplés des colonnes DB** : ce fichier définit
 * exactement ce que l'API expose. Aucune dépendance (ni `@/`, ni Deno, ni Node)
 * → importable à la fois par la fonction Deno et par les tests vitest.
 *
 * ⚠️ `internal_notes` est exposée : cette API est **serveur-à-serveur** pour les
 * applications agents. Un consommateur qui sert des usagers finaux (portail
 * citoyen) ne doit **jamais** leur retransmettre ce champ.
 */

/** Rôle porté par un contact (référence courte embarquée dans le contact). */
export interface ContactRoleRefDto {
  id: string;
  name: string;
}

/** Référence du contact dans un logiciel tiers. */
export interface ContactExternalReferenceDto {
  id: string;
  source: string;
  external_id: string;
  created_at: string | null;
  updated_at: string | null;
}

/** L'autre bout d'une relation entre contacts (référence courte). */
export interface ContactRelationPeerDto {
  id: string;
  display_name: string | null;
  contact_type: string;
}

/**
 * Relation dirigée entre deux contacts : dans `relations`, le contact porteur
 * est <rôle> de `contact` (ex. Gérant de la Boulangerie) ; dans
 * `reverse_relations`, `contact` est <rôle> du contact porteur.
 */
export interface ContactRelationDto {
  id: string;
  role: ContactRoleRefDto;
  contact: ContactRelationPeerDto;
}

/** Usager — fiche complète (identité, coordonnées, préférences, rôles, refs). */
export interface ContactDto {
  id: string;
  organization_id: string;
  contact_type: string;
  civility: string | null;
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  birth_date: string | null;
  legal_name: string | null;
  siret: string | null;
  display_name: string | null;
  email: string | null;
  mobile_phone: string | null;
  landline_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  preferred_channel: string | null;
  consent_email: boolean;
  consent_sms: boolean;
  internal_notes: string | null;
  status: string;
  roles: ContactRoleRefDto[];
  external_references: ContactExternalReferenceDto[];
  /** Ce contact est <rôle> de… (relations sortantes). */
  relations: ContactRelationDto[];
  /** … est <rôle> de ce contact (relations entrantes). */
  reverse_relations: ContactRelationDto[];
  created_at: string | null;
  updated_at: string | null;
}

/** Entrée du catalogue de rôles de l'organisation. */
export interface ContactRoleDto {
  id: string;
  organization_id: string;
  name: string;
  created_at: string | null;
}
