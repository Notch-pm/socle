/**
 * DTO publics de l'API en lecture seule (contrat consommé en aval par Clara,
 * Ariane, partenaires…). **Découplés des colonnes DB** : ce fichier définit
 * exactement ce que l'API expose. Aucune dépendance (ni `@/`, ni Deno, ni Node)
 * → importable à la fois par la fonction Deno et par les tests vitest.
 *
 * Les blocs JSON possédés (`form_schema`, `requester_config`, `knowledge_base`,
 * `translations`, `metadata`) sont **transmis tels quels** ; leur structure est
 * documentée dans l'OpenAPI (voir `openapi.ts`), typée `unknown` ici.
 */

/** Organisation (ou sous-organisation) — configuration complète exposée. */
export interface OrganizationDto {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string | null;
  type: string | null;
  status: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  email_sender_override: boolean;
  email_sender_name: string | null;
  metadata: unknown;
  created_at: string | null;
}

/** Catégorie de démarches (libellé + icône). */
export interface CategoryDto {
  id: string;
  organization_id: string | null;
  name: string;
  icon: string | null;
  created_at: string | null;
}

/** Démarche — configuration intégrale (descriptif + JSON possédés). */
export interface ProcedureDto {
  id: string;
  organization_id: string | null;
  category_id: string | null;
  name: string;
  type: string;
  keywords: string[];
  short_description: string | null;
  user_description: string | null;
  agent_description: string | null;
  input_duration_minutes: number | null;
  order_index: number | null;
  requester_config: unknown;
  form_schema: unknown;
  knowledge_base: unknown;
  translations: unknown;
  created_at: string | null;
  updated_at: string | null;
}

/** Activation d'une démarche pour une organisation donnée. */
export interface OrganizationProcedureDto {
  organization_id: string | null;
  procedure_id: string | null;
  is_enabled: boolean;
  custom_name: string | null;
  custom_order: number | null;
  metadata: unknown;
}

/** Type de pièce justificative (référencé par les champs PJ des démarches). */
export interface DocumentTypeDto {
  id: string;
  organization_id: string;
  name: string;
  created_at: string | null;
}

/** Quartier : polygone du découpage du territoire d'une organisation principale. */
export interface QuartierDto {
  id: string;
  organization_id: string;
  name: string;
  color: string | null;
  /** Géométrie GeoJSON (MultiPolygon, WGS 84) — présente seulement si `geometry=true`. */
  geometry?: unknown;
  created_at: string | null;
  updated_at: string | null;
}

/** Réponse de génération d'URL signée pour un document privé. */
export interface SignedUrlDto {
  url: string;
  expires_at: string;
}

/**
 * Serveur d'envoi (SMTP) d'une organisation **principale**.
 *
 * ⚠️ **Seule donnée sensible servie par cette API**, et exception assumée à la
 * règle « aucune colonne sensible n'est exposée » : les applications de la
 * gamme (Iris…) expédient les mails de la collectivité **par son propre
 * relais**, et n'ont aucun autre moyen d'en obtenir les identifiants — le
 * Socle est la source de vérité, il ne peut pas se contenter de les garder.
 * L'accès est gardé trois fois côté `index.ts` : scope **`smtp`** explicite sur
 * la clé, organisation dans le périmètre de la clé, et **racine uniquement**.
 *
 * `configured = false` ⇒ aucun relais n'est défini (ou il est incomplet) :
 * tous les autres champs sont nuls, et le consommateur doit retomber sur son
 * propre repli plutôt que d'expédier avec une configuration bancale.
 */
export interface SmtpSettingsDto {
  organization_id: string;
  /** Organisation qui porte réellement le relais (elle-même, ou l'ancêtre dont elle hérite). */
  source_organization_id: string | null;
  configured: boolean;
  host: string | null;
  port: number | null;
  username: string | null;
  password: string | null;
  from_email: string | null;
  from_name: string | null;
  use_tls: boolean | null;
  updated_at: string | null;
}
