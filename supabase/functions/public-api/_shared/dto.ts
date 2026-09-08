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
 * l'a pas encore écrite ; n'inventez rien à sa place.
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
    /** Mention RGAA affichée au pied du site. Vide si non renseignée. */
    declaration: string;
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
