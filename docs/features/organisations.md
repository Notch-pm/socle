# Feature : hiérarchie d'organisations

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

- Arbre auto-référencé (`organizations.parent_id`), **10 niveaux max** (racine + 9),
  imposé par le trigger DB `enforce_org_depth` (bloque aussi les cycles).
- **Super admin** : agit sur toute la plateforme ; seul à créer des **organisations racines**
  et à **supprimer** (uniquement des sous-organisations, jamais une racine).
- **Admin d'organisation** : gère son org **et toute sa descendance** (créer/modifier/rendre
  obsolète), pas de suppression.
- Champs : `name` (obligatoire), `address`, `phone`, `email`, `status`
  (`active` | `obsolete`, obsolescence **réversible**), + `slug`, `type` hérités. Les cinq
  colonnes de **charte graphique** (`logo_url`, `logo_white_url`, `favicon_url`, `primary_color`,
  `secondary_color`) + `branding_inherit_parent` ont leur propre onglet — voir feature ci-dessous.
- RLS `organizations` : SELECT `has_org_access(id) OR is_admin_of_self_or_ancestor(id)` ·
  INSERT super_admin ou (parent défini ET admin d'un ancêtre) · UPDATE admin self/ancêtre ·
  DELETE `is_super_admin() AND parent_id IS NOT NULL`.

## Où est le code

- `src/features/organizations/` — UI **partagée** : `OrganizationTree` (arbre récursif),
  `OrganizationsManager` (conteneur CRUD + dialogues), `OrganizationsPage` (route admin).
- `src/features/superadmin/organizations/` — hooks (`useOrganizationsAdmin.ts` : requêtes,
  mutations, `buildOrgTree`, `MAX_ORG_DEPTH`), `OrganizationFormDialog`, et `OrgSettingsPage`
  (page d'une org : arborescence + cartes de paramétrage — infos, utilisateurs, SMTP…).
- Le même `OrganizationsManager` sert les deux zones : `canManageRoots=false` côté admin ;
  `canManageRoots` + `rootOrganizationId` (arbre **borné au sous-arbre** de l'org) + `onConfigure`
  côté superadmin, en accueil d'`OrgSettingsPage`.
- **Menu latéral superadmin** (`SuperAdminSidebar`) : chaque **organisation principale** (racine
  stricte, `parent_id` null) est une entrée de sous-menu sous « Organisations » (libellé **non
  cliquable**), triée par nom (helper pur `sortedRootOrganizations` dans `orgTree.ts`, testé) →
  mène à son `OrgSettingsPage`, dont l'accueil affiche l'**arbre du sous-arbre** (racine +
  sous-organisations). Les racines sont les **clients** : aucune vue ne fond tous les clients
  dans un même arbre (`/superadmin/organisations` **n'existe plus**, redirection vers
  `/superadmin`). La création d'une racine se fait par le bouton icône « + » de la ligne
  « Organisations » (même `OrganizationFormDialog`). Sous les organisations, l'entrée **« Applications »**
  (`/superadmin/applications`, une clé plateforme par application) et l'entrée **« Plateforme »**
  (`/superadmin/plateforme`, réglages de plateforme et rejeu du provisioning) — voir features
  « Applications et abonnements » et « Mise en service d'un client ». En pied de menu, un groupe
  **« Documentation des API »** (catalogue partagé `src/features/public-api-docs/apiDocLinks.ts`,
  voir feature « Shell de l'app ») : « API Référentiel » et « API Usagers », en **nouvel onglet**
  et **sans état actif** — c'est d'ici qu'on délivre les clés, c'est ici qu'on doit pouvoir relire
  ce qu'elles ouvrent.

## Édition d'organisation en pleine page (app par organisation)

Côté **admin** (`/organisations`), l'action « éditer » ouvre une **page dédiée à onglets**
(`OrganizationEditorPage`, route `organisations/:orgId`) au lieu de la modale — le superadmin
garde sa modale (`OrganizationsManager` reçoit `onEditOrganization` seulement côté admin).

- **Onglet « Informations de base »** (`OrganizationInfoTab`) : formulaire complet
  (nom, parent, adresse, téléphone, courriel, type, slug — ⚠️ **plus le logo**, parti dans
  l'onglet « Charte graphique » le 2026-08-30) enregistré via
  `useUpdateOrganization` + liste des **sous-organisations** (bouton « Éditer » → même page pour
  l'enfant, « Ajouter » via `OrganizationFormDialog`). Inclut aussi, **pour toute organisation
  (sous-orgs comprises)**, un toggle **« Expéditeur spécifique pour les e-mails »** :
  colonnes `organizations.email_sender_override` (bool, défaut false) + `email_sender_name` (text).
  Si activé, on saisit un nom d'expéditeur propre à l'org ; sinon le nom du SMTP applicable
  (celui de l'org ou celui dont elle hérite) est utilisé.
  Le nom est **conservé** en base quand on désactive (le flag gouverne l'usage). L'edge function
  `send-test-email` applique ce nom quand `email_sender_override` est vrai. La colonne est
  consommée en aval (Ariane/Clara). Écriture couverte par le RLS UPDATE `organizations`
  (`is_admin_of_self_or_ancestor`).
- **Onglet « Charte graphique »** (`BrandingSection`, visible sur **toute** organisation) :
  `logo_url` (logo couleur), `logo_white_url` (logo blanc, fonds sombres), `favicon_url` (icône de
  l'onglet du navigateur sur le site de démarches — 2026-09-12), `primary_color`,
  `secondary_color` (hexadécimal `#rrggbb`, CHECK en base ; la saisie normalise `#ABC` → `#aabbcc`
  — deux écritures de la même couleur ne doivent pas se lire comme deux couleurs en aval). Le Socle
  **enregistre et publie** : aucun habillage de l'app ne change, l'aval s'y adosse.
  ⚠️ **Le favicon est un élément de CHARTE, pas de thème** (motif de la couleur, à l'envers) : le
  thème du portail dit COMMENT peindre, la charte dit AVEC QUOI — et une icône est une image de la
  collectivité. Il hérite donc comme les logos, ce qui donne son icône à une sous-organisation qui
  tient son propre guichet sans que personne la ressaisisse. C'est une **URL libre** comme les
  logos : le Socle n'héberge rien, ne redimensionne rien, ne vérifie pas que l'image est carrée —
  c'est Nora qui écarte ce qu'elle ne peut pas peindre (`https` seulement, règle commune aux
  logos et aux images de blocs).
  ⚠️ **Les CINQ éléments comptent dans « configuré »** (`isBrandingEmpty` ici, `configured` du DTO
  et de `parent_branding` en aval, testés des deux côtés) : à quatre, une collectivité qui n'aurait
  déposé que son favicon s'entendrait répondre qu'elle n'a pas de charte, et le consommateur
  retomberait sur son habillage par défaut en ignorant le seul élément qu'elle a rempli.
  **Héritage** : sur une sous-organisation, un commutateur **« Utiliser la charte graphique de
  l'organisme parent »** (`branding_inherit_parent`, **activé par défaut**) remplace le formulaire
  par l'aperçu de la charte héritée (RPC `parent_branding`) ; le désactiver ouvre la saisie d'une
  charte propre. Même motif que le relais SMTP : rien n'est recopié, la résolution se fait à la
  lecture (`resolve_branding`, service_role). Écriture par le RLS UPDATE `organizations`
  (`is_admin_of_self_or_ancestor`) — pas de table dédiée, ce sont des colonnes de l'organisation.
  ⚠️ Une organisation qui hérite **garde ses valeurs propres** (le commutateur gouverne l'usage,
  pas la donnée — motif `email_sender_name`) : le retour en arrière est toujours possible.
  ⚠️ Une **racine n'hérite jamais** : le trigger `enforce_branding_root_no_inherit` la **corrige**
  à `false` au lieu de refuser, la colonne valant `true` par défaut (sans quoi toute création de
  racine échouerait). ⚠️ La migration a repassé en « charte propre » les sous-organisations qui
  **portaient déjà un logo** : les basculer en héritage leur aurait silencieusement substitué
  celui de leur parent.
  Côté superadmin, la même section est une carte d'`OrgSettingsPage` (`?section=charte`).
  Le logo a aussi disparu de l'`OrganizationFormDialog` (création/édition superadmin) : posé là,
  il aurait été enregistré puis ignoré sur une sous-organisation qui hérite.
  **En aval** : la charte est servie **résolue** par `GET /v1/organizations/{id}/branding`
  (`public-api`, scope `read`, contrat 1.5.0 ; `favicon_url` en **1.21.0** — voir feature
  « API publique »). ⚠️ Les quatre colonnes ajoutées ne sont **pas** exposées sur
  `OrganizationDto` et ne doivent pas l'être : brutes, elles sont nulles sur une organisation qui
  hérite. ⚠️ Migrations `organizations_favicon` + `branding_functions_revoke_execute_bis` :
  ajouter une colonne au type de retour de `resolve_branding` / `parent_branding` impose de les
  **déposer**, et les recréer leur **rend les EXECUTE par défaut** d'`anon`/`authenticated` — que
  `revoke ... from public` n'enlève pas. Reposer les droits en citant les **trois** rôles.
  Côté Nora, le favicon se pose en `<link rel="icon">` (`src/features/portal/favicon.ts`) :
  ⚠️ **son absence n'est pas un effacement**, l'onglet garde ce qu'il affichait.
- **Onglet « Recommandations aux agents »** (`AgentGuidanceSection`, 2026-09-19, **organisation
  principale uniquement** — une sous-organisation y lit que le réglage vit sur sa racine) : ce que
  la collectivité dit **à ses agents**, pour toutes ses démarches à la fois — rôle des agents et
  accueil physique (Markdown), **consignes générales** (titre + texte, ajout/suppression), FAQ des
  agents, sources de données recommandées. Table `organization_agent_guidance` (une ligne par
  racine, trigger `enforce_agent_guidance_root_org`), contrat pur `agentGuidance.ts` (testé, miroir
  edge testé contre lui), servi par `GET /v1/organizations/{id}/agent-guidance` (1.27.0).
  ⚠️ **Version globale de `knowledge_base`**, jamais fusionnée avec elle : même public (l'agent et
  son assistant IA), mêmes éditeurs (`MarkdownField`, `FaqEditor`, `LinkListEditor`), et la
  consigne d'une démarche l'emporte. ⚠️ **« Consignes », pas « procédures »** : le mot désigne
  déjà les démarches et `proceduresText`. ⚠️ **Interne** : aucune route du portail ne le sert.
  ⚠️ **Une table et non une colonne** : `organizations` se lit en `select("*")` partout.
  Côté superadmin, la même section est une carte d'`OrgSettingsPage` (`?section=agents`).
- **Onglet « Informations usagers »** (`UserInfoSection`, 2026-09-24, **toute organisation**,
  sous-organisation comprise — chaque annexe a ses horaires — **sauf un service interne**, où
  l'onglet et la carte superadmin sont retirés : `hasUserInfoTab`) : ce que l'organisme dit **au public**
  — un **descriptif**, ses **horaires d'accueil** et une **FAQ usagers**. Horaires
  **structurés** (`OpeningHoursEditor`) : pour chaque jour, un interrupteur « Ouvert » et quatre
  heures `HH:MM` — ouverture et fermeture **obligatoires**, pause de midi (fin de matinée → début
  d'après-midi) facultative mais **par paire**, heures strictement croissantes (`dayHoursError`,
  seule implémentation de la règle ; les erreurs ne s'affichent qu'à l'enregistrement, qui est
  bloqué). ⚠️ Un jour absent du contrat est **fermé** ; une liste vide = non renseigné. Le
  parseur **écarte** un jour incohérent, il ne le répare pas. Sous la grille, des **remarques
  sur les horaires** (`openingHoursNotes`, Markdown) : fermetures exceptionnelles, jours fériés,
  horaires d'été — ce que la grille ne sait pas dire. Table `organization_user_info` (une ligne par organisation,
  RLS calquée sur `organizations` : écriture `is_admin_of_self_or_ancestor`), contrat pur
  `userInfo.ts` (testé, miroir edge `public-api/_shared/userInfo.ts` testé contre lui), servi par
  `GET /v1/portal/organizations?tenant_id=` (1.30.0) — donc au **corpus de l'assistant du
  portail** (voir [`assistant-usager.md`](assistant-usager.md)).
  ⚠️ **Public, tout entier, dès l'enregistrement** : pas de brouillon (comme l'adresse de la
  fiche) ; l'écran le dit. C'est le **pendant usager** des recommandations aux agents, qui restent
  internes : les deux ne se fusionnent jamais, et le champ « accueil physique » des
  recommandations renvoie ici pour les horaires. ⚠️ **Pas d'héritage** : un organisme qui n'a rien
  écrit n'est pas listé, il n'emprunte pas les horaires de son parent. ⚠️ La route ne sert que les
  organismes **affichés** (actifs, pas service interne) — d'où l'onglet retiré sur un service
  interne. Depuis 1.31.0, elle porte aussi le **téléphone** et le **courriel** de la fiche
  (« Informations de base »), et liste un organisme qui n'a que ça (rubriques vides). Français seulement pour l'instant (pas de `translations`). Côté superadmin, même
  composant en carte d'`OrgSettingsPage` (`?section=usagers`).
- **Onglet « Langues »** (`LanguagesSection`, **organisation principale uniquement** — une
  sous-organisation y lit qu'elle suit sa racine) : quelles langues la collectivité active pour
  s'adresser à ses usagers. Voir feature « Langues et libellés traduits ».
- **Onglet « Démarches »** (`OrganizationProceduresTab`) : **activation par organisation**. Liste
  le catalogue de l'**organisation principale** (ancêtre racine, `findRootAncestor`) avec un
  `Switch` par démarche. L'activation est **opt-in** : une démarche est active ⇔ une liaison
  `organization_procedures` existe avec `is_enabled = true` (helper pur `buildEnabledProcedureIds`,
  testé). Écriture par **upsert** sur la contrainte unique `(organization_id, procedure_id)`
  (`useSetProcedureEnabled`), lecture via `useOrganizationProcedureBindings`.
  ⚠️ Une démarche déjà portée par le **porteur ou un service interne frère** a son interrupteur
  désactivé (« Déjà activée par « X » ») : un seul instructeur par porteur — voir la feature
  « Services internes ».
- RLS `organization_procedures` : lecture `has_org_access(organization_id) OR
  is_admin_of_self_or_ancestor(organization_id)` · écriture (INSERT/UPDATE/DELETE)
  `is_admin_of_self_or_ancestor(organization_id)` — un admin active les démarches sur **tout son
  sous-arbre** (migration `org_procedures_rls_admin_subtree` ; l'ancien `is_org_admin` bloquait les
  sous-orgs en 403).
- **Onglet « Emails (SMTP) »** (visible sur **toute** organisation depuis le 2026-08-23) :
  réutilise le composant partagé `SmtpSettingsSection` (+ `useSmtpSettings`, edge function
  `send-test-email`), déjà utilisé côté superadmin dans `OrgSettingsPage`. Champs : hôte, port,
  identifiant, mot de passe, e-mail/nom expéditeur, TLS, + envoi d'un **mail de test**.
  **Héritage** : sur une sous-organisation, un commutateur **« Utiliser la configuration de
  l'organisme parent »** (activé par défaut) remplace le formulaire par un résumé en lecture seule
  du relais hérité (organisation source, serveur, expéditeur, TLS — **jamais le mot de passe**,
  via la RPC `parent_smtp_settings`) ; le désactiver ouvre la saisie d'une configuration propre.
  ⚠️ Modifier le relais d'un parent modifie **de facto** celui de toute sa descendance non
  spécifique : rien n'est recopié, la résolution se fait à la lecture
  (`resolve_smtp_settings`, côté service role — voir `docs/data-model.md`). Une ligne repassée en
  « hérité » **garde ses valeurs** (retour en arrière possible). RLS `smtp_settings` : lecture et
  écriture `is_admin_of_self_or_ancestor(organization_id)` — élargi depuis `is_org_admin`
  (migrations `smtp_settings_org_admin_write` puis `smtp_settings_heritage_parent`), sans quoi un
  admin de principale ne pourrait pas régler l'héritage de ses sous-organisations.
  `send-test-email` autorise via `is_admin_of_self_or_ancestor` et envoie par le relais **résolu**
  (comme `invite-user` et `auth-email-hook`).
- Code : `src/features/organizations/` — `OrganizationEditorPage`, `OrganizationInfoTab`,
  `OrganizationProceduresTab`, `useOrganizationProcedures.ts`, `organizationProcedures.ts` (pur,
  testé), `BrandingSection.tsx`, `useBranding.ts`, `branding.ts` (pur, testé : normalisation des
  couleurs, forme de l'écriture, aperçu résolu, « une charte vide » à cinq éléments). Helpers d'arbre purs `findRootAncestor` / `collectDescendantIdsFlat` dans `orgTree.ts`.
