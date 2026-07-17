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
  /** Coordonnées WGS 84 de l'adresse (géocodage BAN, ou fournies à l'écriture). */
  address_lat: number | null;
  address_lon: number | null;
  /** Quartier de rattachement (voir /v1/quartiers de l'API référentiel). */
  quartier_id: string | null;
  /** true = rattachement automatique d'après l'adresse ; false = forcé manuellement. */
  quartier_auto: boolean;
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

/**
 * Motif de rapprochement (POST /v1/contacts/match) : `email` / `phone` /
 * `siret` = égalités normalisées ; `name_exact` = nom complet normalisé
 * identique (sans accents ni casse ni ponctuation) ; `name_similar` =
 * similarité trigram ; `birth_date` = renfort (jamais suffisant seul).
 */
export type ContactMatchReason =
  | "email"
  | "phone"
  | "siret"
  | "name_exact"
  | "name_similar"
  | "birth_date";

/**
 * Candidat au rapprochement d'identités : la fiche **complète** (même
 * sérialiseur que `GET /v1/contacts`), un score de classement (à ne comparer
 * qu'au sein d'une même réponse) et les motifs du rapprochement.
 */
export interface ContactMatchDto {
  contact: ContactDto;
  score: number;
  reasons: ContactMatchReason[];
}

/** Entrée du catalogue de rôles de l'organisation. */
export interface ContactRoleDto {
  id: string;
  organization_id: string;
  name: string;
  created_at: string | null;
}
