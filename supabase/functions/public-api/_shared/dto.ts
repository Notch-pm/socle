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

/** Réponse de génération d'URL signée pour un document privé. */
export interface SignedUrlDto {
  url: string;
  expires_at: string;
}
