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
  /**
   * `true` = l'organisation n'est pas un guichet usager : elle instruit, mais
   * le portail la présente sous le nom de son premier ancêtre qui n'est pas un
   * service interne. À ne pas proposer à un usager final.
   *
   * Contrairement aux colonnes de charte graphique, la valeur brute ne ment
   * pas : il n'y a pas d'héritage à résoudre.
   */
  is_internal_service: boolean;
  email_sender_override: boolean;
  email_sender_name: string | null;
  metadata: unknown;
  created_at: string | null;
}

/**
 * Attributions d'un organisme — élément de
 * `GET /v1/organizations/attributions?tenant_id=` (contrat 1.33.0) : ce qu'il
 * traite et ce qu'il ne traite pas, pour orienter demandes et courriers.
 *
 * ⚠️ **Interne** : destiné aux agents et à leurs outils IA, jamais au portail
 * (ni aux usagers, ni à l'assistant du portail). ⚠️ Services internes
 * **compris**. Seuls les organismes actifs qui ont écrit quelque chose sont
 * listés ; pas d'héritage.
 */
export interface OrganizationAttributionsDto {
  id: string;
  name: string;
  is_internal_service: boolean;
  /** Markdown, en français, 2 000 caractères au plus, jamais vide. */
  attributions: string;
  /** Dernier enregistrement (ISO 8601). */
  updated_at: string | null;
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

/**
 * Démarche d'un PARTENAIRE (Arpège…) : elle se dépose chez le partenaire, par
 * l'application de la gamme qui exécute l'intégration. Servie aux seules
 * applications rattachées à l'intégration ; jamais au portail.
 */
export interface ProcedurePartnerDto {
  /** Slug de l'intégration au catalogue (`arpege`). */
  integration: string | null;
  /** Code de la démarche chez le partenaire (Arpège : CodeQualificationTypeDemande). */
  reference: string;
  /**
   * Données du partenaire, **opaques pour le Socle**, transmises telles quelles
   * (Arpège : `CodeQualificationMetier`, `ConfigInfoUsagerObligs`,
   * `FormComponents` — le formulaire à présenter).
   */
  config: unknown;
}

/** Démarche — configuration intégrale (descriptif + JSON possédés). */
export interface ProcedureDto {
  id: string;
  organization_id: string | null;
  category_id: string | null;
  name: string;
  type: string;
  /**
   * `null` = démarche du Socle. Sinon démarche PARTENAIRE : elle se dépose chez
   * le partenaire, jamais dans Iris ni au portail — et seules les applications
   * rattachées à son intégration la reçoivent.
   */
  partner: ProcedurePartnerDto | null;
  /**
   * Cycle de vie du paramétrage : `brouillon` (en cours d'écriture) ou
   * `production` (déclarée prête). ⚠️ Distinct de la visibilité : `status` dit
   * si la configuration est finie, `communication_config.visibility` dit où et
   * quand la proposer.
   */
  status: string;
  /**
   * Conditions d'accès pour l'usager : `libre` (aucun compte requis) ou
   * `authentifie` (l'usager doit être connecté à son espace pour déposer).
   *
   * ⚠️ **Ce n'est pas une règle de publication** : une démarche réservée est
   * publiée comme les autres et doit se voir au catalogue — c'est là que
   * l'usager apprend qu'il doit se connecter. Ce champ dit à quelles
   * CONDITIONS on la dépose, pas si on la montre.
   */
  access_mode: "libre" | "authentifie";
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
   * Ce que la collectivité écrit POUR SES USAGERS — **transmis tel quel**.
   * Quatre blocs : `delays` (durée habituelle d'INSTRUCTION, valeur + unité),
   * `audience.note` (précision éditoriale), `attachments.items` (pièces
   * annoncées) et `faq.items` (questions fréquentes). `null` = la collectivité
   * n'a rien écrit ; les défauts de cette colonne sont VIDES, à l'inverse de
   * `communication_config` dont un `null` se lit « visible ».
   *
   * ⚠️ **Le descriptif usager n'est PAS ici** : c'est `user_description`, servi
   * à côté, et rédigé en **Markdown** depuis le 2026-09-18.
   * ⚠️ **`delays` n'est pas `input_duration_minutes`** : celui-ci dit combien de
   * temps l'usager met à REMPLIR, celui-là combien de temps la collectivité met
   * à RÉPONDRE. L'unité est dans la donnée, jamais déduite du nombre, et `0`
   * n'existe pas — ce serait promettre une réponse immédiate.
   * ⚠️ **`audience.note` ne filtre rien** : les publics admis restent
   * `audiences`, dérivé de `requester_config`. En cas de contradiction,
   * `audiences` fait foi.
   * ⚠️ **`attachments.items` n'est pas la liste des pièces à téléverser** : ce
   * sont les champs `attachment` de `form_schema`. Celle-ci est un texte
   * d'annonce, qui peut les recouper. Ne les concaténez pas.
   * ⚠️ **Deux FAQ existent, une seule sort** : celle de `knowledge_base` est
   * écrite pour l'agent et n'a jamais traversé vers un portail public.
   * **Traductions** (1.26.0) : la note, chaque pièce et chaque question portent
   * leurs propres `translations` (clés = leurs champs français), à replier
   * champ par champ. Le descriptif traduit, lui, est dans `translations`.
   */
  user_communication: unknown;
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
  /** Favicon (URL) : l'icône de l'onglet du navigateur, sur le site de démarches. */
  favicon_url: string | null;
  /** Couleur principale, `#rrggbb` minuscule. */
  primary_color: string | null;
  /** Couleur secondaire, `#rrggbb` minuscule. */
  secondary_color: string | null;
}

/**
 * Les cinq rubriques des recommandations aux agents — JSON possédé, mêmes clés
 * que `src/features/organizations/agentGuidance.ts` (et, pour la FAQ et les
 * liens, mêmes formes que `knowledge_base`). Textes en Markdown.
 */
export interface AgentGuidanceBody {
  roleDescription: string;
  physicalReception: string;
  guidelines: Array<{ title: string; text: string }>;
  faq: Array<{ question: string; answer: string }>;
  recommendedSources: Array<{ url: string; description: string }>;
}

/**
 * Recommandations aux agents **applicables** à une organisation (2026-09-19) :
 * ce que la collectivité dit à ses agents pour toutes ses démarches à la fois.
 * Elles se rédigent sur l'organisation principale ; une sous-organisation reçoit
 * celles de sa racine, et `source_organization_id` dit laquelle les porte.
 *
 * ⚠️ **Interne** : destiné aux applications côté agent (et à leur assistant IA),
 * jamais à un usager — aucune route `/v1/portal/*` ne le sert.
 *
 * `configured = false` ⇒ rien d'écrit : les rubriques sont vides, pas absentes.
 */
export interface AgentGuidanceDto {
  organization_id: string;
  /** Organisation qui porte les recommandations servies (aujourd'hui, la racine) ; `null` si rien n'est écrit. */
  source_organization_id: string | null;
  configured: boolean;
  /** Dernier enregistrement ; `null` si rien n'est écrit. */
  updated_at: string | null;
  guidance: AgentGuidanceBody;
}

/**
 * Les quatre rubriques des informations à destination des usagers — JSON
 * possédé, mêmes clés que `src/features/organizations/userInfo.ts` (et, pour la
 * FAQ, même forme que `knowledge_base.faq`). Textes en Markdown, en français.
 */
export interface UserInfoBody {
  description: string;
  /**
   * Jours d'ouverture, dans l'ordre de la semaine, un au plus par jour. Un jour
   * absent est **fermé** ; une liste vide = horaires non renseignés.
   */
  openingHours: DayOpeningHoursDto[];
  /**
   * Remarques sur les horaires (Markdown) : fermetures exceptionnelles, jours
   * fériés, horaires d'été… Elles **nuancent** la grille : lisez-les avant
   * d'affirmer qu'un organisme est ouvert.
   */
  openingHoursNotes: string;
  faq: Array<{ question: string; answer: string }>;
}

/**
 * Horaires d'un jour d'ouverture, en `HH:MM` (24 h, heure locale). Ouverture et
 * fermeture toujours présentes ; la pause de midi (`morningClose` →
 * `afternoonOpen`) vaut `null` des deux côtés quand l'accueil est continu.
 * Heures strictement croissantes.
 */
export interface DayOpeningHoursDto {
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  morningOpen: string;
  morningClose: string | null;
  afternoonOpen: string | null;
  afternoonClose: string;
}

/**
 * Un organisme du portail et ce qu'il dit à ses usagers — élément de
 * `GET /v1/portal/organizations` (contrat 1.30.0) : descriptif, horaires
 * d'accueil, FAQ.
 *
 * ⚠️ **Public** : c'est fait pour être affiché, et c'est le corpus de
 * l'assistant du portail pour « à quelle heure ouvre la mairie ? ». Pendant
 * usager d'`AgentGuidanceDto`, qui reste interne.
 *
 * Seuls les organismes **affichés** (actifs, pas service interne) qui ont
 * **écrit** quelque chose, renseigné une coordonnée ou **ouvert le courrier
 * libre** sont listés. Pas d'héritage : un organisme absent de
 * la liste n'a rien dit, il n'emprunte pas les horaires de son parent.
 */
export interface PortalOrganizationInfoDto {
  id: string;
  name: string;
  /** Adresse de l'organisme sur le portail (`/<slug>`), ou `null`. */
  slug: string | null;
  /** C'est la collectivité du domaine elle-même (toujours en tête de liste). */
  is_tenant: boolean;
  /**
   * Téléphone et courriel de la fiche de l'organisme (onglet « Informations de
   * base »), `null` si non renseignés — 1.31.0. Pas d'héritage non plus.
   */
  phone: string | null;
  email: string | null;
  /** Dernier enregistrement des informations usagers (ISO 8601), `null` si rien d'écrit. */
  updated_at: string | null;
  info: UserInfoBody;
  /**
   * Le courrier libre de l'organisme sur le portail (contrat 1.38.0). Toujours
   * présent, jamais `null`.
   */
  free_mail: PortalFreeMailDto;
}

/**
 * Courrier libre d'un organisme : l'usager lui écrit, depuis le portail, un
 * courrier qui ne relève d'aucune démarche ; Clara le reçoit (contrat 1.38.0).
 *
 * ⚠️ Le commutateur s'applique **à la frontière** (motif `PortalAssistantDto`) :
 * `enabled` n'est `true` que si l'organisme l'a ouvert **et** que sa
 * collectivité est abonnée à Clara. Un consommateur lit le booléen tel quel.
 */
export interface PortalFreeMailDto {
  /** Le portail propose d'écrire un courrier libre à cet organisme. */
  enabled: boolean;
  /**
   * Titre saisi (trimé, 80 caractères au plus), ou `null` : le portail met alors
   * son libellé par défaut, traduit. Servi même quand `enabled` est `false`
   * (le réglage gouverne l'usage, pas la donnée).
   */
  title: string | null;
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
  /**
   * Le thème PUBLIÉ du site de démarches : typographie, formes, densité,
   * en-tête, accessibilité. Il vaut pour **toutes les pages** du portail —
   * c'est pourquoi il voyage avec le tenant plutôt qu'avec une page.
   *
   * ⚠️ **Toujours présent, jamais `null`.** Une collectivité qui n'a rien
   * publié reçoit les **défauts du Socle** : les laisser inventer au
   * consommateur ferait deux jeux de valeurs, qui finiraient par diverger.
   * Un réglage ajouté plus tard arrivera de la même façon — avec sa valeur par
   * défaut, jamais un trou.
   *
   * ⚠️ **Il ne porte AUCUNE couleur.** Celles-ci viennent de
   * `GET /v1/organizations/{id}/branding` (héritage déjà résolu). Le thème dit
   * COMMENT peindre, la charte dit AVEC QUOI — et une collectivité ne choisit
   * ses couleurs qu'une fois, pour toute la gamme.
   */
  theme: PortalThemeDto;
  /**
   * L'assistant conversationnel du portail — ce que la collectivité a OUVERT
   * (contrat 1.28.0). Réglé par le super administrateur, sur l'organisation
   * principale ; l'héritage est **déjà résolu**.
   *
   * ⚠️ **Toujours présent, jamais `null`** : une collectivité qui n'a rien réglé
   * reçoit `{ enabled: false, deposit_enabled: false, voice_enabled: false }`.
   *
   * ⚠️ Trois faits publics, rien d'autre : ni prompt, ni alias d'agent, ni
   * plafond, ni voix. Tout visiteur du portail peut lire ce DTO.
   */
  assistant: PortalAssistantDto;
}

/**
 * Ce que l'assistant du portail a le droit de faire pour cette collectivité.
 *
 * ⚠️ Le commutateur s'applique **à la frontière** (motif `declaration_link`) :
 * `deposit_enabled` et `voice_enabled` ne sont `true` que si `enabled` l'est
 * aussi. Un consommateur lit donc chaque booléen tel quel, sans les croiser.
 */
export interface PortalAssistantDto {
  /** L'assistant est proposé sur le site : il renseigne et oriente. */
  enabled: boolean;
  /** Il peut en outre recueillir un formulaire dans la conversation. */
  deposit_enabled: boolean;
  /**
   * Il propose un mode dialogue : il prononce ses réponses, l'usager répond de
   * vive voix (contrat 1.37.0). Les langues où c'est possible sont l'affaire du
   * portail et du guichet `ai-api`, pas de ce booléen.
   */
  voice_enabled: boolean;
}

/**
 * Thème du site de démarches. Toutes les valeurs sont des **énumérés fermés** :
 * un consommateur peut les traduire en une table de correspondance, sans avoir
 * à interpréter une chaîne libre.
 *
 * ⚠️ **`font` est un IDENTIFIANT, pas un nom de famille CSS.** À vous de le
 * traduire en pile de polices, et surtout de ne charger QUE celle-là : c'est le
 * seul réglage du thème qui coûte des octets et une requête. `systeme` n'en
 * demande aucune.
 *
 * ⚠️ **AUTO-HÉBERGEZ-LES.** Les trois familles web sont sous SIL Open Font
 * License 1.1 — c'est le critère d'entrée au catalogue, précisément pour que
 * vous puissiez les servir depuis votre propre domaine. Les prendre chez Google
 * Fonts enverrait l'adresse IP de chaque visiteur à un tiers, sans base légale,
 * sur le site d'une collectivité.
 *
 * ⚠️ `sticky` et `declaration` ne changent aucune couleur : le premier dit si
 * le bandeau suit le défilement, le second est la **mention RGAA obligatoire**
 * d'un site public, à afficher au pied des pages. Vide = la collectivité ne
 * l'a pas encore écrite, ou l'a masquée ; n'inventez rien à sa place.
 * `declaration_link` dit si cette mention porte un lien vers la déclaration
 * complète — il peut être vrai avec un texte vide : le lien seul s'affiche.
 */
export interface PortalThemeDto {
  typography: {
    font: "systeme" | "nunito-sans" | "rubik" | "public-sans";
    text_scale: "compact" | "standard" | "comfortable";
  };
  shapes: {
    radius: "square" | "soft" | "round";
    shadow: "none" | "soft" | "strong";
    /** Espacement entre les blocs et à l'intérieur des cartes. */
    density: "compact" | "standard" | "airy";
  };
  header: {
    /** `color` : le bandeau prend une couleur de la charte, celle de `color`. */
    fill: "white" | "color";
    color: "primary" | "secondary";
    /** Utiliser `logo_white_url` de la charte sur un bandeau coloré. */
    logo_white: boolean;
    logo: "left" | "center";
    menu: "text" | "pills";
    sticky: boolean;
    account: "prominent" | "discreet";
  };
  accessibility: {
    /** Encres et bordures assombries, couleur principale comprise. */
    high_contrast: boolean;
    /**
     * Assombrir la couleur principale de la charte — sa clarté multipliée par
     * **0,75**, teinte et saturation inchangées. Réglé par la collectivité
     * quand le contraste de sa couleur ne suffit pas ; sa charte, elle, n'est
     * pas modifiée.
     */
    dark_primary: boolean;
    /**
     * Texte de la mention RGAA affichée au pied du site. Vide si non renseignée
     * **ou masquée** : le commutateur de la collectivité est appliqué ici.
     */
    declaration: string;
    /**
     * Afficher, dans la mention, un lien vers la déclaration d'accessibilité
     * (`GET /v1/portal/content?slug=accessibilite`). **Résolu** par le Socle :
     * vrai seulement si la collectivité l'a demandé ET qu'une déclaration non
     * vide est publiée — le lien ne mène jamais à une page vide.
     */
    declaration_link: boolean;
  };
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
  /**
   * Conditions d'accès : `libre` (n'importe quel visiteur dépose) ou
   * `authentifie` (il faut être connecté à son espace usager).
   *
   * ⚠️ **Une démarche `authentifie` est servie comme les autres**, et doit
   * s'afficher comme les autres : c'est en la lisant que l'usager apprend
   * qu'il doit se connecter. La masquer la cacherait à ceux-là mêmes qui ont
   * un compte. Le portail demande la connexion au moment de **déposer**.
   *
   * ⚠️ `libre` quand la colonne n'a jamais été réglée — et c'est ce qui était
   * vrai avant qu'elle existe.
   */
  access_mode: "libre" | "authentifie";
  /** Organismes qui proposent la démarche, dans l'ordre de l'arbre. */
  organizations: PortalOrganizationRefDto[];
  /**
   * Publics auxquels la démarche est ouverte — `citoyen`, `entreprise`,
   * `association` — dans cet ordre. C'est de quoi filtrer une liste (« Je
   * suis… ») sans charger le détail de chaque démarche.
   *
   * ⚠️ **Peut être vide**, et ce n'est pas une anomalie : une démarche dont
   * l'étape « Informations demandeur » n'a jamais été remplie ne déclare aucun
   * public. Elle ne répond alors à **aucun** choix de filtre — la lire comme
   * « tous publics » la ferait apparaître partout, y compris là où elle n'est
   * pas ouverte.
   *
   * Le détail (`GET /v1/portal/procedures/{id}`) sert la configuration
   * complète dans `requester_config` : ces publics-ci en sont l'extrait qui
   * concerne l'usager avant qu'il ait choisi sa démarche.
   */
  audiences: Array<"citoyen" | "entreprise" | "association">;
  /**
   * Libellés traduits, `{ "<code de langue>": { "name": "…" } }` — mêmes règles
   * que `CategoryDto.translations` (pas de clé `fr`, repli sur `name`).
   */
  translations: unknown;
}

/**
 * Un organisme qui propose une démarche sur le portail : de quoi le nommer, et
 * de quoi router la demande.
 *
 * ⚠️ `id`/`name` désignent l'organisme **AFFICHÉ**, qui n'est pas forcément
 * celui qui a activé la démarche : un **service interne** de la collectivité ne
 * s'affiche jamais, c'est son porteur (premier ancêtre non interne) qui est
 * nommé à sa place. Recouper cette liste avec les activations brutes donnerait
 * un écart, et c'est normal.
 */
export interface PortalOrganizationRefDto {
  id: string;
  name: string;
  /**
   * Logo de l'organisme **AFFICHÉ**, ou `null` s'il n'en a pas. **Contrat
   * 1.23.0.**
   *
   * De quoi le reconnaître dans une liste — un menu « Ma ville » sur un portail
   * usagers, par exemple.
   *
   * ⚠️ C'est le logo **PROPRE** de l'organisation, pas celui qu'elle hérite :
   * contrairement à `GET /v1/organizations/{id}/branding`, l'héritage n'est pas
   * résolu ici, et c'est délibéré. Dans une liste de communes, un logo hérité
   * donnerait la même image à chaque ligne — celle de l'intercommunalité.
   * `null` veut donc dire « cette organisation n'a pas de logo à elle » :
   * affichez un repli neutre, pas le logo de la collectivité.
   *
   * ⚠️ URL libre, comme partout dans la charte : le Socle enregistre et publie,
   * il n'héberge rien et ne redimensionne rien. Écartez ce que vous ne pouvez
   * pas peindre (une adresse non `https`, par exemple).
   */
  logo_url: string | null;
  /**
   * Identifiant lisible de l'organisme, ou `null`. **Contrat 1.22.0.**
   *
   * C'est ce qui lui donne une adresse sur un portail usagers : Nora sert
   * `/<slug>` comme la page de cet organisme — ses démarches, ses couleurs, son
   * logo. Quatre caractères au moins, `[a-z0-9-]` (contrainte
   * `organizations_slug_url_form`) : en dessous, un portail le lirait comme un
   * code de langue.
   *
   * ⚠️ C'est le slug du **porteur**, jamais celui du service interne qui
   * instruit — même règle que `name`.
   */
  slug: string | null;
  /**
   * L'organisation qui **instruit** réellement, quand ce n'est pas l'organisme
   * affiché — `null` sinon. C'est un UUID et rien d'autre : le **nom** du
   * service interne ne sort pas, la collectivité a choisi de ne pas le montrer.
   *
   * Il y en a au plus un : le Socle refuse qu'une même démarche soit activée
   * par deux organisations d'un même porteur — sans quoi on ne saurait pas à
   * quel service rattacher la demande.
   */
  handling_organization_id: string | null;
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
 * Elle ajoute au public de la liste les deux schémas de SAISIE et ce que la
 * collectivité écrit pour l'usager (`user_communication`) :
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
  /**
   * Ce que la collectivité écrit POUR SES USAGERS — **transmis tel quel**.
   * Quatre blocs : `delays` (durée habituelle d'INSTRUCTION, valeur + unité),
   * `audience.note` (précision éditoriale), `attachments.items` (pièces
   * annoncées) et `faq.items` (questions fréquentes). `null` = la collectivité
   * n'a rien écrit ; les défauts de cette colonne sont VIDES, à l'inverse de
   * `communication_config` dont un `null` se lit « visible ».
   *
   * ⚠️ **Le descriptif usager n'est PAS ici** : c'est `user_description`, servi
   * à côté, et rédigé en **Markdown** depuis le 2026-09-18.
   * ⚠️ **`delays` n'est pas `input_duration_minutes`** : celui-ci dit combien de
   * temps l'usager met à REMPLIR, celui-là combien de temps la collectivité met
   * à RÉPONDRE. L'unité est dans la donnée, jamais déduite du nombre, et `0`
   * n'existe pas — ce serait promettre une réponse immédiate.
   * ⚠️ **`audience.note` ne filtre rien** : les publics admis restent
   * `audiences`, dérivé de `requester_config`. En cas de contradiction,
   * `audiences` fait foi.
   * ⚠️ **`attachments.items` n'est pas la liste des pièces à téléverser** : ce
   * sont les champs `attachment` de `form_schema`. Celle-ci est un texte
   * d'annonce, qui peut les recouper. Ne les concaténez pas.
   * ⚠️ **Deux FAQ existent, une seule sort** : celle de `knowledge_base` est
   * écrite pour l'agent et n'a jamais traversé vers un portail public.
   * **Traductions** (1.26.0) : la note, chaque pièce et chaque question portent
   * leurs propres `translations` (clés = leurs champs français), à replier
   * champ par champ. Le descriptif traduit, lui, est dans `translations`.
   */
  user_communication: unknown;
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
  Partial<Record<"title" | "subtitle" | "placeholder" | "body" | "alt", string>>
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
  /**
   * Image de **fond** du bloc : elle le recouvre entièrement, cadrée au centre
   * et rognée pour le remplir (`background-size: cover`). Chaîne vide = pas
   * d'image, le bloc s'affiche sur le fond de la page.
   *
   * ⚠️ C'est un FOND, pas une illustration — d'où l'absence de texte
   * alternatif, contrairement à `PortalTexteImageSection.image_url`. Ce qu'une
   * synthèse vocale doit lire, ce sont le titre et le sous-titre, posés dessus.
   * Rendez-la en CSS, pas en `<img>`.
   *
   * ⚠️ **Posez un voile clair par-dessus** si vous laissez les textes du thème
   * en encre sombre : la collectivité choisit sa photo, personne ne sait ce
   * qu'elle contient. Le Socle rend un blanc à 60 % — le fond le plus sombre
   * qu'on puisse alors obtenir garde 5,7 : 1 sous l'encre du portail, au-dessus
   * du seuil AA. Moins de voile, et la lisibilité n'est plus garantie.
   *
   * ⚠️ URL **libre**, saisie par la collectivité : le Socle n'héberge pas le
   * fichier et ne garantit pas qu'il existe encore. Elle est filtrée sur sa
   * forme — `https://…` absolue, rien d'autre — parce qu'elle finit dans une
   * page publique.
   */
  image_url: string;
  /**
   * L'image va d'un **bord à l'autre** de la page au lieu de s'arrêter aux
   * marges du contenu.
   *
   * ⚠️ **Sans objet quand `image_url` est vide**, et la valeur est alors
   * conservée telle quelle : ne la lisez pas comme un réglage de mise en page
   * du bloc, c'est un réglage de l'image.
   */
  image_full_width: boolean;
  /**
   * L'image reste **fixe** pendant que la page défile, le bloc glissant
   * par-dessus (`background-attachment: fixed`).
   *
   * ⚠️ Même remarque : sans objet sans image. Et c'est un **ornement** — les
   * navigateurs mobiles qui ignorent `fixed` affichent le bloc entier, avec son
   * image, simplement sans l'effet. Aucune information n'en dépend.
   */
  image_fixed: boolean;
  /**
   * Couleur du titre et du sous-titre posés sur l'image : `theme` (l'encre du
   * thème, comme sans l'option) ou `white`.
   *
   * ⚠️ **Sans objet quand `image_url` est vide** — et à ignorer alors : un titre
   * blanc sur une page blanche disparaîtrait. Valeur conservée telle quelle,
   * comme `image_full_width`.
   */
  text_color: "theme" | "white";
  /**
   * Ombre portée sous le titre et le sous-titre, **sans décalage** : un halo
   * qui part de tous les côtés. Elle prend le contre-pied du texte — sombre
   * sous un texte blanc, claire sous l'encre du thème. Sans objet sans image.
   */
  text_shadow: boolean;
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
  /**
   * Proposer à l'usager le filtre « Je suis… » : citoyen, entreprise,
   * association. Il restreint la grille aux démarches dont `audiences`
   * contient le public choisi.
   *
   * ⚠️ Il se **cumule** avec le filtre par organisme (`PortalProcedure.
   * organizations`), il ne le remplace pas : deux dimensions indépendantes de
   * la même grille.
   *
   * ⚠️ `true` ne veut pas dire « affiche-le » : un filtre à un seul choix n'en
   * est pas un. Ne le montrez que si les démarches affichées visent au moins
   * deux publics — c'est ce que fait l'éditeur du Socle.
   */
  audience_filter: boolean;
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

/**
 * Un texte et une illustration. `layout` dit lequel des deux se lit en
 * **premier** — un ordre, pas une position : sur un téléphone les deux moitiés
 * s'empilent, et il n'y a plus de gauche ni de droite.
 *
 * ⚠️ `image_url` est une URL **libre**, saisie par la collectivité : le Socle
 * n'héberge pas le fichier et ne garantit pas qu'il existe encore. Elle est en
 * revanche filtrée sur sa forme — `http(s)://…` ou chemin absolu — parce
 * qu'elle finit dans le `src` d'une page publique. Vide = pas d'image : le bloc
 * n'est alors qu'un bandeau texte, ce n'est pas une erreur.
 *
 * ⚠️ `title` est **facultatif** sur ce bloc, contrairement aux autres bandeaux :
 * vide, il n'y a pas de titre à afficher — pas un titre vide.
 */
export interface PortalTexteImageSectionDto {
  id: string;
  kind: "texte-image";
  title: string;
  body: string;
  /** URL de l'image, `http(s)://…` ou `/…`. Chaîne vide s'il n'y en a pas. */
  image_url: string;
  /** Texte alternatif de l'image. Vide = image décorative (attribut `alt=""`). */
  alt: string;
  layout: "text-first" | "image-first";
  translations: PortalSectionTranslationsDto;
}

export type PortalSectionDto =
  | PortalRechercheSectionDto
  | PortalDemarchesSectionDto
  | PortalActusSectionDto
  | PortalCompteSectionDto
  | PortalTexteSectionDto
  | PortalTexteImageSectionDto
  | PortalFooterSectionDto;

export interface PortalPageDto {
  slug: string;
  /** Date de la publication servie (ISO 8601). */
  published_at: string;
  version: 1;
  sections: PortalSectionDto[];
}

/**
 * Contenu PUBLIÉ du site de démarches — réponse de `GET /v1/portal/content`.
 * Premier (et seul) contenu : la déclaration d'accessibilité (`accessibilite`),
 * vers laquelle mène la mention du pied de page.
 *
 * ⚠️ `body` est du **Markdown** (titres `#`, listes, `**gras**`, `*italique*`,
 * liens). Rendez-le en échappant le HTML, et **descendez les titres d'un
 * niveau** : la page porte déjà son titre de premier niveau. Il est rédigé en
 * français — pas de traduction pour l'instant.
 */
export interface PortalContentDto {
  slug: string;
  /** Date de la publication servie (ISO 8601). */
  published_at: string;
  /** Toujours `markdown` : le champ existe pour qu'un autre format s'annonce. */
  format: "markdown";
  body: string;
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
