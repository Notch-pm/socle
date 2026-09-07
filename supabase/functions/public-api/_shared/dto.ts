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
  /** Libellé **en français** — la langue pivot du référentiel. */
  name: string;
  icon: string | null;
  /**
   * Libellés traduits, `{ "<code de langue>": { "name": "…" } }`. Jamais de clé
   * `fr` : le français est `name`. Une langue absente n'est pas un trou, c'est
   * un **repli sur `name`** — voir `GET /v1/portal/tenant` pour les langues
   * activées par la collectivité.
   */
  translations: unknown;
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

/**
 * Collectivité derrière un domaine du portail usagers — réponse de
 * `GET /v1/portal/tenant`.
 *
 * Volontairement **minimal**, et distinct d'`OrganizationDto` : c'est le seul
 * DTO de cette API dont le consommateur est un serveur qui rend des pages
 * **publiques**. Il porte donc de quoi identifier et nommer la collectivité,
 * rien de plus — pas d'adresse, pas de téléphone, pas de `metadata`, pas de
 * réglages d'expéditeur. Ce dont le portail a besoin en plus (charte graphique)
 * a déjà sa route, avec son héritage résolu.
 *
 * `hostname` renvoie le domaine **tel que résolu** (normalisé) : le portail sait
 * ainsi sur quelle clé le tenant a été trouvé, sans refaire la normalisation.
 */
export interface TenantDto {
  id: string;
  name: string;
  slug: string | null;
  hostname: string;
  /**
   * Langues activées par la collectivité (codes BCP 47), **français toujours
   * compris et toujours en tête**. C'est de quoi bâtir un sélecteur de langue :
   * les libellés traduits des démarches et des catégories sont servis dans ces
   * langues-là (`translations`), avec repli sur le français.
   *
   * ⚠️ Le réglage vit sur l'organisation **principale** : la liste est celle de
   * la collectivité, même quand le domaine visité désigne une sous-organisation
   * (héritage **déjà résolu**, comme la charte graphique).
   */
  languages: string[];
}

/**
 * Démarche telle qu'un USAGER la voit sur le portail — réponse de
 * `GET /v1/portal/procedures`.
 *
 * Whitelist beaucoup plus étroite que `ProcedureDto`, et c'est tout l'objet de
 * la route : le paramétrage d'une démarche contient de quoi INSTRUIRE
 * (`agent_description`, `knowledge_base`, `form_schema`, `requester_config`,
 * `documents`). Rien de tout cela n'a à traverser un portail public — un
 * consommateur qui filtrerait `ProcedureDto` côté client aurait déjà fait
 * transiter ce qu'il masque.
 *
 * `user_description` **et** `short_description` sont servis : le paramétrage ne
 * rend obligatoire ni l'un ni l'autre, et une collectivité qui n'a rempli que
 * l'un des deux doit tout de même avoir quelque chose à afficher.
 *
 * `organizations` : les organismes de l'arbre de la collectivité qui
 * **proposent** la démarche (activation par organisation), dans l'ordre de
 * l'arbre. Jamais vide — une démarche que personne n'active n'est pas servie.
 */
export interface PortalProcedureDto {
  id: string;
  name: string;
  /** Résumé court, pour une liste. */
  short_description: string | null;
  /** Descriptif destiné à l'usager. */
  user_description: string | null;
  /** Durée de saisie estimée, en minutes. */
  input_duration_minutes: number | null;
  /** Organismes qui proposent la démarche, dans l'ordre de l'arbre. */
  organizations: PortalOrganizationRefDto[];
  /**
   * Libellés traduits, `{ "<code de langue>": { "name": "…" } }` — mêmes règles
   * que `CategoryDto.translations` (pas de clé `fr`, repli sur `name`).
   */
  translations: unknown;
}

/** Un organisme qui propose une démarche sur le portail : de quoi le nommer, rien de plus. */
export interface PortalOrganizationRefDto {
  id: string;
  name: string;
}

/** Catégorie d'une démarche, telle qu'un usager la lit : de quoi la nommer. */
export interface PortalCategoryRefDto {
  id: string;
  name: string;
  /** Mêmes règles que `CategoryDto.translations` (pas de clé `fr`, repli sur `name`). */
  translations: unknown;
}

/**
 * Démarche du portail dans sa version DÉTAILLÉE — réponse de
 * `GET /v1/portal/procedures/{id}`, ce qu'il faut pour afficher une démarche
 * et la faire remplir.
 *
 * Elle ajoute au public de la liste les deux schémas de SAISIE :
 * `form_schema` (les questions de la démarche) et `requester_config` (les
 * publics admis et les informations demandées au requérant). Ces deux-là ne
 * sont pas du paramétrage d'instruction — ils SONT le formulaire de l'usager,
 * et sans eux aucun portail ne peut afficher autre chose qu'un titre.
 *
 * Ce qui ne franchit toujours pas : `knowledge_base`, `agent_description` et
 * les documents de la communication. Ce qu'un agent lit pour instruire n'a
 * rien à faire dans le navigateur d'un usager.
 */
export interface PortalProcedureDetailDto extends PortalProcedureDto {
  /** Catégorie de la démarche, `null` si elle n'en a pas. */
  category: PortalCategoryRefDto | null;
  /**
   * Schéma de formulaire possédé par le Socle (`{ version: 1, content: [...] }`).
   * `null` quand la démarche n'a pas encore de formulaire — le portail affiche
   * alors la démarche sans saisie, ce n'est pas une erreur.
   */
  form_schema: unknown;
  /**
   * Publics admis et informations demandées au requérant, par public
   * (`{ citoyen: { enabled, fields: { courriel: "obligatoire", … } }, … }`).
   * `null` = jamais paramétré : aucun public n'est proposé.
   */
  requester_config: unknown;
}

/**
 * Composition publiée d'une page du portail usagers — réponse de
 * `GET /v1/portal/page`.
 *
 * Sections typées par `kind`. Le contrat promet deux choses au consommateur :
 * il ne recevra que des sections que cette version du serveur sait décrire
 * (un kind inconnu est écarté, pas servi brut), et les références de
 * démarches (`pinned`, `shortcuts`) sont **déjà résolues** — elles ne portent
 * que des démarches publiées. Un consommateur doit néanmoins **ignorer** un
 * kind qu'il ne connaît pas : le serveur peut en apprendre avant lui.
 */
/**
 * Textes d'une section traduits, indexés par code de langue.
 *
 * Les clés d'une langue sont celles des textes de la section — `title`, et
 * selon le `kind` `subtitle`, `placeholder`, `body`. ⚠️ Trois règles, les
 * mêmes que pour `Translations` : jamais de clé `fr` (le français est le champ
 * de même nom) ; un texte absent est un **repli sur le champ français**, pas un
 * texte vide ; et le repli se fait **champ par champ** — une langue peut porter
 * le titre traduit sans le paragraphe, c'est le cas normal.
 */
export type PortalSectionTranslationsDto = Record<
  string,
  Partial<Record<"title" | "subtitle" | "placeholder" | "body", string>>
>;

export interface PortalRechercheSectionDto {
  id: string;
  kind: "recherche";
  title: string;
  subtitle: string;
  placeholder: string;
  show_shortcuts: boolean;
  /** Démarches en raccourci (identifiants de démarches publiées). */
  shortcuts: string[];
  translations: PortalSectionTranslationsDto;
}

export interface PortalDemarchesSectionDto {
  id: string;
  kind: "demarches";
  title: string;
  columns: 2 | 3 | 4;
  pinned_first: boolean;
  /** Démarches à la une (identifiants de démarches publiées). */
  pinned: string[];
  translations: PortalSectionTranslationsDto;
}

export interface PortalActusSectionDto {
  id: string;
  kind: "actus";
  title: string;
  layout: "grid" | "list";
  count: 2 | 3 | 4;
  show_dates: boolean;
  translations: PortalSectionTranslationsDto;
}

export interface PortalCompteSectionDto {
  id: string;
  kind: "compte";
  title: string;
  subtitle: string;
  translations: PortalSectionTranslationsDto;
}

export interface PortalTexteSectionDto {
  id: string;
  kind: "texte";
  title: string;
  body: string;
  align: "left" | "center";
  translations: PortalSectionTranslationsDto;
}

export type PortalSectionDto =
  | PortalRechercheSectionDto
  | PortalDemarchesSectionDto
  | PortalActusSectionDto
  | PortalCompteSectionDto
  | PortalTexteSectionDto
  | PortalFooterSectionDto;

export interface PortalPageDto {
  slug: string;
  /** Date de la publication servie (ISO 8601). */
  published_at: string;
  version: 1;
  sections: PortalSectionDto[];
}

/**
 * Pied de page : pleine largeur, couleur de fond, sous-blocs texte répartis sur
 * une à trois colonnes dans l'ordre. `children` ne porte que des bandeaux texte.
 */
export interface PortalFooterSectionDto {
  id: string;
  kind: "footer";
  title: string;
  /** `#rrggbb` minuscule. */
  background: string;
  columns: 1 | 2 | 3;
  children: PortalTexteSectionDto[];
  translations: PortalSectionTranslationsDto;
}
