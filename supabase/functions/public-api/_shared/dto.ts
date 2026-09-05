/**
 * DTO publics de l'API en lecture seule (contrat consommé en aval par Clara,
 * Ariane, partenaires…). **Découplés des colonnes DB** : ce fichier définit
 * exactement ce que l'API expose. Aucune dépendance (ni `@/`, ni Deno, ni Node)
 * → importable à la fois par la fonction Deno et par les tests vitest.
 *
 * Les blocs JSON possédés (`form_schema`, `requester_config`, `knowledge_base`,
 * `communication_config`, `translations`, `metadata`) sont **transmis tels quels** ;
 * leur structure est documentée dans l'OpenAPI (voir `openapi.ts`), typée
 * `unknown` ici.
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
  /**
   * Cycle de vie du paramétrage : `brouillon` (en cours d'écriture) ou
   * `production` (déclarée prête). ⚠️ Distinct de la visibilité : `status` dit
   * si la configuration est finie, `communication_config.visibility` dit où et
   * quand la proposer.
   */
  status: string;
  keywords: string[];
  short_description: string | null;
  user_description: string | null;
  agent_description: string | null;
  input_duration_minutes: number | null;
  order_index: number | null;
  requester_config: unknown;
  form_schema: unknown;
  knowledge_base: unknown;
  /**
   * Paramètres de communication, **transmis tels quels** (blocs `visibility` et
   * `documents`). Pour les documents, préférez le champ `documents` ci-dessous :
   * il est déjà résolu contre le catalogue.
   */
  communication_config: unknown;
  /**
   * Documents et courriers accessibles à l'agent, **résolus** (libellé, type,
   * nom de fichier) — de quoi les afficher sans second appel. Reconstruire cette
   * liste depuis `communication_config` obligerait chaque application à
   * réécrire (différemment) la même résolution.
   */
  documents: ProcedureDocumentsDto;
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

/**
 * Document du catalogue (`document_templates`) : un modèle `.doc`/`.docx`/`.odt`
 * porteur de variables, que l'application aval fusionne avec les données du
 * dossier. Le fichier lui-même s'obtient par
 * `GET /v1/document-templates/{id}/signed-url`.
 */
export interface DocumentTemplateDto {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  /** `interne`, `externe` ou `courrier`. */
  type: string;
  /** Nom d'origine du fichier déposé (affichable). */
  file_name: string;
  created_at: string | null;
  updated_at: string | null;
}

/** Un document rendu accessible à l'agent depuis une démarche, déjà résolu. */
export interface ProcedureDocumentDto {
  id: string;
  name: string;
  description: string | null;
  /** `interne`, `externe` ou `courrier` (type au catalogue). */
  type: string;
  /**
   * Sous-groupe de l'étape Communication : `courrier` pour les modèles de
   * courrier, `document` pour les types `interne`/`externe`.
   */
  group: string;
  file_name: string;
  /**
   * `toujours`, `positive` ou `negative` (issue de la demande).
   * ⚠️ **Sans effet** tant que `restrict_visibility` est faux.
   */
  visibility: string;
}

/** Bloc « Documents et courriers » d'une démarche, résolu contre le catalogue. */
export interface ProcedureDocumentsDto {
  /**
   * ⚠️ Faux (le défaut) : servez **tous** les `items`, quelles que soient leurs
   * `visibility`. Les conditions sont conservées quand le paramétreur désactive
   * la restriction — les appliquer sans regarder ce drapeau masquerait à tort.
   */
  restrict_visibility: boolean;
  /** Dans l'ordre choisi au paramétrage. Un document supprimé du catalogue en disparaît. */
  items: ProcedureDocumentDto[];
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

/**
 * Charte graphique **applicable** à une organisation : logos et couleurs, avec
 * l'héritage **déjà résolu** (Socle du 2026-08-30).
 *
 * Pourquoi une ressource à part plutôt que quatre colonnes de plus sur
 * `OrganizationDto` : une organisation qui hérite porte des colonnes **nulles**
 * en propre. Servies brutes, elles feraient peindre du vide au consommateur
 * alors que la charte de sa collectivité en résout une — et chaque application
 * de la gamme réécrirait la même remontée d'arbre, en se trompant différemment.
 * Ici la remontée est faite une fois, en base (`resolve_branding`).
 *
 * `source_organization_id` dit **qui porte** la charte servie, et `inherited`
 * si ce n'est pas l'organisation demandée : de quoi afficher « charte héritée
 * de la Ville de X » sans second appel.
 *
 * `configured = false` ⇒ aucun élément n'est défini nulle part au-dessus : le
 * consommateur retombe sur son propre habillage par défaut. Ce n'est pas une
 * erreur, c'est le cas d'une collectivité qui n'a pas encore rempli sa charte.
 */
export interface BrandingDto {
  organization_id: string;
  /** Organisation qui porte la charte servie (elle-même, ou l'ancêtre dont elle hérite). */
  source_organization_id: string | null;
  /** `true` quand la charte vient d'un ancêtre, pas de l'organisation demandée. */
  inherited: boolean;
  configured: boolean;
  /** Logo couleur (URL). */
  logo_url: string | null;
  /** Logo blanc (URL), pour les fonds sombres. */
  logo_white_url: string | null;
  /** Couleur principale, `#rrggbb` minuscule. */
  primary_color: string | null;
  /** Couleur secondaire, `#rrggbb` minuscule. */
  secondary_color: string | null;
}
