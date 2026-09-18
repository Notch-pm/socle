# Modèle de données

> **Public** : développeurs, ops · **Question traitée** : qu'est-ce qui existe en base (tables,
> contraintes, RLS, fonctions, storage) ? · **Dernière mise à jour** : 2026-09-18

Pour le rôle de Socle dans la gamme et les décisions d'architecture, voir [../CLAUDE.md](../CLAUDE.md)
et [./architecture.md](./architecture.md). Pour les endpoints, schémas de requête/réponse et la
politique de compatibilité côté consommateurs (Ariane/Clara/Iris), voir `/api-doc` (public-api),
`/api-doc-usagers` (contacts-api) et [./integration.md](./integration.md) — ce document ne liste
aucun endpoint, il décrit ce qui existe **en base**.

## Vue d'ensemble

- **15 tables** dans le schéma `public`, **RLS activée sur les 15**. Aucune vue, aucun type
  `ENUM` Postgres : toutes les valeurs fermées (statuts, types, rôles) sont des `text` contraints
  par `CHECK` — traiter ces `CHECK` comme la définition faisant foi d'un « enum ».
- Un **event trigger plateforme `ensure_rls`** (fonction `rls_auto_enable`, `SECURITY DEFINER`)
  active automatiquement la RLS sur toute nouvelle table créée dans `public` : une nouvelle
  table part donc verrouillée par défaut, il faut lui écrire ses policies pour qu'elle serve.
- Domaines couverts : **Organisations & accès**, **Catalogue de démarches**, **Référentiel
  usagers**, **Territoire**, **Plateforme**.

### Motifs transverses (posés une fois, référencés ensuite)

- **Rattachement à une organisation racine** — trigger `enforce_*_root_org` (`BEFORE
  INSERT/UPDATE OF organization_id`) : refuse toute valeur dont l'organisation n'est pas une
  racine (`parent_id IS NULL`). Présent sur `procedures`, `document_types`, `document_templates`,
  `api_keys`, `contacts`, `contact_roles`, `quartiers`. Par cohérence inter-tables, `contact_role_assignments`
  et `contact_relations` vérifient eux aussi que leurs lignes liées partagent la même racine
  (triggers dédiés, détaillés plus bas). **`categories` fait exception** — voir Points de
  vigilance.
- **Unicité de nom par organisation** — index unique `(organization_id, lower(name))` :
  présent sur `document_types`, `document_templates`, `contact_roles`, `quartiers`. **Absent de
  `categories`.**
- **Horodatage `set_updated_at()`** — trigger `BEFORE UPDATE` qui met à jour `updated_at` :
  présent sur `smtp_settings`, `contacts`, `contact_external_references`, `quartiers`,
  `document_templates`.
  **Absent de `procedures`**, qui a pourtant une colonne `updated_at`.
- **`SECURITY DEFINER` anti-récursion des helpers RLS** — `is_super_admin()`, `is_org_admin()`,
  `has_org_access()`, `is_admin_of_self_or_ancestor()` lisent `users` / `user_organizations` /
  `organizations` **sans re-déclencher le RLS** (sinon récursion infinie, cf.
  [../CLAUDE.md](../CLAUDE.md)). Détail complet en [Fonctions SQL](#fonctions-sql).

---

## Organisations & accès

### `organizations` — tenant, arbre

| Colonne | Type / contrainte |
|---|---|
| `id` | uuid PK, `gen_random_uuid()` |
| `parent_id` | uuid, self-FK **ON DELETE CASCADE** |
| `name` | text NOT NULL |
| `slug` | text nullable, **UNIQUE global**, CHECK `organizations_slug_url_form` (`[a-z0-9-]`, 4 caractères au moins, mots réservés du portail exclus). ⚠️ **Adresse publique** depuis le 2026-09-12 : le site de démarches sert `/<slug>` comme la page de cet organisme (contrat 1.22.0). Il reste aussi le point de départ du label DNS d'une racine (`dns_label_from_slug`) |
| `type`, `address`, `phone`, `email` | text nullable |
| `logo_url`, `logo_white_url` | text nullable — charte graphique (logo couleur, logo blanc) |
| `favicon_url` | text nullable — charte graphique : icône de l'onglet du navigateur, sur le site de démarches (2026-09-12) |
| `primary_color`, `secondary_color` | text nullable, CHECK `organizations_branding_colors_hex` (`#rrggbb`, casse indifférente) |
| `branding_inherit_parent` | bool NOT NULL défaut **true**, CHECK `organizations_branding_root_no_inherit` (false obligatoire sur une racine) |
| `metadata` | jsonb, défaut `{}` |
| `status` | text NOT NULL défaut `active`, CHECK `active`\|`obsolete` (réversible) |
| `is_internal_service` | bool NOT NULL défaut **false**, CHECK `organizations_internal_service_not_root` (false obligatoire sur une racine) |
| `email_sender_override` | bool NOT NULL défaut false |
| `email_sender_name` | text nullable |
| `enabled_languages` | `text[]` NOT NULL défaut `{fr}`, CHECK `organizations_enabled_languages_check` (fonction `is_valid_language_set`) — **racine uniquement** |
| `created_at` | timestamp sans fuseau, `now()` |

- **Trigger** `trg_enforce_org_depth` (BEFORE INSERT/UPDATE OF `parent_id`) → profondeur
  **max 10 niveaux** + détection de cycle. Seule fonction trigger en `SECURITY INVOKER`, EXECUTE
  ouvert à `anon`/`authenticated` (exception au motif transverse).
- **RLS** : lecture `has_org_access(id) OR is_admin_of_self_or_ancestor(id)` · écriture INSERT
  `is_super_admin() OR (parent_id IS NOT NULL AND is_admin_of_self_or_ancestor(parent_id))`,
  UPDATE `is_admin_of_self_or_ancestor(id)`, DELETE `is_super_admin() AND parent_id IS NOT NULL`.
- **Charte graphique héritée** (2026-08-30) : `branding_inherit_parent` = l'organisation utilise
  la charte de l'ancêtre le plus proche (elle comprise) qui n'hérite pas — même règle que le
  relais SMTP, même absence de recopie (résolution à la lecture, `resolve_branding`). Trigger
  `enforce_branding_root_no_inherit` (BEFORE INSERT/UPDATE) : une racine est **corrigée** à `false`
  au lieu d'être refusée — la colonne vaut `true` par défaut, aucun appelant créant une racine n'a
  à le savoir. ⚠️ Les valeurs propres sont **conservées** quand l'organisation hérite (le
  commutateur gouverne l'usage, pas la donnée — motif `email_sender_name`).
- **Langues de la collectivité** (2026-09-06) : `enabled_languages` porte les codes BCP 47 dans
  lesquels la collectivité s'adresse à ses usagers. Le CHECK garantit la **forme** (au moins `fr`,
  pas de doublon, codes bien formés) et non la liste : le catalogue des langues proposées vit dans
  le code (`src/features/languages/languages.ts`), ajouter une langue ne doit pas demander une
  migration. Trigger `enforce_languages_root_org` (BEFORE INSERT/UPDATE) : poser des langues sur
  une **sous-organisation est refusé** (un second réglage serait un second endroit où chercher la
  vérité), mais **rattacher** une organisation sous une autre est accepté — sa liste revient au
  défaut plutôt que de bloquer une réorganisation. Résolution à la lecture par
  `resolve_org_languages`, jamais de recopie (motif `resolve_branding`).
- **Services internes** (2026-09-08) : `is_internal_service` retire une sous-organisation du
  **portail usagers**. Elle continue d'instruire, mais le portail la présente sous le nom de son
  **porteur** — le premier ancêtre (elle comprise) qui n'est pas un service interne. Un usager
  s'adresse à sa mairie, pas à son service d'état civil. Résolution à la lecture par
  `internal_service_bearer(uuid)` (`SECURITY DEFINER`, EXECUTE révoqué : elle n'est appelée que
  par les triggers), miroir des helpers purs `bearerByOrganization` du front et de `public-api`.
  Trigger `enforce_internal_service_not_root` (BEFORE INSERT/UPDATE) : une racine est **corrigée**
  à `false` plutôt que refusée — promouvoir un service en racine est une réorganisation légitime,
  et échouer la bloquerait sans rien protéger (motif `enforce_branding_root_no_inherit`). Le CHECK
  ne voit donc que la valeur corrigée. ⚠️ **Un service interne a toujours un porteur** : c'est ce
  que garantit cet invariant, et c'est ce qui fait terminer la remontée.
  ⚠️ Le réglage **gouverne l'usage, pas la donnée** : le décocher rend l'organisme au portail sans
  que rien n'ait été perdu.
- ⚠️ **`parent_id` en CASCADE, et tous les `organization_id` des autres tables également en
  CASCADE** : supprimer une organisation supprime récursivement tout son sous-arbre **et**
  l'intégralité de ses données (catégories, démarches, contacts, quartiers, clés API, SMTP…).
  Aucun garde-fou en base au-delà de la policy DELETE.

### `users`

- `id` uuid PK, `gen_random_uuid()` par défaut — **aucune FK vers `auth.users`** ; le lien est
  conventionnel, posé par le trigger `handle_new_user`.
- `email` text NOT NULL **UNIQUE**, `global_role` text NOT NULL **sans CHECK** (valeurs
  conventionnelles `super_admin`/`admin`/`consultant`), `first_name`, `last_name`, `created_at`.
- **Trigger** `on_auth_user_created` (sur `auth.users`, AFTER INSERT) → `handle_new_user()`
  (`SECURITY DEFINER`) : `global_role = 'super_admin'` si `public.users` est vide, `'consultant'`
  sinon — le premier compte créé sur le projet devient super admin.
- **RLS** : lecture `id = auth.uid() OR is_super_admin()` + policy dédiée « admin d'org peut lire
  les profils de ses membres » (`EXISTS user_organizations … is_org_admin(...)`) · écriture
  UPDATE own + UPDATE par admin d'org du membre. **Aucune policy INSERT ni DELETE** (création par
  le trigger `SECURITY DEFINER` / service role).

### `user_organizations` — appartenance (jointure user↔org)

- `user_id`, `organization_id` **nullables**, FK **CASCADE** des deux côtés ; `role` text NOT NULL
  **sans CHECK** ; **UNIQUE (user_id, organization_id)**.
- **RLS** : lecture `user_id = auth.uid() OR is_super_admin()` + `is_org_admin(organization_id)` ·
  écriture INSERT/DELETE `is_super_admin() OR is_org_admin(organization_id)`. **Aucune policy
  UPDATE** → changer le rôle d'un membre en place est impossible côté client, l'UI doit
  supprimer puis recréer la ligne.

### `organization_domains` — domaines du portail usagers

- `organization_id` NOT NULL, FK **CASCADE** ; `hostname` text NOT NULL ; `is_primary` bool NOT
  NULL défaut `false` ; `created_at`.
- **UNIQUE (hostname) GLOBAL**, pas par organisation : un domaine désigne exactement une
  collectivité. C'est l'invariant sur lequel repose toute la résolution de tenant du portail —
  deux lignes concurrentes la rendraient indéterminée. Conséquence côté UI : un doublon peut
  appartenir à une organisation que l'administrateur n'a pas le droit de voir, le message
  d'erreur ne peut donc pas dire laquelle.
- **UNIQUE partiel `(organization_id) WHERE is_primary`** : au plus un domaine canonique par
  organisation — celui qu'on écrit dans un lien. Les autres restent servis à l'identique.
  Changer de canonique demande donc DEUX écritures, et l'ordre est la garde : retirer l'ancien
  drapeau d'abord, poser le nouveau ensuite.
- **CHECK** : FQDN minuscule d'au moins deux labels, 4 à 253 caractères. `localhost` est donc
  refusé — le développement du portail simule un domaine réel (`PORTAL_DEV_DOMAIN_SUFFIX`).
- **Trigger `normalize_organization_domain`** (BEFORE INSERT/UPDATE) : minuscules, espaces et
  point final retirés. Normalisation à l'ÉCRITURE parce que le nom d'hôte est une clé de
  recherche : normaliser des deux côtés d'une comparaison est une source d'écart permanente.
- **Pas de restriction à une organisation racine**, contrairement à `quartiers` ou
  `document_templates` : un domaine appartient à qui l'exploite, et une sous-organisation qui
  tient son propre guichet doit pouvoir en porter un.
- **RLS** : lecture `has_org_access(organization_id)` · écriture **`is_super_admin()`** depuis le
  2026-09-08 (migration `organization_domains_superadmin_write`) : le sous-domaine fourni se pose
  par le provisioning, un domaine personnalisé suppose un CNAME chez le client et un enregistrement
  chez l'hébergeur du portail — un geste de l'éditeur. Les administrateurs lisent.
- Consommé par `GET /v1/portal/tenant?hostname=` de l'API publique, en service role hors RLS,
  borné au périmètre de la clé — depuis le 2026-09-08, les collectivités **abonnées à l'application
  de la clé** (voir `applications`).

---

### `portal_pages` — composition des pages du portail usagers

- `organization_id` NOT NULL, FK **CASCADE** ; `slug` text NOT NULL défaut `accueil` (CHECK
  `^[a-z0-9]+(-[a-z0-9]+)*$`) ; `draft` jsonb NOT NULL ; `published` jsonb ; `published_at` ;
  `created_at` / `updated_at` (trigger `set_updated_at`). **UNIQUE (organization_id, slug)**.
- **Deux colonnes, deux gestes.** `draft` est ce que l'éditeur CMS manipule — écrit
  automatiquement à chaque modification, jamais servi au public. `published` est ce que le
  portail servira — ne change que par une publication explicite. **Sauvegarder n'est pas
  publier** : la séparation est dans le schéma, pas dans une option. CHECK
  `(published is null) = (published_at is null)` : une publication porte toujours sa date.
- Contenu : schéma JSON **possédé**, défini par `src/features/portal/portalPage.ts`
  (`{ version: 1, sections: [...] }`, sections typées `recherche` / `demarches` / `actus` /
  `compte` / `texte` / `footer` — ce dernier porte un fond `#rrggbb`, 1 à 3 colonnes et des
  sous-blocs `texte`). Les épinglages référencent des `procedures.id`, jamais des libellés.
  Parse tolérant section par section : une section illisible est écartée, les autres sont
  conservées — c'est la page d'accueil d'une collectivité, une section abîmée ne doit pas
  effacer les autres.
- **Racine uniquement** (trigger `enforce_portal_page_root_org`, motif document_templates) :
  le catalogue que la page épingle est celui de la racine.
- **RLS** : lecture `has_org_access(organization_id)` · écriture `is_org_admin(organization_id)`
  (qui court-circuite déjà le super admin) — calqué sur `document_templates`.
- Consommé par le portail via `GET /v1/portal/page?tenant_id=&slug=` de l'API publique
  (contrat 1.8.0 ; `published` seulement, 404 = jamais publiée, références résolues sur les
  démarches publiées), en service role hors RLS, borné au périmètre de la clé.

---

### `portal_themes` — thème du site de démarches

- `organization_id` NOT NULL, FK **CASCADE**, **UNIQUE** ; `draft` jsonb NOT NULL ; `published`
  jsonb ; `published_at` ; `created_at` / `updated_at` (trigger `set_updated_at`). CHECK
  `(published is null) = (published_at is null)`.
- **Même discipline que `portal_pages`**, et pour la même raison : `draft` est ce que l'éditeur
  écrit tout seul, `published` ce que le portail sert, et il ne bouge que sur un geste explicite.
  L'éditeur publie les deux tables **d'un seul geste** — l'agent publie « son site », pas une
  table.
- **Pas de `slug`** : un thème par collectivité, c'est tout son objet. C'est aussi pourquoi il a
  sa table plutôt qu'une clé dans `portal_pages` — il vaut pour **toutes les pages**, et le loger
  dans la page d'accueil deviendrait un mensonge le jour où « Contact » et « Mentions légales »
  arriveront.
- Contenu : schéma JSON **possédé**, défini par `src/features/portal/portalTheme.ts`. Quatre
  blocs voisins (`typography`, `shapes`, `header`, `accessibility`), **sans numéro de version** —
  motif `communication_config` : chaque champ retombe sur SON défaut, un thème ne peut pas être
  « faux », seulement partiellement inconnu.
- ⚠️ **Aucune couleur** : elles vivent dans la charte graphique de l'organisation
  (`primary_color` / `secondary_color`) et n'ont pas à exister deux fois. Le thème dit COMMENT
  peindre, la charte dit AVEC QUOI. Seul `accessibility.dark_primary` la touche — il fonce la
  couleur **au rendu**, sans modifier la colonne.
- **Racine uniquement** (trigger `enforce_portal_theme_root_org`, motif `portal_pages`) : c'est le
  site de la collectivité, pas celui d'un de ses services.
- **RLS** : lecture `has_org_access(organization_id)` · écriture `is_org_admin(organization_id)`
  — calqué sur `portal_pages`.
- Consommé par le portail dans `GET /v1/portal/tenant?hostname=` (contrat 1.17.0), champ `theme` :
  ⚠️ rien de publié ⇒ **les défauts du Socle**, jamais `null`.
- Le bloc `accessibility` porte la **mention d'accessibilité** du pied de page (2026-09-18) :
  `declarationEnabled` (commutateur, défaut **vrai**), `declaration` (la phrase, 300 caractères),
  `declarationLink` (lien vers la déclaration, défaut **vrai**). ⚠️ Défauts vrais, contrairement aux
  correctifs : la mention est obligatoire, et les thèmes d'avant ces champs affichaient déjà leur
  texte. Le commutateur gouverne l'usage, pas la donnée — c'est l'API qui l'applique (mention vide,
  `declaration_link` résolu, contrat 1.25.0).

---

### `portal_contents` — contenus textuels du site de démarches (2026-09-18)

- `organization_id` NOT NULL, FK **CASCADE** ; `slug` text NOT NULL (CHECK de **forme**
  `^[a-z0-9]+(-[a-z0-9]+)*$`, 64 caractères au plus) ; `draft` jsonb NOT NULL ; `published` jsonb ;
  `published_at` ; `created_at` / `updated_at` (trigger `set_updated_at`). **UNIQUE
  (organization_id, slug)**. CHECK objet JSON sur les deux colonnes, garde-fou de taille (200 000
  caractères), et `(published is null) = (published_at is null)`.
- Les **pages de texte** du site, rédigées dans l'onglet « Contenus » de l'éditeur. Une seule
  aujourd'hui : `accessibilite`, la **déclaration d'accessibilité** vers laquelle mène la mention du
  pied de page. ⚠️ La base valide la **forme** du slug, pas la **liste** (motif
  `enabled_languages`) : le catalogue vit dans `src/features/portal/portalContent.ts`.
- ⚠️ **Ce n'est pas une `portal_pages`** : une page est une COMPOSITION de blocs, versionnée ; un
  contenu est UN TEXTE, `{ body }` en **Markdown**, sans version. Deux formes de JSON sous une même
  colonne feraient qu'un parseur qui lit la mauvaise retombe sur ses défauts. Ni une clé du
  **thème**, qui garde la *mention* (une phrase, un lien) mais pas la *déclaration* (plusieurs
  écrans).
- **Même discipline que les deux autres tables du portail** : `draft` autosauvegardé, `published`
  par le geste « Publier », qui publie **le site entier** — composition, thème et contenus.
- **Racine uniquement** (trigger `enforce_portal_content_root_org`, EXECUTE révoqué des trois
  rôles) · **RLS** : lecture `has_org_access` · écriture `is_org_admin` — calqué sur
  `portal_themes`.
- Consommé par `GET /v1/portal/content?tenant_id=&slug=` (contrat 1.25.0) : ⚠️ un texte publié
  **vide** vaut 404, et c'est aussi ce qui décide `declaration_link` dans
  `GET /v1/portal/tenant` — le lien ne mène jamais à une page blanche.

---

---

## Catalogue de démarches

### `categories`

- `organization_id` **nullable**, FK CASCADE ; `name` NOT NULL ; `icon` ; `created_at` ;
  `translations` jsonb NOT NULL défaut `{}`, CHECK `categories_translations_object_check`
  (`jsonb_typeof = 'object'`) — voir [Contrats JSONB possédés](#contrats-jsonb-possédés).
- **Aucun trigger de rattachement racine, aucun index d'unicité de nom, aucun index sur
  `organization_id`** — seule table métier scopée organisation à déroger aux deux motifs
  transverses (voir Points de vigilance).
- **RLS** : lecture `has_org_access(organization_id)` · écriture (ALL) `is_org_admin(organization_id)`.

### `procedures` — cœur métier

| Colonne | Type / contrainte |
|---|---|
| `organization_id` | uuid nullable, FK CASCADE, **racine imposée par trigger** |
| `category_id` | uuid nullable, FK `categories(id)` **sans `ON DELETE`** |
| `name` | text NOT NULL |
| `type` | text NOT NULL défaut `externe`, CHECK `interne`\|`externe` |
| `status` | text NOT NULL défaut `brouillon`, CHECK `brouillon`\|`production` |
| `access_mode` | text NOT NULL défaut `libre`, CHECK `libre`\|`authentifie` — conditions d'accès pour l'usager |
| `short_description`, `agent_description` | text |
| `user_description` | text — descriptif usager, **Markdown** depuis le 2026-09-18, saisi à l'étape « Communication usager » |
| `keywords` | `text[]` |
| `input_duration_minutes` | int, CHECK `NULL OR >= 0` |
| `order_index` | int, défaut 0 |
| `is_active_global` | bool défaut true |
| `translations` | jsonb nullable, défaut `{}`, CHECK `procedures_translations_object_check` — contrat possédé depuis le 2026-09-06 |
| `requester_config`, `form_schema`, `knowledge_base`, `communication_config`, `user_communication` | jsonb — contrats possédés, voir [Contrats JSONB possédés](#contrats-jsonb-possédés) |
| `created_at`, `updated_at` | timestamp sans fuseau, **pas de trigger `set_updated_at`** |

- **Trigger** `trg_enforce_procedure_root_org` (BEFORE INSERT/UPDATE OF `organization_id`).
- **RLS** : deux policies de lecture cumulatives — membre direct de `procedures.organization_id`
  (ou super admin) **ou** `EXISTS organization_procedures … has_org_access(...)` (accès via
  activation) · écriture (INSERT/UPDATE/DELETE) `is_org_admin(organization_id) OR
  is_super_admin()`. L'ancienne policy permissive fondée sur `global_role` seul n'existe plus.
- Aucun index sur `organization_id` ni `category_id`.
- `is_active_global` est **mort fonctionnellement** : aucune lecture dans `src/**`, exclu du DTO
  public par un test (`serializers.test.ts`). L'activation réelle passe par
  `organization_procedures` ci-dessous.
- ⚠️ **Trois notions voisines, à ne pas confondre** — elles se cumulent, aucune ne remplace
  l'autre : `status` dit si le **paramétrage est fini** (brouillon = ne rien servir) ·
  `organization_procedures.is_enabled` dit **quelles organisations** du sous-arbre la proposent ·
  `communication_config.visibility` dit **où et quand** (portail, période). Une démarche en
  brouillon n'est proposée nulle part, quelles que soient les deux autres.
- `status` a été ajouté le 2026-08-30 avec le défaut `brouillon` **pour toutes les lignes
  existantes** : la notion n'existait pas, nul n'avait déclaré une démarche prête.
- ⚠️ **`access_mode` n'est PAS une quatrième notion de publication** (ajouté le 2026-09-10) : il dit
  à quelles conditions l'usager **dépose** la démarche — `libre` sans compte, `authentifie` connecté
  à son espace —, jamais si on la montre. Une démarche réservée reste au catalogue du portail et
  doit s'y voir : c'est en la lisant que l'usager apprend qu'il doit se connecter. Défaut `libre`
  **pour toutes les lignes existantes**, et c'est ce qui était vrai (le portail dépose sans compte
  depuis le 2026-09-06) ; le défaut inverse aurait fermé un catalogue entier que personne n'avait
  déclaré fermé. Le Socle **enregistre et publie**, il ne refuse aucun dépôt — c'est le portail qui
  demande la connexion. Servi en contrat 1.19.0 sur `Procedure` et `PortalProcedure`.
- `category_id` sans `ON DELETE` : supprimer une catégorie utilisée par une démarche est **bloqué**
  par Postgres (pas de CASCADE, pas de SET NULL).

### `organization_procedures` — activation par organisation

- `organization_id`, `procedure_id` nullables, FK **CASCADE** des deux côtés ; **UNIQUE
  (organization_id, procedure_id)** (support de l'upsert d'activation) ; `is_enabled` bool défaut
  true ; `custom_name` text plat (pas de structure i18n) ; `custom_order` int ; `metadata` jsonb
  défaut `{}`.
- **RLS** : lecture `has_org_access(organization_id) OR is_admin_of_self_or_ancestor(organization_id)`
  · écriture (INSERT/UPDATE/DELETE) `is_admin_of_self_or_ancestor(organization_id)` — un admin
  active les démarches sur tout son sous-arbre, pas seulement son organisation directe.
- Sémantique : activation **opt-in** — une démarche est active pour une organisation si et
  seulement si une ligne existe avec `is_enabled = true`. Détail applicatif dans
  [../CLAUDE.md](../CLAUDE.md) (feature « Édition d'organisation »).
- **Un seul instructeur par porteur** (2026-09-08) : une même démarche ne peut être activée que
  par **une** organisation d'un même groupe — le porteur et ses services internes (voir
  `organizations.is_internal_service`). Sinon, une demande déposée au nom du porteur n'aurait pas
  de destinataire déterminé. La règle est écrite **une seule fois**, dans
  `internal_service_offer_conflicts(uuid)` (CTE récursive : racine → sous-arbre → porteur de
  chaque organisation → couples `(porteur, démarche)` portés par plus d'une organisation ;
  `SECURITY DEFINER`, EXECUTE révoqué), et appliquée par **deux triggers AFTER** :
  `enforce_single_offer_per_bearer` sur cette table (à l'activation, filtré sur la démarche
  écrite — un conflit préexistant sur une autre démarche ne doit rien bloquer) et
  `enforce_no_offer_conflict_on_bearer` sur `organizations` (`AFTER UPDATE OF is_internal_service,
  parent_id` : cocher la case ou déplacer un service peut créer le conflit sans qu'aucune
  activation ne bouge). Les deux lèvent un message français, qui **nomme** l'organisation fautive.
  ⚠️ **AFTER et non BEFORE** : la règle est un agrégat sur la table, elle doit voir la ligne qu'on
  vient d'écrire.
  ⚠️ **Le statut (`active`/`obsolete`) n'entre pas dans la règle** : c'est une contrainte de
  cohérence du paramétrage, pas d'affichage. Réactiver une organisation obsolète ne doit pas
  révéler un conflit dormant. Le catalogue du portail, lui, filtre bien sur le statut.
  ⚠️ Un trigger n'est pas étanche à la **concurrence** (deux activations simultanées peuvent se
  croiser) : assumé, le geste est humain, à l'échelle du clic.

### `document_types` — catalogue de pièces justificatives

- `organization_id` NOT NULL, FK CASCADE, **racine imposée** par `enforce_document_type_root_org` ;
  `name` NOT NULL ; `created_at`.
- Index **unique `(organization_id, lower(name))`** + index sur `organization_id`.
- **RLS** : lecture `has_org_access(organization_id)` · écriture (ALL) `is_org_admin(organization_id)`.
- Consommé par le champ « pièce justificative » du form builder de `procedures.form_schema`
  (`documentTypeId`, obligatoire à la saisie — logique côté `src/features/procedures/`).

### `document_templates` — catalogue de documents à variables

Modèles de documents et de courriers (`.doc`/`.docx`/`.odt`) porteurs de variables
`{{usager.nom}}`. ⚠️ **À ne pas confondre avec `document_types`** : celle-ci décrit les pièces
**demandées à l'usager**, celle-là les documents **produits par l'administration**.

- `organization_id` NOT NULL, FK CASCADE, **racine imposée** par
  `enforce_document_template_root_org` ; `name` NOT NULL ; `description` ; `type` NOT NULL avec
  **CHECK `in ('interne','externe','courrier')`** ; `file_path` + `file_name` NOT NULL ;
  `created_at`/`updated_at` (trigger `set_updated_at`).
- Index **unique `(organization_id, lower(name))`** + index sur `organization_id`.
- **RLS** : lecture `has_org_access(organization_id)` · écriture (ALL) `is_org_admin(organization_id)`.
- Fichiers dans le bucket privé **`document-templates`** (voir Storage ci-dessous).
- **Non exposé par les APIs publiques** à ce jour, et non rattaché aux démarches — les deux sont
  en « envisagé » dans [roadmap.md](./roadmap.md).

---

## Référentiel usagers

### `contacts` (référentiel partagé par la gamme)

**Colonnes générées (STORED)** :
- `display_name` = `usage_name`/`last_name` + `first_name` pour une personne, `legal_name` pour
  une structure — contrat de tri/recherche consommé en aval.
- `mobile_phone_normalized`, `landline_phone_normalized` = `normalize_phone(...)`.

**CHECK (8)** — font office d'« enum » et d'invariants métier :
`contact_type ∈ (personne|entreprise|association|administration)` ·
`civility ∈ (madame|monsieur)` · civilité obligatoire ⟺ personne · raison sociale
(`legal_name`) obligatoire ⟺ structure · champs personne (`first_name`, `last_name`,
`usage_name`, `birth_date`) interdits hors personne · `siret` interdit sur personne ·
`siret ~ '^[0-9]{14}$'` · `status ∈ (active|archived)` (réversible) ·
`preferred_channel ∈ (email|telephone|courrier)`.

**Autres colonnes notables** : adresse à plat (`address_line1/2`, `postal_code`, `city`, `country`
défaut `France`), `address_lat`/`address_lon` (float8, géocodage), `quartier_id` FK **ON DELETE
SET NULL**, `quartier_auto` bool défaut true, **consentements RGPD** (`consent_traitement`,
`consent_traitement_at`, `consent_partage`, `consent_partage_at` — **dérivés par trigger** de
`contact_consents`, jamais écrits directement) et les OBSOLÈTES `consent_email`/`consent_sms`
(remplacés le 2026-09-13 ; conservés tant que Clara les écrit), `internal_notes`
(commentée en base « ne jamais exposer au portail citoyen » — voir Points de vigilance),
`created_at`/`updated_at` timestamptz.

**Index** : unique partiel `(organization_id, siret) WHERE siret IS NOT NULL` ·
`(organization_id, lower(email))` partiel · `(organization_id, mobile_phone_normalized)` et
`(…, landline_phone_normalized)` partiels · `(organization_id, lower(display_name))` · **3 index
GIN trigram** (`match_full_name(last_name, first_name)`, `match_full_name(usage_name,
first_name)`, `normalize_name(legal_name)`) · `quartier_id` · `organization_id`.

**Triggers** : `set_contacts_updated_at` · `trg_enforce_contact_root_org` ·
`trg_assign_contact_quartier` (BEFORE INSERT/UPDATE, `SECURITY DEFINER`) — en mode auto,
recalcule `quartier_id` à l'insertion, au changement de coordonnées, au retour en auto, ou quand
`quartier_id` arrive à NULL avec des coordonnées présentes ; purge si les coordonnées deviennent
nulles ; en mode manuel, vérifie que le quartier appartient à la même racine que le contact
(exception sinon).

**RLS** : **une seule policy** — lecture `has_org_access(organization_id)`. **Aucune policy
d'écriture** : INSERT/UPDATE/DELETE impossibles côté client, réservés au service role via
`contacts-api` (voir [./integration.md](./integration.md) / `/api-doc-usagers`).

### `contact_roles` — catalogue de rôles par racine

- `organization_id` NOT NULL CASCADE, racine imposée par trigger ; `name` NOT NULL ; unique
  `(organization_id, lower(name))`.
- **Seule table du référentiel usagers écrivable côté client** : lecture `has_org_access`,
  écriture (ALL) `is_org_admin`.

### `contact_role_assignments` — n-n contact↔rôle

- `contact_id`, `role_id` FK **CASCADE** des deux côtés ; **UNIQUE (contact_id, role_id)** ;
  index sur `role_id`.
- **Trigger** `trg_enforce_contact_role_same_org` : contact et rôle doivent partager la même
  organisation racine.
- **RLS** : lecture via `EXISTS` sur le contact + `has_org_access`. Aucune écriture côté client
  (passe par `contacts-api`).

### `contact_external_references` — identifiants tiers

- `contact_id` CASCADE ; `organization_id` **dénormalisée par trigger**
  `sync_contact_external_ref_org` (recopiée depuis le contact, pour porter l'unicité localement) ;
  `source`/`external_id` avec CHECK `btrim(...) <> ''`.
- **Deux unicités** : contrainte `(contact_id, source)` + index unique
  `(organization_id, source, external_id)`.
- **Trigger** `set_updated_at`.
- **RLS** : lecture `has_org_access` seulement — aucune écriture côté client.

### `contact_consents` — consentements RGPD (2026-09-13)

La **preuve** du consentement, et pas seulement son état. Une ligne par recueil.

- `contact_id` CASCADE ; `organization_id` **dénormalisée par trigger**
  `sync_contact_consent_org` (motif `contact_external_references`) ; `kind` CHECK
  ∈ (`traitement`|`partage`) ; `granted` bool ; `statement` (CHECK non vide) ; `source_app`
  (CHECK non vide) ; `source_reference` (nullable, **sans FK** — référence inter-projets) ;
  `collected_at`, `created_at`, `updated_at`.
- **`statement` = la phrase exacte soumise à l'usager**, nom d'organisme déjà interpolé, **jamais
  réécrite**. C'est elle qui fait la preuve (art. 7.1 RGPD), pas le booléen : la collectivité peut
  être renommée et le libellé reformulé, ce qui a été accepté ne change pas. Le référentiel ne la
  compose pas — seule l'application qui a affiché la case sait ce qui a été lu.
- **Index** : `(contact_id, kind, collected_at desc)` · `organization_id` · **unique**
  `(contact_id, kind, source_app, source_reference)` — l'idempotence : rejouer un dépôt met à
  jour, il ne duplique pas.
  ⚠️ **Cet index ne doit PAS être partiel** (correctif `20260913100100`). Il l'était d'abord
  (`WHERE source_reference IS NOT NULL`), et `ON CONFLICT` ne sait pas inférer un index partiel
  sans que la requête répète son prédicat — ce qu'un client PostgREST ne peut pas exprimer :
  `42P10`, donc 500 à chaque consignation. La version ordinaire a la **même** sémantique, les
  NULL étant distincts dans un index unique : un recueil sans `source_reference` se répète
  librement. **Règle générale : un index qui porte une idempotence d'API n'est jamais partiel.**
- **Trigger `sync_contact_consent_state`** (AFTER INSERT/UPDATE, `SECURITY DEFINER`) : recopie
  l'état sur la fiche **seulement si `collected_at` est au moins aussi récent** que la date déjà
  posée. Consigner après coup un dépôt papier de l'an dernier n'efface donc pas un consentement
  retiré la semaine dernière. C'est ce trigger qui fait de l'historique la **seule** source de
  l'état — deux sources pour un même fait finiraient par diverger.
- **RLS** : lecture `has_org_access(organization_id)` seulement — aucune écriture côté client
  (passe par `contacts-api`, `POST /v1/contacts/{id}/consents`).
- ⚠️ **Le référentiel n'exige aucun consentement** : il accepte `granted: false` même sur
  `traitement`. L'obligation appartient au **dépôt** (Iris la tient), et un **retrait** doit
  pouvoir être consigné ici.

### `contact_relations` — relations dirigées entre contacts

- `id`, `organization_id` (dénormalisée par trigger), `contact_id`, `related_contact_id`,
  `role_id`, `created_at`.
- **CHECK** `contact_id <> related_contact_id` (pas d'auto-relation) ; **UNIQUE (contact_id,
  related_contact_id, role_id)** ; index sur `contact_id`, `related_contact_id`, `organization_id`.
- FK : les deux contacts et l'organisation en **CASCADE** ; `role_id` → `contact_roles(id)`
  **sans `ON DELETE`** — asymétrie avec `contact_role_assignments` (qui est en CASCADE) : un
  rôle utilisé dans une relation ne peut pas être supprimé.
- **Trigger** `contact_relations_sync_org` (`SECURITY DEFINER`) : recopie `organization_id`
  depuis le contact porteur, exige que les deux contacts et le rôle appartiennent à la même
  organisation, et **interdit de cibler une personne physique** (`related_type = 'personne'` →
  exception) — une relation ne peut pointer que vers une structure (entreprise, association,
  administration).
- **RLS** : lecture `has_org_access(organization_id)` uniquement. Écriture exclusivement via
  `contacts-api` (clé `relations` du payload, remplacement par différence). Exposée dans la
  fiche contact sous `relations` (sortantes) et `reverse_relations` (entrantes).

---

## Territoire

### `quartiers` — découpage territorial (PostGIS)

- `organization_id` NOT NULL CASCADE, racine imposée par `enforce_quartier_root_org` ; `name`
  NOT NULL, unique `(organization_id, lower(name))` ; `color` ; **`geom geometry(MultiPolygon,
  4326)` NOT NULL**, index **GIST** ; `created_at`/`updated_at` timestamptz + trigger
  `set_updated_at` ; `created_by` uuid **sans FK** (non contraint — voir Points de vigilance).
- **RLS** : lecture `has_org_access` · écriture (ALL) `is_org_admin` — table modifiable côté
  client, comme `contact_roles`.
- `geom` n'est **jamais** sérialisé directement : la géométrie ne sort qu'en GeoJSON via la RPC
  `list_quartiers_geojson` (voir [Fonctions SQL](#fonctions-sql)).

---

## Plateforme

### `smtp_settings`

- `organization_id` NOT NULL **UNIQUE** FK CASCADE (relation 1-1) ; `host`/`username`/`password`/
  `from_email`/`from_name` NOT NULL défaut `''` ; `port` défaut 587 ; `use_tls` défaut true ;
  `inherit_parent` bool défaut false ; `created_at`/`updated_at` timestamptz + trigger
  `set_updated_at`.
- **Héritage le long de la hiérarchie** (2026-08-23) : une organisation utilise le relais de
  l'**ancêtre le plus proche (elle comprise) qui a une configuration propre**, c'est-à-dire une
  ligne avec `inherit_parent = false`. Une sous-organisation a donc une configuration propre
  seulement si elle l'a explicitement demandée ; sinon (aucune ligne, ou ligne
  `inherit_parent = true`) elle suit son parent — **modifier le relais d'un parent modifie de
  facto celui de toute sa descendance non spécifique**, sans recopie ni resynchronisation.
  Une ligne « héritante » **conserve ses valeurs** (retour en arrière possible, motif
  `organizations.email_sender_override`) ; elle est simplement inerte.
- Trigger `enforce_smtp_no_inherit_on_root` : une organisation **principale** ne peut pas porter
  `inherit_parent = true` (personne au-dessus d'elle).
- **RLS** : lecture et écriture (ALL) `is_admin_of_self_or_ancestor(organization_id)` — élargi le
  2026-08-23 depuis `is_org_admin` (migration `smtp_settings_org_admin_write` puis
  `smtp_settings_heritage_parent`) : un admin règle l'héritage sur **tout son sous-arbre**, motif
  `organizations` / `organization_procedures`. Un admin de sous-organisation ne lit toujours pas
  la ligne de son parent (l'aperçu passe par `parent_smtp_settings`, sans mot de passe).
- ⚠️ `password` stocké **en clair** ; `pgsodium` est disponible au catalogue Postgres mais
  **non installé** sur le projet.

### `platform_settings` — réglages de plateforme (2026-09-08)

- Ligne unique : `id boolean PK default true` + CHECK `(id)`. Insérée par la migration.
- `portal_domain_suffix` (zone des sous-domaines fournis, CHECK FQDN, NULL = aucun sous-domaine
  attribué), `portal_cname_target` (cible CNAME affichée aux collectivités), `default_ai_monthly_tokens`
  (CHECK > 0, NULL = rien de posé), `updated_at`/`updated_by`. Trigger `normalize_platform_settings`
  (minuscules, point final, vide → NULL).
- **RLS** : lecture `authenticated` (aucun secret n'y vit — l'écran des domaines lit la cible
  CNAME) · UPDATE `is_super_admin()` · ni INSERT ni DELETE client.

### `applications` et `organization_applications` — registre et abonnements (2026-09-08)

- `applications` : `id text PK` (CHECK `~ '^[a-z][a-z0-9_-]{1,31}


### Plafond et journal d'utilisation IA

Trois tables (`20260829100100`), portées depuis Iris quand la clé du fournisseur LLM et sa
comptabilité ont été centralisées ici (2026-08-29).

> **La phrase qui résume le modèle : l'application consommatrice discrimine le JOURNAL, jamais le
> compteur, jamais le plafond.** Un budget est une affaire de collectivité ; savoir *qui* a
> dépensé est une question d'explication, pas de comptage.

- **`ai_usage_quotas`** — `organization_id` FK CASCADE, `provider text` NOT NULL,
  `monthly_limit_tokens` bigint, `is_active` bool, UNIQUE `(organization_id, provider)`.
  ⚠️ `provider` porte la sentinelle **`'__global__'`** et jamais NULL : deux NULL ne sont jamais
  égaux pour un index UNIQUE, ce qui casserait `ON CONFLICT` — régression vécue chez Clara. Le
  trigger `enforce_ai_usage_quota_root_org` impose une organisation **principale**.
- **`ai_usage_counters`** — `(organization_id, provider, period)` UNIQUE, `used_tokens` et
  `reserved_tokens` bigint. `period` = `to_char(now() at time zone 'utc', 'YYYY-MM')` : **tout
  est en UTC**, sans quoi une date de renouvellement annoncée en heure locale mentirait d'un mois
  entier deux heures par mois.
- **`ai_usage_events`** — le journal : `consumer` NOT NULL (dénormalisé **depuis la clé**),
  `api_key_id`, `feature` (déclaratif, étiqueté comme tel), `resource_type`, `status`,
  `estimated_tokens`/`actual_tokens`, et des références **nues** vers l'extérieur —
  `external_ref_kind`/`external_ref_id`/`external_actor_id`, uuid **sans FK**. Aucune FK ne
  franchit une frontière de projet, et une cascade effacerait une consommation facturée.
  ⚠️ **Aucune colonne ne peut porter un prompt ou une réponse**, et c'est la première preuve du
  passe-plat : un test épingle l'ensemble exact des 17 colonnes, si bien qu'une future colonne
  `prompt`/`content`/`answer` le casse.

- **`ai_usage_rate`** (2026-08-29) — le garde-fou de **DÉBIT**, que le plafond ne couvre pas :
  il dit *combien*, jamais *à quelle vitesse*, et une boucle accidentelle consommerait un mois
  en quelques minutes. Clé primaire composite `(organization_id, subject_kind, subject,
  **bucket**, window_start)`, `attempts int` ; pas de colonne `id` — la recherche EST la clé et
  ces lignes sont éphémères, un uuid de substitution serait un second index à tenir sur le
  chemin chaud de chaque appel. Purgée par `purge_ai_usage_rate`, enchaînée au job cron.
  ⚠️ **`bucket` est DANS LA CLÉ, pas à côté** (`'chat'` | `'batch'`) : différencier le seuil
  sans séparer le compteur laisserait un lot d'OCR manger le budget de QUESTIONS du même agent
  — après vingt documents lus, sa question suivante serait refusée alors qu'il n'en a posé
  aucune.
  ⚠️ **Elle compte les TENTATIVES, pas les appels aboutis** : une boucle que le plafond refuse
  déjà continue de marteler, et un compteur de succès ne la couperait jamais.

**Cycle réserver → appeler → solder, et DEUX portes avant lui.** `reserve_ai_usage` vérifie
d'abord la **cadence**, puis le **plafond**. Les seuils sont **en dur** (un garde-fou n'est pas
un paramètre commercial) et dépendent de la NATURE de l'appel — conversationnel 20/minute par
agent (120 sans agent), lot d'OCR 60 (360 sans agent) : un humain qui lit 150 mots entre deux
questions n'a pas le rythme d'une machine qui enchaîne des documents.
⚠️ La nature vient de `p_resource_type`, **dérivé côté serveur** par `ai-api` et jamais lu dans
le corps de la requête : un appelant ne peut pas se déclarer « lot » pour obtenir la limite
haute. Tout type inconnu retombe sur le seuil conversationnel, le plus strict. Chacune est
**UN `UPDATE` conditionnel** : zéro ligne affectée ⇒ refus, et le fournisseur n'est jamais
appelé. ⚠️ La porte de cadence passe **en premier**, pour trois raisons : elle doit compter les
tentatives y compris refusées ; rien n'est encore incrémenté quand elle refuse, donc il n'y a
aucun retour en arrière à écrire ; et elle doit protéger les collectivités **sans plafond**, qui
sortent de la fonction par un `return` anticipé et échapperaient à toute garde placée après. C'est la porte de
concurrence — un verrou de ligne Postgres en READ COMMITTED, pas un `select` suivi d'un `update`.
`settle_ai_usage` corrige ensuite avec la consommation réelle ; un échec ne consomme rien.
`release_stale_ai_reservations` (cron, 15 min) rattrape les réservations orphelines.

**RLS** : `for select to authenticated using (public.is_admin_of_self_or_ancestor(organization_id))`
sur les trois tables (`20260829110000`, élargi depuis `is_super_admin()` — la collectivité doit
pouvoir lire sa propre consommation sans écrire à l'éditeur). Les lignes étant clés sur une
**racine**, le prédicat coïncide avec « admin direct » : un admin de sous-organisation ne voit
rien, le budget n'est pas son affaire. Le helper court-circuite le super admin, que la policy
n'a donc pas à nommer.
**Aucune policy d'écriture, aucune policy `service_role`** — les écrivains sont des RPC
`SECURITY DEFINER`, hors RLS par construction. Les RPC de réglage (`set_ai_usage_quota`,
`delete_ai_usage_quota`) sont gardées par `is_super_admin()`, fondée sur `auth.uid()` : ⚠️ ne
jamais la remplacer par une garde fondée sur `current_user`, qui vaut toujours le propriétaire
à l'intérieur d'une fonction `DEFINER`. ⚠️ **Ouvrir la lecture n'ouvre pas le réglage** : c'est
tout l'équilibre de l'écran de consultation `/consommation-ia` — un plafond que son porteur
pourrait lever ne serait pas un plafond.
`ai_usage_breakdown` étant `SECURITY INVOKER`, elle suit ces policies sans changement : une
implémentation, trois lecteurs (le service, l'éditeur, le client).

---

## Fréquentation du site de démarches

Deux tables de **compteurs**, et rien d'autre. Écrites par `audience-api` (scope `audience`) via
deux RPC, lues par une troisième. Voir CLAUDE.md, « Tableau de bord et fréquentation du site ».

⚠️ **AUCUN IDENTIFIANT NE PEUT Y ENTRER**, et c'est ce qui dispense d'un bandeau de consentement
sur les portails (article 82 de la loi Informatique et Libertés) : pas de visiteur, pas de session,
pas d'adresse IP même hachée, pas de User-Agent, pas de référent. La promesse est **épinglée par un
test** — `supabase/tests/audience.test.sql` (cas R1) fige la liste EXACTE des colonnes des deux
tables ; ajouter `visitor_id` le fait tomber. Motif du passe-plat de l'`ai-api`.

### `portal_audience_pages`

- `organization_id` NOT NULL CASCADE — **l'organisme DU DOMAINE visité**, pas forcément une racine :
  une sous-organisation peut tenir son guichet ; `day` date (heure de Paris, **posée par le
  serveur**) ; `page` CHECK `accueil|demarche|formulaire` ; `procedure_id` uuid **SANS FK** ;
  `views`/`visits`/`deposits` integer ≥ 0.
- CHECK `(page = 'accueil') = (procedure_id is null)` — la forme de la ligne dit à quoi elle se
  rapporte ; CHECK `deposits = 0 or page = 'formulaire'` — un dépôt part d'un formulaire, et le
  compter ailleurs fausserait le taux (dépôts / formulaires ouverts).
- **`unique nulls not distinct (organization_id, day, page, procedure_id)`** (Postgres ≥ 15) :
  sans `nulls not distinct`, chaque vue de l'accueil créerait une ligne, deux NULL ne se
  rapprochant jamais. Index `(organization_id, day)`.
- ⚠️ **`procedure_id` sans clé étrangère, volontairement** : une démarche supprimée garde son
  historique. Elle est nommée à la lecture par un sous-select, et l'écran libelle « Démarche
  supprimée » plutôt que d'afficher un uuid nu (motif `resolveDocuments`).
- **RLS activé, AUCUNE POLICY.** Ni `anon` ni `authenticated` n'entre : l'écriture passe par deux
  RPC réservées au service role, la lecture par une RPC `SECURITY DEFINER` gardée. Une policy de
  lecture, même large, ferait du découpage de ces tables un contrat public — or il doit rester
  libre.

### `portal_audience_breakdown`

- PK `(organization_id, day, dimension, value)` ; `dimension` CHECK `langue|appareil` ; `value`
  CHECK conditionnel : code BCP 47 (même expression que `is_valid_language_set`) pour `langue`,
  liste fermée `mobile|tablette|ordinateur` pour `appareil` ; `views`/`visits` integer ≥ 0.
- Table à part plutôt que des colonnes : les valeurs sont ouvertes (11 langues aujourd'hui) et ne
  se croisent pas avec les pages — croiser langue × appareil × page multiplierait les lignes sans
  qu'aucun écran ne le demande. Même RLS sans policy.

---

## Fonctions SQL

### Helpers RLS

Tous `SECURITY DEFINER`, `search_path=public`, EXECUTE ouvert à `anon`/`authenticated`
(indispensable : la RLS les évalue avec les droits de l'appelant, pas ceux du définisseur) :

- `is_super_admin()`
- `is_org_admin(org_id)` — admin **direct**, court-circuité par super admin
- `has_org_access(org_id)` — membre **direct**
- `is_admin_of_self_or_ancestor(org_id)` — `STABLE`, boucle ascendante sur `parent_id` (garde
  100 itérations), vrai si super admin

### `application_scope_ids(p_application)` — périmètre d'une clé plateforme (2026-09-08)

`returns uuid[]`, `STABLE`, `SECURITY INVOKER`, **EXECUTE réservé à `service_role`** (motif
`org_subtree_ids`) : toutes les organisations pour une application de scope `plateforme`, l'union
des `org_subtree_ids` des racines abonnées sinon, `{}` pour une application inconnue. Les trois
fonctions d'API l'appellent pour une clé plateforme, via la décision pure de
`_shared/apiKeyAuth.ts` (identique dans les **quatre**, test d'identité).

### RPC de fréquentation du portail (2026-09-12)

**Écriture** — `plpgsql`, `SECURITY INVOKER`, **EXECUTE réservé à `service_role`** (motif
`org_subtree_ids` : appelables par `authenticated`, n'importe quel compte fabriquerait des
chiffres). Elles ne portent que des uuid, trois énumérés courts et un booléen — aucune signature
ne peut véhiculer un identifiant de personne, et c'est l'un des quatre mécanismes qui tiennent la
promesse « aucune donnée personnelle ».

- `record_portal_page_view(p_organization_id, p_page, p_procedure_id, p_entry, p_lang, p_device)
  → boolean` — trois upserts incrémentaux (page, langue, appareil). Le jour vient **toujours** de
  `now() at time zone 'Europe/Paris'` : une horloge de navigateur décalée ferait atterrir des vues
  dans un futur qu'aucune période n'affiche. ⚠️ **Renvoie `false` sans rien écrire** — jamais
  d'exception — quand la démarche n'appartient pas au sous-arbre de sa racine, quand la forme est
  impossible (accueil avec démarche, démarche sans démarche) ou quand l'organisation est inconnue :
  un compteur ne fait pas échouer une page. ⚠️ Une langue malformée est **ignorée** sans perdre la
  vue de page : la ventilation perd une ligne, pas la mesure.
- `record_portal_deposit(p_organization_id, p_procedure_id) → boolean` — incrémente `deposits` sur
  la ligne `formulaire` de la démarche, **sans ajouter de vue** (sinon le taux de dépôt dépasserait
  100 % mécaniquement).

**Lecture** — `plpgsql STABLE`, **`SECURITY DEFINER`**, `search_path` figé, EXECUTE
`authenticated`. `returns jsonb` et non `returns table` (motif `root_onboarding_status` : une clé
s'ajoute par un `create or replace`, sans `drop function`, et un lecteur tolérant ne casse pas).

⚠️ **Garde `has_org_access(p_org_id)` + racine obligatoire.** `SECURITY DEFINER` est délibéré :
sous RLS, un membre ordinaire ne voit pas les sous-organisations et lirait des totaux **partiels** —
un tableau de bord qui ment est pire qu'un tableau de bord absent. Choix assumé : les noms des
sous-organisations et leur nombre d'activations deviennent visibles de tout membre direct de la
racine ; ils sont déjà publics sur le portail.

- `organization_dashboard(p_org_id) → jsonb` — `procedures {total, production}`, `contacts`
  (**actifs** seulement, par type : un archivé n'est plus un usager du référentiel) et
  `organizations` : le sous-arbre **actif**, avec `enabled_procedures` par organisme.
- `portal_audience(p_org_id, p_from, p_to) → jsonb` — `days` (les jours **sans données sont
  absents** : au lecteur de compléter par des zéros ; transmettre 365 lignes vides n'apprendrait
  rien), `totals` (dont `form_views`, le dénominateur du taux de dépôt), `pages` (les 10 plus vues,
  la démarche **nommée à la lecture**, `null` si elle a été supprimée) et `breakdown`. Période
  bornée à **400 jours** — au-delà, la requête balayerait des années pour un écran qui n'en montre
  pas.

### Provisioning d'une racine et mise en service (2026-09-08)

- **`dns_label_from_slug(text)`** IMMUTABLE : label DNS dérivé d'un slug (unaccent, minuscules,
  `[a-z0-9-]`, 63 caractères, NULL si vide). Miroir TS `dnsLabelFromSlug`, tests jumeaux.
- **`provision_root(p_org_id)`** SECURITY DEFINER, EXECUTE révoqué : les 8 rôles de contact, le
  plafond IA par défaut (insert direct dans `ai_usage_quotas` — `set_ai_usage_quota` exige
  `auth.uid()`), le sous-domaine fourni dans `organization_domains` (collision ou CHECK →
  `raise warning`). Idempotent (`on conflict do nothing`). Rend `{roles, quota, domain}`.
- **Trigger `provision_root_organization`** AFTER INSERT OR UPDATE OF `parent_id` sur
  `organizations` (racines seulement, no-op si déjà racine) — `exception when others` : la
  création de l'organisation ne doit jamais échouer à cause du provisioning.
- **`provision_existing_roots()`** (garde `is_super_admin()`, EXECUTE `authenticated`) : rejoue
  sur toutes les racines, rend les compteurs.
- **`root_onboarding_status(p_org_id)`** `returns jsonb`, SECURITY DEFINER (lit
  `resolve_smtp_settings`), garde `is_super_admin() OR is_admin_of_self_or_ancestor`, racines
  seulement : `smtp_configured`, `admin_count`, `application_count`, `category_count`,
  `procedure_count`, `procedure_production_count`, `activation_count` (sous-arbre),
  `domain_count` (sous-arbre), `portal_published`, `ai_quota_decided`, `ai_quota_active`,
  `logo_present`, `contact_role_count`. JSON pour qu'une clé s'ajoute sans `drop function`.

### `org_subtree_ids(root)` — périmètre des APIs

SQL `STABLE`, **`SECURITY INVOKER`**, CTE récursive sur `parent_id`. C'est le point qui borne
chaque requête de `public-api` au sous-arbre de l'organisation de la clé appelante.

`EXECUTE` **réservé à `service_role`** depuis le 2026-08-12 (migration
`org_subtree_ids_revoke_execute`) : l'ACL historique accordait aussi `anon`/`authenticated` —
sans impact réel (`SECURITY INVOKER` ⇒ RLS de l'appelant) — elle suit désormais le motif des
fonctions trigger.

### RPC serveur d'envoi (SMTP)

- `resolve_smtp_settings(p_org_id) → SETOF smtp_settings` — SQL `STABLE`, **`SECURITY INVOKER`**,
  CTE ascendante sur `parent_id` (garde 20 niveaux) : renvoie 0 ou 1 ligne, celle de l'ancêtre le
  plus proche (soi compris) dont `inherit_parent = false`. **Seule implémentation de l'héritage**,
  partagée par `public-api` (`GET /v1/organizations/{id}/smtp`) et les trois fonctions d'envoi
  (`send-test-email`, `invite-user`, `auth-email-hook`). Elle sert le **mot de passe** : `EXECUTE`
  **réservé à `service_role`** (motif `org_subtree_ids`).
- `parent_smtp_settings(p_org_id) → TABLE(source_organization_id, source_organization_name,
  configured, host, port, username, from_email, from_name, use_tls)` — `SECURITY DEFINER`, garde
  interne `is_admin_of_self_or_ancestor(p_org_id)`, EXECUTE `authenticated` + `service_role`.
  Aperçu de ce dont une organisation **hérite** (résolution démarrée à son parent), **sans le mot
  de passe** : l'admin d'une sous-organisation doit voir la configuration qui s'applique chez lui
  sans obtenir le secret de sa principale. Renvoie 0 ligne sur une racine.

### RPC charte graphique

Calquées trait pour trait sur les deux RPC SMTP ci-dessus.

- `resolve_branding(p_org_id) → TABLE(source_organization_id, logo_url, logo_white_url,
  favicon_url, primary_color, secondary_color)` — SQL `STABLE`, **`SECURITY INVOKER`**, CTE
  ascendante qui s'arrête d'elle-même au premier ancêtre ne héritant pas (garde 20 niveaux).
  **Seule implémentation de l'héritage.** EXECUTE **réservé à `service_role`** : elle traverse des
  organisations que l'appelant n'a pas le droit de lire.
- `parent_branding(p_org_id) → TABLE(source_organization_id, source_organization_name, configured,
  logo_url, logo_white_url, favicon_url, primary_color, secondary_color)` — `SECURITY DEFINER`,
  garde interne `is_admin_of_self_or_ancestor(p_org_id)`, EXECUTE `authenticated` + `service_role`.
  Aperçu de ce dont une organisation **hérite** (résolution démarrée à son parent) : sans elle,
  l'admin d'une sous-organisation choisirait d'hériter sans jamais voir de quoi. Renvoie 0 ligne
  sur une racine. `configured` = au moins un des **cinq** éléments renseigné au-dessus.

⚠️ **Les recréer, c'est leur rendre leurs droits par défaut.** Ajouter une colonne à leur type de
retour impose un `drop function` ; Supabase accorde alors EXECUTE à `anon` et `authenticated`
**nommément**, et un `revoke ... from public` ne l'enlève pas. Toute migration qui les redéfinit
doit reposer les droits en citant les **trois** rôles — la migration
`branding_functions_revoke_execute` (2026-08-30) le disait déjà, `..._bis` (2026-09-12) a dû le
redire après l'ajout du favicon.

### RPC et fonction langues

- `resolve_org_languages(p_org_id) → text[]` — SQL `STABLE`, `SECURITY INVOKER`, CTE ascendante
  jusqu'à la racine (garde 20 niveaux) : les langues **applicables** à une organisation, c'est-à-dire
  celles de son organisation principale. **Seule implémentation de la remontée** (motif
  `resolve_branding`), servie par `public-api` (`GET /v1/portal/tenant`, champ `languages`) —
  EXECUTE **réservé à `service_role`** : elle traverse des organisations que l'appelant n'a pas le
  droit de lire. Les écrans du Socle n'en ont pas besoin : ils lisent la colonne de la racine,
  qu'ils connaissent déjà.
- `is_valid_language_set(codes text[]) → bool` — SQL `IMMUTABLE`, support du CHECK sur
  `organizations.enabled_languages` : au moins `fr`, pas de doublon, codes de la forme
  `^[a-z]{2,3}(-[a-z0-9]{2,8})*$`. Miroir de `LANGUAGE_CODE_RE` côté application.

### `match_contacts(...)` — rapprochement d'identités

`match_contacts(p_org_id, p_contact_type, p_first_name, p_last_name, p_usage_name, p_legal_name,
p_siret, p_birth_date, p_email, p_phones[], p_status, p_exclude_ids[], p_limit) → TABLE(contact_id,
score int, reasons text[])`. `SECURITY INVOKER`, `search_path=""`, **EXECUTE réservé à
`service_role`**. Sert `POST /v1/contacts/match` de `contacts-api` — détail du scoring et des
critères dans [../CLAUDE.md](../CLAUDE.md) et l'OpenAPI de `contacts-api`.

### Fonctions de normalisation

`IMMUTABLE`, `search_path=""` — support des index et de la recherche :
`normalize_phone(raw)`, `normalize_name(value)`, `match_full_name(family, given)`,
`immutable_unaccent(value)` (fige le dictionnaire `unaccent` pour le rendre indexable en GIN).

### RPC quartiers

`SECURITY INVOKER`, `search_path=public, extensions`, EXECUTE `authenticated` + `service_role`,
révoqué d'`anon` :

- `quartier_for_point(p_org_id, p_lon, p_lat)` — point-dans-polygone
- `create_quartier_from_geojson(p_org_id, p_name, p_color, p_geojson)`
- `create_quartiers_batch(p_org_id, p_items, p_replace)` — import atomique ; `p_replace = true`
  **remplace tout le découpage** de l'organisation dans la même transaction (échec = aucun
  découpage perdu) ; un lot vide en mode remplacement est refusé
- `list_quartiers_geojson(p_org_id)` — seul point de sortie de `geom`, casté en GeoJSON
- `stats_contacts_by_quartier(p_org_id)` — inclut une ligne « sans quartier »
- `contacts_outside_quartiers(p_org_id)` — contacts géolocalisés hors de tout polygone

`SECURITY DEFINER` avec garde interne (`is_org_admin(p_org_id)` ou `service_role`) — nécessaires
car `contacts` n'a aucune policy d'écriture client :

- `recalculate_contact_quartiers(p_org_id)`
- `reset_orphan_manual_quartiers(p_org_id)` — après un import en remplacement, repasse en mode
  automatique les contacts rattachés **manuellement** à un quartier disparu (sinon ignorés à
  jamais par le recalcul) ; appelée par `create_quartiers_batch` en mode remplacement.

### Fonctions trigger

`SECURITY DEFINER`, **EXECUTE révoqué de `anon`/`authenticated`** (motif transverse, advisors
0028/0029 — sans effet sur leur déclenchement, seulement sur leur appel direct via
`/rest/v1/rpc/…`) : `handle_new_user`, `enforce_procedure_root_org`,
`enforce_document_type_root_org`, `enforce_document_template_root_org`,
`enforce_api_key_root_org`, `enforce_contact_root_org`,
`enforce_contact_role_root_org`, `enforce_contact_role_same_org`, `enforce_quartier_root_org`,
`assign_contact_quartier`, `sync_contact_external_ref_org`, `sync_contact_relation_org`,
`enforce_smtp_no_inherit_on_root`, `enforce_branding_root_no_inherit`,
`enforce_organization_application_root_org`, `provision_root_organization`,
`normalize_platform_settings` (SECURITY INVOKER, EXECUTE révoqué).

**Exceptions au motif** : `enforce_org_depth` et `set_updated_at` sont `SECURITY INVOKER`, EXECUTE
ouvert à `PUBLIC` — pas de lecture de table protégée, pas besoin de contourner le RLS.

---

## Extensions

Schéma dédié **`extensions`** : `postgis 3.3.7` (types géométriques, `quartiers.geom`),
`pg_trgm 1.6` (similarité trigram, rapprochement d'identités), `unaccent 1.1` (normalisation de
noms), `pgcrypto 1.3`, `uuid-ossp 1.1`. Hors schéma dédié : `pg_stat_statements`,
`supabase_vault`, `plpgsql`. **`pgsodium` n'est pas installé** (disponible au catalogue
seulement) — voir `smtp_settings.password` plus haut.

---

## Storage — buckets privés

### `procedure-documents` — documents de la base de connaissances

- Bucket **privé**, limite **25 Mio/fichier**, `allowed_mime_types = NULL` (aucun filtrage MIME
  côté serveur — la validation de format est purement applicative, côté `procedureStorage.ts`).
- **Isolation par convention de chemin** (pas de colonne dédiée) :
  `{organization_id racine}/{procedure_id}/{agent|training}/{uid}-{fichier}`.
- **4 policies** sur `storage.objects`, rôle `authenticated`, scopées
  `bucket_id = 'procedure-documents'` : SELECT `has_org_access((storage.foldername(name))[1]::uuid)` ;
  INSERT/UPDATE/DELETE `is_org_admin(...)` sur le même premier segment de chemin.
- Accès en lecture par **URL signée temporaire** ; la référence `{path, name}` est stockée dans
  `procedures.knowledge_base` (voir ci-dessous).

### `document-templates` — fichiers du catalogue de documents

- Bucket **privé**, limite **25 Mio/fichier**, `allowed_mime_types = NULL` (validation de format
  purement applicative, côté `src/features/documents/documentTemplates.ts` :
  `.doc`/`.docx`/`.odt`).
- **Isolation par convention de chemin** : `{organization_id racine}/{uid}-{fichier}`.
  ⚠️ **Pas de segment de document**, contrairement à `procedure-documents` : le fichier est
  déposé **avant** que la ligne `document_templates` existe, il n'y a donc pas d'id à y mettre ;
  le `uid` (`crypto.randomUUID()`) porte seul l'unicité.
- **4 policies** sur `storage.objects`, rôle `authenticated`, scopées
  `bucket_id = 'document-templates'` : SELECT `has_org_access((storage.foldername(name))[1]::uuid)` ;
  INSERT/UPDATE/DELETE `is_org_admin(...)`. L'UPDATE porte **`using` ET `with check`** — sans les
  deux, un objet pourrait être déplacé hors de son tenant.
- Accès en lecture par **URL signée temporaire** ; le chemin est stocké dans
  `document_templates.file_path`.

---

## Contrats JSONB possédés

`procedures.form_schema`, `procedures.requester_config`, `procedures.knowledge_base`,
`procedures.communication_config`, `procedures.user_communication`, `procedures.translations`
et `categories.translations` (ainsi
que `metadata`) portent des
commentaires SQL en base les qualifiant de **contrats possédés**, consommés en aval par
Ariane/Clara. `public-api` les **transmet tels quels**
(pass-through), sans les interpréter.

Leur structure n'est **pas** décrite ici (propriété du code applicatif et de l'OpenAPI) :
- Code source faisant foi : `src/features/procedures/*.ts` (`formSchema.ts`, `requesterFields.ts`,
  `knowledgeBase.ts`, `communication.ts`, `userCommunication.ts`, `conditions.ts`, `formats.ts`
  — tous testés).
- ⚠️ `user_communication` (2026-09-18, étape « Communication usager ») porte un invariant que les
  autres n'ont pas : **tout ce qu'elle contient est PUBLIC**. C'est ce qui permet à `public-api`
  de la servir telle quelle sur le détail portail, sans whitelist clé par clé. Rien de ce qui
  sert à **instruire** n'y entre : cela vit dans `knowledge_base` (agent et IA) ou dans
  `communication_config` (diffusion, documents de l'agent), qui ne traversent ni l'un ni
  l'autre. Quatre blocs : `delays`, `audience`, `attachments`, `faq`.
  ⚠️ Ses défauts sont **VIDES** (NULL = « la collectivité n'a rien écrit »), à l'inverse du bloc
  `visibility` de `communication_config`. ⚠️ **Le descriptif usager n'y est pas** : c'est la
  colonne `user_description`. ⚠️ **`delays` n'est pas `input_duration_minutes`** — celui-ci est
  la durée de SAISIE, celui-là la durée d'INSTRUCTION (avec son unité, jamais déduite du
  nombre). ⚠️ **`attachments.items` n'est pas la liste des pièces à téléverser** (ce sont les
  champs `attachment` de `form_schema`) : c'est un texte d'annonce, qui peut les recouper.
  ⚠️ **Deux FAQ coexistent sur la même ligne** : `user_communication.faq` est publiée,
  `knowledge_base.faq` ne l'a jamais été.
- ⚠️ `communication_config` **NULL** n'est pas « non publiée » : c'est une démarche jamais passée
  par l'étape, à lire comme les valeurs par défaut (visible, non bornée). Le parseur applicatif
  le fait ; un consommateur SQL direct doit le faire aussi. ⚠️ Le bloc `documents` du même JSON
  fait **exception** : ses défauts sont **vides** (aucun document proposé), pas actifs — sans quoi
  une colonne NULL déverserait tout le catalogue dans chaque démarche.
- ⚠️ Le bloc `communication_config.documents` référence `document_templates` **sans clé
  étrangère** : une sélection survit à la suppression de son document. L'UI comme `public-api`
  écartent ces références mortes ; un consommateur SQL direct doit joindre, pas faire confiance.
- ⚠️ `translations` (sur `procedures` **et** `categories`) a une forme depuis le 2026-09-06 :
  `{ "<code de langue>": { "name": "…", "short_description": "…" } }`, code faisant foi
  `src/features/languages/translations.ts` (testé). Les clés sous une langue sont celles des
  **colonnes françaises** correspondantes ; `short_description` n'existe que sur `procedures`
  (ajouté le 2026-09-07 — une catégorie n'a pas de descriptif). Trois règles portent tout le
  reste : **jamais de clé `fr`** (le texte français est la colonne — l'y écrire créerait une
  seconde source de vérité) ; un **champ absent = repli sur la colonne française**, pas un texte
  vide ; et ce repli se fait **champ par champ**, une langue pouvant légitimement porter le
  libellé traduit sans le descriptif. Les traductions d'une langue **désactivée** sont
  **conservées** (le réglage gouverne l'usage, pas la donnée — motif `email_sender_name`) : elles
  restent donc lisibles en base alors que la collectivité ne les affiche plus.
- Contrat publié : `/api-doc` (Redoc, `public-api/openapi.json`).

La sérialisation des deux Edge Functions applique une **whitelist stricte** : aucune colonne
sensible ne peut fuir sur un `select *`. Colonnes explicitement **non exposées** : `is_active_global`,
`api_keys.key_hash`, la géométrie binaire `quartiers.geom`. Les colonnes de `smtp_settings` ne
sortent que par `GET /v1/organizations/{id}/smtp` (scope `smtp`, cf. Points de vigilance).
Exception assumée : `contacts.internal_notes` **est** exposée par `contacts-api` (API
serveur-à-serveur pour les apps agents) malgré le commentaire SQL de la colonne — documentée dans
l'OpenAPI de `contacts-api`, voir Points de vigilance.

La fiche contact expose aussi l'objet **`quartier` résolu** (`{id, name, color}`), construit via
un embed PostgREST centralisé dans la constante `CONTACT_SELECT` de `contacts-api`. De même, la
démarche expose **`documents` résolu** (libellé, type, groupe, nom de fichier) à partir du bloc
`communication_config.documents` et du catalogue, via `loadTemplates` dans `public-api` —
⚠️ `document_templates.file_path` n'est **jamais** exposé : le fichier passe par
`GET /v1/document-templates/{id}/signed-url`.

---

## Points de vigilance

Constats du 2026-08-12, à traiter ou à surveiller — non masqués :

- **Cascade totale sur `organizations.parent_id`** : supprimer une organisation efface
  récursivement son sous-arbre, ses contacts, ses quartiers, ses démarches et ses clés API.
  Aucun garde-fou en base au-delà de la policy DELETE (super admin + non-racine).
- **FK sans `ON DELETE`**, pouvant bloquer silencieusement une suppression : `procedures.category_id`,
  `api_keys.created_by`, `contact_relations.role_id`.
- **Colonnes de tenant nullables** : `categories.organization_id`, `procedures.organization_id`,
  `organization_procedures.organization_id`/`procedure_id`, `user_organizations.user_id`/
  `organization_id` — le discriminant de tenant peut être `NULL` en base.
- **`categories`** : seule table métier scopée organisation sans trigger de rattachement racine
  ni index d'unicité de nom. Rien n'empêche en base une démarche d'une racine A d'être catégorisée
  sous une catégorie d'une autre racine — seule l'UI filtre par organisation.
- **Absence de policy UPDATE sur `user_organizations`** : changer le rôle d'un membre en place est
  impossible côté client ; l'UI doit supprimer puis recréer la ligne.
- **`api_keys.scopes`** : borné par CHECK depuis le 2026-09-08 (`read`, `contacts`, `smtp`,
  `ai`) ; les fonctions vérifient le scope requis (`read` par `public-api`, `contacts` par
  `contacts-api`, `ai` par `ai-api`). Un cinquième scope s'ajoute au CHECK ET aux fonctions.
- **`provision_root_organization`** a des effets de bord sur l'insert d'une racine (rôles, plafond,
  domaine) : un script qui insère des racines les subit — neutraliser `platform_settings` en tête
  de transaction (`plafond-ia.test.sql`).
- **`quartiers.created_by`** : uuid sans FK ni contrainte.
- **`procedures.updated_at`** sans trigger `set_updated_at`, contrairement aux quatre autres
  tables horodatées.
- **`contacts.internal_notes`** exposée par `contacts-api` alors que le commentaire SQL de la
  colonne interdit toute sérialisation publique — divergence assumée et documentée dans l'OpenAPI,
  mais à garder à l'esprit pour tout nouveau consommateur de données usagers.
` — la même forme que
  `api_keys.consumer`, c'est la même valeur), `name`, `scope` CHECK `('abonnement' |
  'plateforme')`. Seed : `nora`, `iris`, `clara` (abonnement), `socle` (plateforme — la clé de
  `translate-labels` sert toute racine). RLS : lecture `authenticated`, écriture `is_super_admin()`.
- `organization_applications (organization_id, application_id)` PK, FK CASCADE des deux côtés,
  `created_at`, `created_by`. Trigger `enforce_organization_application_root_org` (racine
  obligatoire). RLS : lecture `has_org_access OR is_admin_of_self_or_ancestor` · INSERT/DELETE
  `is_super_admin()` — souscrire est une décision commerciale.
- **Transition** : la migration a abonné toutes les racines existantes à toutes les applications
  `abonnement` (aucune régression au déploiement) ; les racines suivantes sont opt-in.

### `api_keys`

- `organization_id` uuid **NULLABLE**, FK CASCADE — **NULL = clé plateforme**, rattachée à une
  **application** (`consumer`) et bornée aux collectivités **abonnées** à celle-ci
  (`application_scope_ids`) — plus « toutes les organisations » depuis le 2026-09-08 ; sinon
  racine imposée par `trg_enforce_api_key_root_org` (avec `organization_id IS NULL`, la recherche
  de parent ne ramène rien, donc la clé plateforme passe le trigger sans déclencher l'erreur de
  non-racine).
- `name`, `key_prefix`, `key_hash` **UNIQUE** (SHA-256, jamais stocké en clair), `scopes text[]`
  NOT NULL défaut `{read}`, **CHECK `scopes <@ '{read,contacts,smtp,ai}'`** (2026-09-08 — un
  cinquième scope s'ajoute ici ET dans les fonctions), `last_used_at`/`expires_at`/`revoked_at`/
  `created_at` timestamptz, `created_by` FK `users(id)` **sans `ON DELETE`** (bloque la suppression
  d'un utilisateur ayant créé une clé).
- `consumer text` NULLABLE, **FK `applications(id)`** (2026-09-08 ; CHECK de forme depuis le
  2026-08-29) — **l'application** de la clé, et l'imputation d'un appel facturé. Elle vient de la
  CLÉ, jamais du corps de la requête : sans cela n'importe quelle application pourrait faire porter
  sa dépense à une autre (doctrine « périmètre dérivé de la clé »). **CHECK
  `api_keys_platform_requires_consumer`** : une clé plateforme vivante porte une application (une
  clé révoquée en est dispensée — elle est morte). `ai-api` refuse toute clé de scope `ai` sans
  `consumer`, liée comprise — une dépense sans imputation ne peut être ni facturée ni expliquée.
- **RLS** : une seule policy `ALL is_super_admin()` — gestion réservée au super admin. Côté UI,
  les clés d'une racine (partenaires) se gèrent depuis sa page (`OrgSettingsPage`, section « API
  publique ») et les clés plateforme depuis `/superadmin/applications`, une liste par application,
  cf. [architecture.md](./architecture.md).


### Plafond et journal d'utilisation IA

Trois tables (`20260829100100`), portées depuis Iris quand la clé du fournisseur LLM et sa
comptabilité ont été centralisées ici (2026-08-29).

> **La phrase qui résume le modèle : l'application consommatrice discrimine le JOURNAL, jamais le
> compteur, jamais le plafond.** Un budget est une affaire de collectivité ; savoir *qui* a
> dépensé est une question d'explication, pas de comptage.

- **`ai_usage_quotas`** — `organization_id` FK CASCADE, `provider text` NOT NULL,
  `monthly_limit_tokens` bigint, `is_active` bool, UNIQUE `(organization_id, provider)`.
  ⚠️ `provider` porte la sentinelle **`'__global__'`** et jamais NULL : deux NULL ne sont jamais
  égaux pour un index UNIQUE, ce qui casserait `ON CONFLICT` — régression vécue chez Clara. Le
  trigger `enforce_ai_usage_quota_root_org` impose une organisation **principale**.
- **`ai_usage_counters`** — `(organization_id, provider, period)` UNIQUE, `used_tokens` et
  `reserved_tokens` bigint. `period` = `to_char(now() at time zone 'utc', 'YYYY-MM')` : **tout
  est en UTC**, sans quoi une date de renouvellement annoncée en heure locale mentirait d'un mois
  entier deux heures par mois.
- **`ai_usage_events`** — le journal : `consumer` NOT NULL (dénormalisé **depuis la clé**),
  `api_key_id`, `feature` (déclaratif, étiqueté comme tel), `resource_type`, `status`,
  `estimated_tokens`/`actual_tokens`, et des références **nues** vers l'extérieur —
  `external_ref_kind`/`external_ref_id`/`external_actor_id`, uuid **sans FK**. Aucune FK ne
  franchit une frontière de projet, et une cascade effacerait une consommation facturée.
  ⚠️ **Aucune colonne ne peut porter un prompt ou une réponse**, et c'est la première preuve du
  passe-plat : un test épingle l'ensemble exact des 17 colonnes, si bien qu'une future colonne
  `prompt`/`content`/`answer` le casse.

- **`ai_usage_rate`** (2026-08-29) — le garde-fou de **DÉBIT**, que le plafond ne couvre pas :
  il dit *combien*, jamais *à quelle vitesse*, et une boucle accidentelle consommerait un mois
  en quelques minutes. Clé primaire composite `(organization_id, subject_kind, subject,
  **bucket**, window_start)`, `attempts int` ; pas de colonne `id` — la recherche EST la clé et
  ces lignes sont éphémères, un uuid de substitution serait un second index à tenir sur le
  chemin chaud de chaque appel. Purgée par `purge_ai_usage_rate`, enchaînée au job cron.
  ⚠️ **`bucket` est DANS LA CLÉ, pas à côté** (`'chat'` | `'batch'`) : différencier le seuil
  sans séparer le compteur laisserait un lot d'OCR manger le budget de QUESTIONS du même agent
  — après vingt documents lus, sa question suivante serait refusée alors qu'il n'en a posé
  aucune.
  ⚠️ **Elle compte les TENTATIVES, pas les appels aboutis** : une boucle que le plafond refuse
  déjà continue de marteler, et un compteur de succès ne la couperait jamais.

**Cycle réserver → appeler → solder, et DEUX portes avant lui.** `reserve_ai_usage` vérifie
d'abord la **cadence**, puis le **plafond**. Les seuils sont **en dur** (un garde-fou n'est pas
un paramètre commercial) et dépendent de la NATURE de l'appel — conversationnel 20/minute par
agent (120 sans agent), lot d'OCR 60 (360 sans agent) : un humain qui lit 150 mots entre deux
questions n'a pas le rythme d'une machine qui enchaîne des documents.
⚠️ La nature vient de `p_resource_type`, **dérivé côté serveur** par `ai-api` et jamais lu dans
le corps de la requête : un appelant ne peut pas se déclarer « lot » pour obtenir la limite
haute. Tout type inconnu retombe sur le seuil conversationnel, le plus strict. Chacune est
**UN `UPDATE` conditionnel** : zéro ligne affectée ⇒ refus, et le fournisseur n'est jamais
appelé. ⚠️ La porte de cadence passe **en premier**, pour trois raisons : elle doit compter les
tentatives y compris refusées ; rien n'est encore incrémenté quand elle refuse, donc il n'y a
aucun retour en arrière à écrire ; et elle doit protéger les collectivités **sans plafond**, qui
sortent de la fonction par un `return` anticipé et échapperaient à toute garde placée après. C'est la porte de
concurrence — un verrou de ligne Postgres en READ COMMITTED, pas un `select` suivi d'un `update`.
`settle_ai_usage` corrige ensuite avec la consommation réelle ; un échec ne consomme rien.
`release_stale_ai_reservations` (cron, 15 min) rattrape les réservations orphelines.

**RLS** : `for select to authenticated using (public.is_admin_of_self_or_ancestor(organization_id))`
sur les trois tables (`20260829110000`, élargi depuis `is_super_admin()` — la collectivité doit
pouvoir lire sa propre consommation sans écrire à l'éditeur). Les lignes étant clés sur une
**racine**, le prédicat coïncide avec « admin direct » : un admin de sous-organisation ne voit
rien, le budget n'est pas son affaire. Le helper court-circuite le super admin, que la policy
n'a donc pas à nommer.
**Aucune policy d'écriture, aucune policy `service_role`** — les écrivains sont des RPC
`SECURITY DEFINER`, hors RLS par construction. Les RPC de réglage (`set_ai_usage_quota`,
`delete_ai_usage_quota`) sont gardées par `is_super_admin()`, fondée sur `auth.uid()` : ⚠️ ne
jamais la remplacer par une garde fondée sur `current_user`, qui vaut toujours le propriétaire
à l'intérieur d'une fonction `DEFINER`. ⚠️ **Ouvrir la lecture n'ouvre pas le réglage** : c'est
tout l'équilibre de l'écran de consultation `/consommation-ia` — un plafond que son porteur
pourrait lever ne serait pas un plafond.
`ai_usage_breakdown` étant `SECURITY INVOKER`, elle suit ces policies sans changement : une
implémentation, trois lecteurs (le service, l'éditeur, le client).

---

## Fonctions SQL

### Helpers RLS

Tous `SECURITY DEFINER`, `search_path=public`, EXECUTE ouvert à `anon`/`authenticated`
(indispensable : la RLS les évalue avec les droits de l'appelant, pas ceux du définisseur) :

- `is_super_admin()`
- `is_org_admin(org_id)` — admin **direct**, court-circuité par super admin
- `has_org_access(org_id)` — membre **direct**
- `is_admin_of_self_or_ancestor(org_id)` — `STABLE`, boucle ascendante sur `parent_id` (garde
  100 itérations), vrai si super admin

### `org_subtree_ids(root)` — périmètre des APIs

SQL `STABLE`, **`SECURITY INVOKER`**, CTE récursive sur `parent_id`. C'est le point qui borne
chaque requête de `public-api` au sous-arbre de l'organisation de la clé appelante.

`EXECUTE` **réservé à `service_role`** depuis le 2026-08-12 (migration
`org_subtree_ids_revoke_execute`) : l'ACL historique accordait aussi `anon`/`authenticated` —
sans impact réel (`SECURITY INVOKER` ⇒ RLS de l'appelant) — elle suit désormais le motif des
fonctions trigger.

### RPC serveur d'envoi (SMTP)

- `resolve_smtp_settings(p_org_id) → SETOF smtp_settings` — SQL `STABLE`, **`SECURITY INVOKER`**,
  CTE ascendante sur `parent_id` (garde 20 niveaux) : renvoie 0 ou 1 ligne, celle de l'ancêtre le
  plus proche (soi compris) dont `inherit_parent = false`. **Seule implémentation de l'héritage**,
  partagée par `public-api` (`GET /v1/organizations/{id}/smtp`) et les trois fonctions d'envoi
  (`send-test-email`, `invite-user`, `auth-email-hook`). Elle sert le **mot de passe** : `EXECUTE`
  **réservé à `service_role`** (motif `org_subtree_ids`).
- `parent_smtp_settings(p_org_id) → TABLE(source_organization_id, source_organization_name,
  configured, host, port, username, from_email, from_name, use_tls)` — `SECURITY DEFINER`, garde
  interne `is_admin_of_self_or_ancestor(p_org_id)`, EXECUTE `authenticated` + `service_role`.
  Aperçu de ce dont une organisation **hérite** (résolution démarrée à son parent), **sans le mot
  de passe** : l'admin d'une sous-organisation doit voir la configuration qui s'applique chez lui
  sans obtenir le secret de sa principale. Renvoie 0 ligne sur une racine.

### RPC charte graphique

Calquées trait pour trait sur les deux RPC SMTP ci-dessus.

- `resolve_branding(p_org_id) → TABLE(source_organization_id, logo_url, logo_white_url,
  favicon_url, primary_color, secondary_color)` — SQL `STABLE`, **`SECURITY INVOKER`**, CTE
  ascendante qui s'arrête d'elle-même au premier ancêtre ne héritant pas (garde 20 niveaux).
  **Seule implémentation de l'héritage.** EXECUTE **réservé à `service_role`** : elle traverse des
  organisations que l'appelant n'a pas le droit de lire.
- `parent_branding(p_org_id) → TABLE(source_organization_id, source_organization_name, configured,
  logo_url, logo_white_url, favicon_url, primary_color, secondary_color)` — `SECURITY DEFINER`,
  garde interne `is_admin_of_self_or_ancestor(p_org_id)`, EXECUTE `authenticated` + `service_role`.
  Aperçu de ce dont une organisation **hérite** (résolution démarrée à son parent) : sans elle,
  l'admin d'une sous-organisation choisirait d'hériter sans jamais voir de quoi. Renvoie 0 ligne
  sur une racine. `configured` = au moins un des **cinq** éléments renseigné au-dessus.

⚠️ **Les recréer, c'est leur rendre leurs droits par défaut.** Ajouter une colonne à leur type de
retour impose un `drop function` ; Supabase accorde alors EXECUTE à `anon` et `authenticated`
**nommément**, et un `revoke ... from public` ne l'enlève pas. Toute migration qui les redéfinit
doit reposer les droits en citant les **trois** rôles — la migration
`branding_functions_revoke_execute` (2026-08-30) le disait déjà, `..._bis` (2026-09-12) a dû le
redire après l'ajout du favicon.

### RPC et fonction langues

- `resolve_org_languages(p_org_id) → text[]` — SQL `STABLE`, `SECURITY INVOKER`, CTE ascendante
  jusqu'à la racine (garde 20 niveaux) : les langues **applicables** à une organisation, c'est-à-dire
  celles de son organisation principale. **Seule implémentation de la remontée** (motif
  `resolve_branding`), servie par `public-api` (`GET /v1/portal/tenant`, champ `languages`) —
  EXECUTE **réservé à `service_role`** : elle traverse des organisations que l'appelant n'a pas le
  droit de lire. Les écrans du Socle n'en ont pas besoin : ils lisent la colonne de la racine,
  qu'ils connaissent déjà.
- `is_valid_language_set(codes text[]) → bool` — SQL `IMMUTABLE`, support du CHECK sur
  `organizations.enabled_languages` : au moins `fr`, pas de doublon, codes de la forme
  `^[a-z]{2,3}(-[a-z0-9]{2,8})*$`. Miroir de `LANGUAGE_CODE_RE` côté application.

### `match_contacts(...)` — rapprochement d'identités

`match_contacts(p_org_id, p_contact_type, p_first_name, p_last_name, p_usage_name, p_legal_name,
p_siret, p_birth_date, p_email, p_phones[], p_status, p_exclude_ids[], p_limit) → TABLE(contact_id,
score int, reasons text[])`. `SECURITY INVOKER`, `search_path=""`, **EXECUTE réservé à
`service_role`**. Sert `POST /v1/contacts/match` de `contacts-api` — détail du scoring et des
critères dans [../CLAUDE.md](../CLAUDE.md) et l'OpenAPI de `contacts-api`.

### Fonctions de normalisation

`IMMUTABLE`, `search_path=""` — support des index et de la recherche :
`normalize_phone(raw)`, `normalize_name(value)`, `match_full_name(family, given)`,
`immutable_unaccent(value)` (fige le dictionnaire `unaccent` pour le rendre indexable en GIN).

### RPC quartiers

`SECURITY INVOKER`, `search_path=public, extensions`, EXECUTE `authenticated` + `service_role`,
révoqué d'`anon` :

- `quartier_for_point(p_org_id, p_lon, p_lat)` — point-dans-polygone
- `create_quartier_from_geojson(p_org_id, p_name, p_color, p_geojson)`
- `create_quartiers_batch(p_org_id, p_items, p_replace)` — import atomique ; `p_replace = true`
  **remplace tout le découpage** de l'organisation dans la même transaction (échec = aucun
  découpage perdu) ; un lot vide en mode remplacement est refusé
- `list_quartiers_geojson(p_org_id)` — seul point de sortie de `geom`, casté en GeoJSON
- `stats_contacts_by_quartier(p_org_id)` — inclut une ligne « sans quartier »
- `contacts_outside_quartiers(p_org_id)` — contacts géolocalisés hors de tout polygone

`SECURITY DEFINER` avec garde interne (`is_org_admin(p_org_id)` ou `service_role`) — nécessaires
car `contacts` n'a aucune policy d'écriture client :

- `recalculate_contact_quartiers(p_org_id)`
- `reset_orphan_manual_quartiers(p_org_id)` — après un import en remplacement, repasse en mode
  automatique les contacts rattachés **manuellement** à un quartier disparu (sinon ignorés à
  jamais par le recalcul) ; appelée par `create_quartiers_batch` en mode remplacement.

### Fonctions trigger

`SECURITY DEFINER`, **EXECUTE révoqué de `anon`/`authenticated`** (motif transverse, advisors
0028/0029 — sans effet sur leur déclenchement, seulement sur leur appel direct via
`/rest/v1/rpc/…`) : `handle_new_user`, `enforce_procedure_root_org`,
`enforce_document_type_root_org`, `enforce_document_template_root_org`,
`enforce_api_key_root_org`, `enforce_contact_root_org`,
`enforce_contact_role_root_org`, `enforce_contact_role_same_org`, `enforce_quartier_root_org`,
`assign_contact_quartier`, `sync_contact_external_ref_org`, `sync_contact_relation_org`,
`enforce_smtp_no_inherit_on_root`, `enforce_branding_root_no_inherit`.

**Exceptions au motif** : `enforce_org_depth` et `set_updated_at` sont `SECURITY INVOKER`, EXECUTE
ouvert à `PUBLIC` — pas de lecture de table protégée, pas besoin de contourner le RLS.

---

## Extensions

Schéma dédié **`extensions`** : `postgis 3.3.7` (types géométriques, `quartiers.geom`),
`pg_trgm 1.6` (similarité trigram, rapprochement d'identités), `unaccent 1.1` (normalisation de
noms), `pgcrypto 1.3`, `uuid-ossp 1.1`. Hors schéma dédié : `pg_stat_statements`,
`supabase_vault`, `plpgsql`. **`pgsodium` n'est pas installé** (disponible au catalogue
seulement) — voir `smtp_settings.password` plus haut.

---

## Storage — buckets privés

### `procedure-documents` — documents de la base de connaissances

- Bucket **privé**, limite **25 Mio/fichier**, `allowed_mime_types = NULL` (aucun filtrage MIME
  côté serveur — la validation de format est purement applicative, côté `procedureStorage.ts`).
- **Isolation par convention de chemin** (pas de colonne dédiée) :
  `{organization_id racine}/{procedure_id}/{agent|training}/{uid}-{fichier}`.
- **4 policies** sur `storage.objects`, rôle `authenticated`, scopées
  `bucket_id = 'procedure-documents'` : SELECT `has_org_access((storage.foldername(name))[1]::uuid)` ;
  INSERT/UPDATE/DELETE `is_org_admin(...)` sur le même premier segment de chemin.
- Accès en lecture par **URL signée temporaire** ; la référence `{path, name}` est stockée dans
  `procedures.knowledge_base` (voir ci-dessous).

### `document-templates` — fichiers du catalogue de documents

- Bucket **privé**, limite **25 Mio/fichier**, `allowed_mime_types = NULL` (validation de format
  purement applicative, côté `src/features/documents/documentTemplates.ts` :
  `.doc`/`.docx`/`.odt`).
- **Isolation par convention de chemin** : `{organization_id racine}/{uid}-{fichier}`.
  ⚠️ **Pas de segment de document**, contrairement à `procedure-documents` : le fichier est
  déposé **avant** que la ligne `document_templates` existe, il n'y a donc pas d'id à y mettre ;
  le `uid` (`crypto.randomUUID()`) porte seul l'unicité.
- **4 policies** sur `storage.objects`, rôle `authenticated`, scopées
  `bucket_id = 'document-templates'` : SELECT `has_org_access((storage.foldername(name))[1]::uuid)` ;
  INSERT/UPDATE/DELETE `is_org_admin(...)`. L'UPDATE porte **`using` ET `with check`** — sans les
  deux, un objet pourrait être déplacé hors de son tenant.
- Accès en lecture par **URL signée temporaire** ; le chemin est stocké dans
  `document_templates.file_path`.

---

## Contrats JSONB possédés

`procedures.form_schema`, `procedures.requester_config`, `procedures.knowledge_base`,
`procedures.communication_config`, `procedures.translations` et `categories.translations` (ainsi
que `metadata`) portent des
commentaires SQL en base les qualifiant de **contrats possédés**, consommés en aval par
Ariane/Clara. `public-api` les **transmet tels quels**
(pass-through), sans les interpréter.

Leur structure n'est **pas** décrite ici (propriété du code applicatif et de l'OpenAPI) :
- Code source faisant foi : `src/features/procedures/*.ts` (`formSchema.ts`, `requesterFields.ts`,
  `knowledgeBase.ts`, `communication.ts`, `conditions.ts`, `formats.ts` — tous testés).
- ⚠️ `communication_config` **NULL** n'est pas « non publiée » : c'est une démarche jamais passée
  par l'étape, à lire comme les valeurs par défaut (visible, non bornée). Le parseur applicatif
  le fait ; un consommateur SQL direct doit le faire aussi. ⚠️ Le bloc `documents` du même JSON
  fait **exception** : ses défauts sont **vides** (aucun document proposé), pas actifs — sans quoi
  une colonne NULL déverserait tout le catalogue dans chaque démarche.
- ⚠️ Le bloc `communication_config.documents` référence `document_templates` **sans clé
  étrangère** : une sélection survit à la suppression de son document. L'UI comme `public-api`
  écartent ces références mortes ; un consommateur SQL direct doit joindre, pas faire confiance.
- ⚠️ `translations` (sur `procedures` **et** `categories`) a une forme depuis le 2026-09-06 :
  `{ "<code de langue>": { "name": "…", "short_description": "…" } }`, code faisant foi
  `src/features/languages/translations.ts` (testé). Les clés sous une langue sont celles des
  **colonnes françaises** correspondantes ; `short_description` n'existe que sur `procedures`
  (ajouté le 2026-09-07 — une catégorie n'a pas de descriptif). Trois règles portent tout le
  reste : **jamais de clé `fr`** (le texte français est la colonne — l'y écrire créerait une
  seconde source de vérité) ; un **champ absent = repli sur la colonne française**, pas un texte
  vide ; et ce repli se fait **champ par champ**, une langue pouvant légitimement porter le
  libellé traduit sans le descriptif. Les traductions d'une langue **désactivée** sont
  **conservées** (le réglage gouverne l'usage, pas la donnée — motif `email_sender_name`) : elles
  restent donc lisibles en base alors que la collectivité ne les affiche plus.
- Contrat publié : `/api-doc` (Redoc, `public-api/openapi.json`).

La sérialisation des deux Edge Functions applique une **whitelist stricte** : aucune colonne
sensible ne peut fuir sur un `select *`. Colonnes explicitement **non exposées** : `is_active_global`,
`api_keys.key_hash`, la géométrie binaire `quartiers.geom`. Les colonnes de `smtp_settings` ne
sortent que par `GET /v1/organizations/{id}/smtp` (scope `smtp`, cf. Points de vigilance).
Exception assumée : `contacts.internal_notes` **est** exposée par `contacts-api` (API
serveur-à-serveur pour les apps agents) malgré le commentaire SQL de la colonne — documentée dans
l'OpenAPI de `contacts-api`, voir Points de vigilance.

La fiche contact expose aussi l'objet **`quartier` résolu** (`{id, name, color}`), construit via
un embed PostgREST centralisé dans la constante `CONTACT_SELECT` de `contacts-api`. De même, la
démarche expose **`documents` résolu** (libellé, type, groupe, nom de fichier) à partir du bloc
`communication_config.documents` et du catalogue, via `loadTemplates` dans `public-api` —
⚠️ `document_templates.file_path` n'est **jamais** exposé : le fichier passe par
`GET /v1/document-templates/{id}/signed-url`.

---

## Points de vigilance

Constats du 2026-08-12, à traiter ou à surveiller — non masqués :

- **Cascade totale sur `organizations.parent_id`** : supprimer une organisation efface
  récursivement son sous-arbre, ses contacts, ses quartiers, ses démarches et ses clés API.
  Aucun garde-fou en base au-delà de la policy DELETE (super admin + non-racine).
- **FK sans `ON DELETE`**, pouvant bloquer silencieusement une suppression : `procedures.category_id`,
  `api_keys.created_by`, `contact_relations.role_id`.
- **Colonnes de tenant nullables** : `categories.organization_id`, `procedures.organization_id`,
  `organization_procedures.organization_id`/`procedure_id`, `user_organizations.user_id`/
  `organization_id` — le discriminant de tenant peut être `NULL` en base.
- **`categories`** : seule table métier scopée organisation sans trigger de rattachement racine
  ni index d'unicité de nom. Rien n'empêche en base une démarche d'une racine A d'être catégorisée
  sous une catégorie d'une autre racine — seule l'UI filtre par organisation.
- **Absence de policy UPDATE sur `user_organizations`** : changer le rôle d'un membre en place est
  impossible côté client ; l'UI doit supprimer puis recréer la ligne.
- **`api_keys.scopes`** : `text[]` libre, aucune contrainte de valeurs en base — `read`/`contacts`
  sont une convention applicative, pas un CHECK. La convention est en revanche **vérifiée par les
  deux APIs** depuis le 2026-08-12 (`read` requis par `public-api`, `contacts` par `contacts-api`).
- **`quartiers.created_by`** : uuid sans FK ni contrainte.
- **`procedures.updated_at`** sans trigger `set_updated_at`, contrairement aux quatre autres
  tables horodatées.
- **`contacts.internal_notes`** exposée par `contacts-api` alors que le commentaire SQL de la
  colonne interdit toute sérialisation publique — divergence assumée et documentée dans l'OpenAPI,
  mais à garder à l'esprit pour tout nouveau consommateur de données usagers.
