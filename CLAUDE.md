# Socle

Application web de gestion d'organisations (collectivités / services) et de leurs démarches.
Interface en **français**.

## Rôle dans la gamme logicielle

**Socle est le référentiel central** de la gamme : il constitue la **source de vérité unique**
pour le paramétrage des **organisations** (hiérarchie, coordonnées, statut) et des **démarches**
(catalogue, catégories, activation par organisation). Les autres projets ne redéfinissent pas
ces données : ils les **consomment** depuis Socle.

En sortie, Socle exposera des **API documentées** réutilisées par les autres applications de la
gamme (ex. **Ariane**, **Clara**, …). Toute donnée de référence (organisations, démarches) doit
donc être pensée comme un **contrat public** consommé en aval, pas comme un détail interne.

L'ensemble de la gamme vise une **suite cohérente de gestion de la relation usagers** pour les
collectivités : gestion des demandes usagers, gestion de courrier, gestion de guichet,
application élu, etc. Socle est le socle de paramétrage commun à tous ces produits.

## Documentation

Porte d'entrée : `README.md` (racine). Corpus dans `docs/` : `architecture.md` (frontières,
zones, sécurité, décisions), `data-model.md` (tables, RLS, triggers, RPC, storage),
`integration.md` (guide des équipes consommatrices), `api-changelog.md` (journal du contrat
public, append-only), `operations.md` (runbook), `roadmap.md` (évolutions souhaitées).
**Règle de propriété unique** : la liste des endpoints vit dans les OpenAPI
(`supabase/functions/*/_shared/openapi.ts`, publiés sur `/api-doc`, `/api-doc-usagers` et
`/api-doc-ia`), le
schéma détaillé dans `docs/data-model.md` — les autres docs renvoient sans dupliquer ; CLAUDE.md
garde les invariants, pièges (⚠️) et pointeurs de code. ⚠️ Toute PR qui touche une **surface de
contrat** (`supabase/functions/*/_shared/{dto,serializers,openapi}.ts`,
`src/features/procedures/{formSchema,requesterFields,knowledgeBase,communication}.ts`) ajoute une entrée datée
à `docs/api-changelog.md` ; une doc périmée par une PR se met à jour **dans cette PR**.
`docs/archive/` = instantanés historiques non maintenus.

## Stack

- **Vite 8** (rolldown) + **React 18** + **TypeScript** (strict)
- **React Router 6** (routing), **TanStack Query 5** (données serveur)
- **Supabase** (Postgres + Auth + RLS) via `@supabase/supabase-js`
- **Tailwind CSS 3** + primitives **Radix UI** (composants maison façon shadcn dans `src/components/ui`)
- **react-hook-form** + **zod** (disponibles ; pas systématiquement utilisés)

## Commandes

```bash
npm run dev      # serveur de dev → http://localhost:5173 (port fixé dans vite.config.ts)
npm run build    # tsc -b && vite build
npm run lint     # tsc -b (typecheck du projet, pas d'ESLint)
npm test         # vitest run (unitaires + composants) ; npm run test:watch en veille
```

Prérequis : **Node ≥ 22** (exigé par `@supabase/supabase-js`) ; en pratique **Node 24 / npm 11**,
qui génère `package-lock.json` (npm 10 le juge désynchronisé → `npm ci` échoue). Un hook husky
pre-commit rejoue `lint` + `test` ; la CI GitHub Actions (`.github/workflows/ci.yml`) fait de
même sous Node 24 à chaque push sur `main` et chaque PR. ⚠️ Ne pas redescendre vite en < 6
(vitest 4 l'exige en peer — c'est ce qui avait cassé la CI une semaine en juillet 2026).

## Environnement

`.env.local` à la racine (non versionné) :

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Le client Supabase (`src/lib/supabase.ts`) échoue au démarrage si l'une des deux manque.
Projet Supabase : `qhrokbkyxgcvkbpmbmna`.

## Architecture

### Deux zones applicatives (voir `src/App.tsx`)

1. **App par organisation** (`AppShell`, routes protégées par `ProtectedRoute`) — pour les
   utilisateurs et **administrateurs d'organisation**. Routes : `/`, `/organisations`,
   `/demarches`, `/categories`, `/types-pieces`, `/quartiers`, `/utilisateurs`,
   `/consommation-ia` (consultation seule), `/documents`, `/site-de-demarches` (éditeur du
   portail usagers — voir feature).
2. **Zone super admin** (`SuperAdminLayout`, protégée par `SuperAdminRoute`) — routes
   `/superadmin/*`. Réservée à `global_role = 'super_admin'`.
3. **Routes publiques** (hors shell) : `/login`, `/mot-de-passe-oublie`, `/activer-compte`,
   `/reinitialiser-mot-de-passe`, et les docs d'API `/api-doc` + `/api-doc-usagers`.

⚠️ Un **super_admin est redirigé** de l'app normale vers `/superadmin` (`ProtectedRoute`).
Il n'utilise donc jamais les pages de l'app par organisation ; il a ses propres écrans.

### Authentification & rôles

- `AuthProvider` (`src/features/auth/`) expose `{ session, profile, loading, signOut }` via
  `useAuth()`. `profile` = ligne `public.users` de l'utilisateur courant.
  ⚠️ Le chargement du profil est **keyé sur l'id utilisateur, pas sur l'objet session** :
  supabase-js ré-émet `SIGNED_IN`/`TOKEN_REFRESHED` avec un **nouvel objet session** à chaque
  retour sur l'onglet ; keyer sur l'objet repasse `loading` à `true`, `ProtectedRoute` affiche
  l'écran de chargement et **démonte toute la page** (perte de l'étape du stepper et des saisies).
- **Deux niveaux de rôle** :
  - `users.global_role` : `'super_admin'` (accès plateforme total) ou autre.
  - `user_organizations.role` : rôle par organisation, notamment `'admin'`.

### Sécurité = RLS Postgres (source de vérité)

Les droits ne sont **pas** appliqués côté client — l'UI ne fait que refléter le RLS.
Fonctions SQL helper (schéma `public`) :

- `is_super_admin()` → l'utilisateur courant est super admin.
- `is_org_admin(org_id)` → admin **direct** de cette org (ou super admin).
- `has_org_access(org_id)` → membre de cette org (ou super admin).
- `is_admin_of_self_or_ancestor(org_id)` → admin de l'org **ou de n'importe quel ancêtre**
  (remonte `parent_id`, SECURITY DEFINER). Base du « pouvoir sur tout le sous-arbre ».

⚠️ Ces 4 fonctions sont **`SECURITY DEFINER`** : elles lisent `users` / `user_organizations` /
`organizations` **sans re-déclencher le RLS**. C'est indispensable — en `SECURITY INVOKER` elles
créent une **récursion infinie** (ex. `is_super_admin` lit `users`, dont la policy appelle
`is_super_admin`…) qui fait tomber les requêtes en `stack depth limit exceeded` (HTTP 500) dès
qu'une ligne n'est pas court-circuitée par `id = auth.uid()`. Tout nouveau prédicat RLS qui lit
une table protégée doit suivre le même motif.

Les **fonctions trigger** `SECURITY DEFINER` (`enforce_*_root_org`, `handle_new_user`,
`assign_contact_quartier`, `sync_contact_external_ref_org`…) ont leur **EXECUTE révoqué** de
`anon`/`authenticated` (advisors 0028/0029 : sinon appelables via `/rest/v1/rpc/…`) — sans effet
sur leur déclenchement, Postgres ne vérifiant l'EXECUTE qu'à la création du trigger (migrations
`contacts_trigger_functions_revoke_execute`, `trigger_functions_revoke_execute`) ; toute nouvelle
fonction trigger doit suivre le même motif. Les 4 helpers ci-dessus restent en revanche
exécutables par `authenticated` : le RLS les évalue avec les droits de l'appelant.

### Modèle de données (principales tables)

- `organizations` — hiérarchie auto-référencée via `parent_id` (voir feature ci-dessous).
- `users`, `user_organizations` (jointure user↔org + `role`).
- `categories`, `procedures`, `organization_procedures` (catalogue de démarches).
- `smtp_settings` (SMTP par organisation, **hérité du parent** sauf configuration propre —
  voir feature).
- `api_keys` (clés d'API rattachées à une racine, ou **clé plateforme** — `organization_id` NULL, périmètre global, liaison unique avec Clara — voir feature ; `consumer` = application imputable des appels facturés).
- `ai_usage_quotas` / `ai_usage_counters` / `ai_usage_events` (plafond mensuel de jetons, compteur et journal — voir feature « guichet IA »).
- `contacts`, `contact_roles`, `contact_role_assignments`, `contact_external_references`,
  `contact_relations` (référentiel des usagers — voir feature).
- `quartiers` (découpage du territoire par racine, polygones PostGIS — voir feature).
- `document_templates` (catalogue de documents à variables par racine, fichiers dans un bucket privé — voir feature).
- `organization_domains` (domaines du portail usagers, `hostname` **unique sur toute la plateforme** — voir feature « site de démarches »).
- `portal_pages` (composition des pages du portail, `draft` autosauvegardé / `published` explicite — voir feature « site de démarches »).

Types TS générés dans `src/types/database.types.ts` — **ne pas éditer à la main**,
régénérer depuis le schéma live (Supabase MCP `generate_typescript_types` / CLI).
Les migrations passent par `apply_migration` (Supabase MCP) ou la CLI ; l'historique appliqué
est **versionné dans `supabase/migrations/`** (rapatrié le 2026-08-12) — toute nouvelle
migration doit y avoir son fichier miroir `{version}_{nom}.sql`.

## Feature : hiérarchie d'organisations

- Arbre auto-référencé (`organizations.parent_id`), **10 niveaux max** (racine + 9),
  imposé par le trigger DB `enforce_org_depth` (bloque aussi les cycles).
- **Super admin** : agit sur toute la plateforme ; seul à créer des **organisations racines**
  et à **supprimer** (uniquement des sous-organisations, jamais une racine).
- **Admin d'organisation** : gère son org **et toute sa descendance** (créer/modifier/rendre
  obsolète), pas de suppression.
- Champs : `name` (obligatoire), `address`, `phone`, `email`, `status`
  (`active` | `obsolete`, obsolescence **réversible**), + `slug`, `type` hérités. Les quatre
  colonnes de **charte graphique** (`logo_url`, `logo_white_url`, `primary_color`,
  `secondary_color`) + `branding_inherit_parent` ont leur propre onglet — voir feature ci-dessous.
- RLS `organizations` : SELECT `has_org_access(id) OR is_admin_of_self_or_ancestor(id)` ·
  INSERT super_admin ou (parent défini ET admin d'un ancêtre) · UPDATE admin self/ancêtre ·
  DELETE `is_super_admin() AND parent_id IS NOT NULL`.

### Où est le code

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
  « Organisations » (même `OrganizationFormDialog`). Sous les organisations, l'entrée **« Clés
  plateforme »** (`/superadmin/cles-plateforme`) gère les clés API à périmètre global — voir
  feature « API publique ».

### Édition d'organisation en pleine page (app par organisation)

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
  `logo_url` (logo couleur), `logo_white_url` (logo blanc, fonds sombres), `primary_color`,
  `secondary_color` (hexadécimal `#rrggbb`, CHECK en base ; la saisie normalise `#ABC` → `#aabbcc`
  — deux écritures de la même couleur ne doivent pas se lire comme deux couleurs en aval). Le Socle
  **enregistre et publie** : aucun habillage de l'app ne change, l'aval s'y adosse.
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
  (`public-api`, scope `read`, contrat 1.5.0 — voir feature « API publique »). ⚠️ Les trois
  colonnes ajoutées ne sont **pas** exposées sur `OrganizationDto` et ne doivent pas l'être :
  brutes, elles sont nulles sur une organisation qui hérite.
- **Onglet « Démarches »** (`OrganizationProceduresTab`) : **activation par organisation**. Liste
  le catalogue de l'**organisation principale** (ancêtre racine, `findRootAncestor`) avec un
  `Switch` par démarche. L'activation est **opt-in** : une démarche est active ⇔ une liaison
  `organization_procedures` existe avec `is_enabled = true` (helper pur `buildEnabledProcedureIds`,
  testé). Écriture par **upsert** sur la contrainte unique `(organization_id, procedure_id)`
  (`useSetProcedureEnabled`), lecture via `useOrganizationProcedureBindings`.
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
  couleurs, forme de l'écriture, aperçu résolu). Helpers d'arbre purs `findRootAncestor` / `collectDescendantIdsFlat` dans `orgTree.ts`.

## Feature : paramétrage des démarches (`procedures`)

Catalogue des démarches, **multi-tenant strict** : une démarche est rattachée à une
**organisation principale (racine, `parent_id IS NULL`)** — imposé par le trigger DB
`enforce_procedure_root_org`. L'**activation par organisation** (via `organization_procedures`)
est fonctionnelle (voir feature « Édition d'organisation » ci-dessous). Paramétrage par **admin**
(sa principale) et **superadmin** (toutes).

- **Formulaire = stepper horizontal à 5 étapes** (`src/features/procedures/steps.ts`) : Descriptif,
  Informations demandeur, Formulaire, Communication, Base de connaissances. **Les 5 sont
  fonctionnelles** (Communication depuis le 2026-08-30), chacune persistée dans sa propre colonne de
  `procedures`. Chaque étape a un `<form id>` soumis depuis le pied de `ProcedureEditor`
  (`currentFormId`) et persiste via `useUpdateProcedure`. Le pied propose **deux boutons** :
  « Enregistrer » (reste sur l'étape, confirmation « Enregistré ✓ » éphémère) et « Enregistrer et
  continuer » (avance) — dernière étape : « Enregistrer » seul. L'étape courante est **reflétée dans
  `?step=`** (`onStepChange` → `setSearchParams` en `replace`) : position restaurée après rechargement.
- **Cycle de vie = `procedures.status`** (`brouillon` | `production`, défaut **brouillon**, CHECK
  en base). Commutateur **« Production »** par ligne dans la liste des démarches (composant partagé
  `ProceduresListPanel` → écran admin `/demarches` **et** section catalogue du superadmin) ; tag
  **« Brouillon »** dans la liste et dans l'en-tête de l'éditeur. **Au bout du stepper**, un
  enregistrement sur la dernière étape propose la mise en production par une modale — le moment où
  la question se pose d'elle-même. Le geste est **réversible** dans les deux sens.
  ⚠️ Ne pas confondre avec les deux autres notions qui s'y cumulent : `organization_procedures.
  is_enabled` (quelles organisations la proposent) et `communication_config.visibility` (où et
  quand). `status` dit si le **paramétrage est fini** ; une démarche en brouillon n'est proposée
  nulle part, quelles que soient les deux autres. ⚠️ Les démarches **antérieures au 2026-08-30 sont
  toutes en brouillon** (la notion n'existait pas — rien n'a été affirmé à leur place) : un
  consommateur qui filtre sur `production` n'obtient rien tant que le catalogue n'a pas été basculé.
  Logique pure `procedureStatus.ts` (testée : au moindre doute, **brouillon** — le doute ne publie rien).
- **Descriptif** → colonnes `procedures` : `name` (obligatoire), `category_id` (obligatoire, catégories
  de la racine), `type` (`interne`/`externe`), `keywords` (text[], CSV), `short_description`,
  `input_duration_minutes`, `order_index` (rang, défaut max+1).
- **Informations demandeur** → colonne `procedures.requester_config` (JSONB). Publics
  citoyen/entreprise/association activables ; par public, chaque donnée vaut `masque`/`visible`/
  `obligatoire`. Logique pure + parseur robuste `requesterFields.ts` (testé), UI `steps/DemandeurStep.tsx`.
- **Formulaire** → colonne `procedures.form_schema` (JSONB) : **form builder maison**, schéma
  **possédé** (contrat public consommé en aval). Contenu = liste ordonnée de nœuds *champ* ou *section* ;
  champs simples / choix (options) / **pièce justificative** (1–5 fichiers, formats, obligatoire +
  conditionnel) ; **conditions** d'affichage & d'obligation (moteur pur `conditions.ts`). Ajout des
  champs par **palette** (glisser-déposer positionné, ou clic → ajout à la fin). La palette propose
  aussi un bloc **« Lieu d'intervention »** : une **section pré-remplie** des champs d'adresse
  (numéro, BTQ, voie, complément, appartement, code postal, ville ; clés `intervention_*`,
  fabrique `createLieuInterventionSection`) — section ordinaire du schéma (pas de type dédié dans
  le contrat), entièrement modifiable après insertion. Les champs
  **existants** se déplacent au glisser-déposer entre racine et sections (entrée/sortie/changement
  de section) : un **seul `DndContext`** couvre tout le canevas (pas de contexte imbriqué dans
  `SectionEditor`, sinon les champs restent prisonniers de leur conteneur) ; logique pure
  `formReorder.ts` (`insertNode`/`moveNode`, testée), position avant/après déduite du point de dépôt.
- **Communication** → colonne `procedures.communication_config` (JSONB) : schéma **possédé**
  (contrat consommé en aval), organisé en **blocs** pour que les réglages à venir de l'étape
  s'ajoutent en clés voisines sans déplacer l'existant. Premier bloc, **`visibility`** :
  `portalVisible` (proposée sur le portail usagers), `publicationPeriodEnabled` +
  `publicationStart`/`publicationEnd` (`AAAA-MM-JJ`, **bornes incluses**, chacune facultative).
  Aucun comportement branché pour l'instant — le Socle **enregistre et publie**, l'aval s'y adosse.
  ⚠️ Les deux commutateurs sont **actifs par défaut**, et une colonne **NULL** (démarche jamais
  passée par l'étape — c'est le cas de toutes les existantes) se lit comme ces défauts : la traiter
  comme « non publiée » dépublierait tout le catalogue d'un coup. ⚠️ Désactiver la période
  **conserve** les dates (le commutateur gouverne l'usage, pas la donnée — même parti que
  `email_sender_name`) : un consommateur qui applique les dates sans regarder le commutateur
  dépublie à tort. Une fin antérieure au début est refusée à la saisie (`publicationPeriodError`) :
  elle ne publierait jamais. Logique pure + parseur robuste `communication.ts` (testé), UI
  `steps/CommunicationStep.tsx`.
  Second bloc, **`documents`** (« Documents et courriers », 2026-09-01) : quels documents du
  catalogue (`document_templates`) l'agent peut produire depuis cette démarche. Deux listes
  distinctes — `documents` puise dans les types `interne`/`externe`, `letters` dans `courrier` —
  plus `restrictVisibility`. Chaque entrée est `{id, visibility}` où `visibility` vaut `toujours`,
  `positive` ou `negative` (l'issue de la demande).
  ⚠️ La condition est **par document**, pas globale au bloc : c'est ce qui permet à une même
  démarche de porter une lettre d'acceptation *et* une lettre de refus. ⚠️ `restrictVisibility`
  **faux** rend toutes les conditions sans effet, et les conserve (motif `publicationPeriodEnabled`) :
  un consommateur qui applique les `visibility` sans lire le drapeau masque des documents rendus
  visibles. ⚠️ Défauts **vides**, contrairement à `visibility` dont les défauts sont actifs : une
  colonne NULL ne doit pas déverser le catalogue dans chaque démarche. ⚠️ Le JSON ne porte **pas de
  clé étrangère** : une sélection survit à la suppression de son document — l'UI comme l'API
  **écartent** les références mortes (`resolveDocuments`, testé). UI : `steps/communication/DocumentsBlock.tsx`.
  **En aval** : servi **résolu** dans `Procedure.documents` par `public-api` (contrat 1.6.0), à
  côté du catalogue `GET /v1/document-templates` — voir feature « API publique ».
- **Base de connaissances** → colonne `procedures.knowledge_base` (JSONB) : informations à destination
  de **l'agent et de son assistant LLM**, schéma **possédé** (contrat consommé en aval). Champs : texte
  d'aide agent & procédures (**Markdown**, aperçu via `markdown.ts` — rendu HTML échappé, aucune
  dépendance), liens utiles agent + sources IA (`{url, description}`), FAQ (`{question, answer}`),
  garde-fous (liste). Deux jeux de **documents** (aide agent PDF/image ; entraînement IA formats
  étendus, 10 fichiers max chacun) : **téléversement fonctionnel** vers le bucket privé Supabase
  `procedure-documents` (voir feature ci-dessous), référencés dans le JSON par `{path, name}`
  (`agentDocuments`/`trainingDocuments`). Logique pure + parseur robuste `knowledgeBase.ts`
  (testé), UI `steps/KnowledgeBaseStep.tsx` (+ `steps/connaissances/*`).
- RLS `procedures` : écriture `is_super_admin() OR is_org_admin(organization_id)` (la policy
  permissive `write procedures` par `global_role` a été retirée → isolation tenant). Suppression
  réservée au superadmin (UI).
- Code : `src/features/procedures/` — `useProcedures.ts`, `useWritableRootOrganizations.ts`,
  `Stepper.tsx`, `ProcedureEditor.tsx`, `ProceduresListPanel.tsx`, `ProceduresPage.tsx` (admin
  `/demarches`), `ProcedureEditorPage.tsx` (`variant` admin/superadmin). Étapes : `steps/DescriptifStep`,
  `steps/DemandeurStep`, `steps/FormulaireStep` (+ `steps/formulaire/*` : `FieldPalette`, `SectionEditor`,
  `FieldRow`, `ConditionEditor`, `FormPreview`, `FormatsPicker`), `steps/CommunicationStep`,
  `steps/KnowledgeBaseStep` (+
  `steps/connaissances/*` : `MarkdownField`, `LinkListEditor`, `FaqEditor`, `StringListEditor`,
  `DocumentsUploader`, `controls`), `steps/PlaceholderStep`. Stockage des documents :
  `procedureStorage.ts` (logique pure de chemin/validation, testée) + `useProcedureDocuments.ts`
  (upload/suppression/URL signée). Logique pure **testée** : `requesterFields.ts`,
  `formSchema.ts`, `formReorder.ts`, `conditions.ts`, `formats.ts`, `knowledgeBase.ts`,
  `communication.ts`, `procedureStatus.ts`, `markdown.ts`, `procedureStorage.ts`.
  Superadmin : section « Catalogue de démarches » dans `OrgSettingsPage` (racine uniquement).
- Prérequis : une racine sans **catégorie** ne permet pas de créer une démarche (catégorie
  obligatoire) → créer d'abord des catégories via `/categories`.
- La **pièce justificative** porte un `documentTypeId?: string` référençant un type du catalogue
  `document_types` (voir feature ci-dessous). Le type est **obligatoire à la saisie** : `FormulaireStep`
  bloque l'enregistrement tant qu'une PJ n'est pas typée (helper pur `attachmentFieldsMissingDocumentType`,
  testé) et signale les champs fautifs. Le sélecteur charge le catalogue de la racine via
  `useDocumentTypesForOrg`. Les **formats acceptés** se saisissent via `FormatsPicker` (puces
  retirables + formats courants en un clic + saisie libre ; logique pure `formats.ts`, testée).
  L'**aperçu** (`FormPreview`) affiche les formats autorisés et le nombre de fichiers max, et applique
  la borne `maxFiles` (l'attribut HTML `multiple` seul n'impose aucune limite) : une sélection trop
  grande est refusée.

### Stockage des documents (bucket privé `procedure-documents`)

Les documents de la **base de connaissances** sont stockés dans un **bucket Supabase privé**
`procedure-documents` (25 Mio max/fichier), **multi-tenant strict** comme les démarches — mais
l'isolation est portée par le **RLS de `storage.objects`**, pas par une colonne.

- **Convention de chemin** (le RLS s'appuie dessus) :
  `{organization_id}/{procedure_id}/{agent|training}/{uid}-{fichier}`. Le **1er segment est
  l'organisation principale (racine)** de la démarche.
- **RLS `storage.objects`** (policies scopées `bucket_id = 'procedure-documents'`, rôle
  `authenticated`) : lecture `has_org_access(org_id)`, écriture (INSERT/UPDATE/DELETE)
  `is_org_admin(org_id)` — où `org_id = ((storage.foldername(name))[1])::uuid`. Reflète l'écriture
  des `procedures` (`is_super_admin` court-circuité par `is_org_admin`).
- **Consultation** via **URL signée temporaire** (bucket privé, pas d'accès public).
- Référence stockée dans `procedures.knowledge_base` : `{ path, name }` (`KbDocument`). Upload
  **immédiat** à la sélection (le chemin est persisté à l'enregistrement de l'étape ; un fichier
  téléversé puis abandonné sans enregistrer laisse un objet orphelin — acceptable pour l'instant).
- Code : `procedureStorage.ts` (pur, testé : chemin, formats, taille), `useProcedureDocuments.ts`
  (hooks upload/suppression + `createSignedDocumentUrl`), UI `steps/connaissances/DocumentsUploader`.

## Feature : types de pièce justificative (`document_types`)

Catalogue des types de pièce justificative, **multi-tenant strict** comme les démarches : chaque
type est rattaché à une **organisation principale (racine)** — imposé par le trigger DB
`enforce_document_type_root_org` (calqué sur `enforce_procedure_root_org`). Il **alimente le champ
pièce justificative** du form builder (`documentTypeId`, obligatoire — cf. feature démarches).

- Champs : `name` (**obligatoire**, **unique par organisation, insensible à la casse** via l'index
  `document_types_org_name_unique` sur `(organization_id, lower(name))`), `organization_id` (FK
  racine, `ON DELETE CASCADE`).
- RLS `document_types` (calqué sur `categories`) : lecture `has_org_access(organization_id)` ·
  écriture (ALL) `is_org_admin(organization_id)`. Pas de policy super_admin dédiée (`is_org_admin`
  court-circuite déjà le super admin).
- Unicité vérifiée côté client (feedback immédiat) **et** garantie en base (repli sur l'erreur
  Postgres `23505`).
- **Deux points d'entrée**, tous deux via le composant partagé `DocumentTypesManager` (liste + CRUD) :
  - **Admin** : écran **`/types-pieces`** dans l'app par organisation (comme `/categories`) — mode
    « toutes mes racines », le dialogue propose un sélecteur d'organisation (masqué s'il n'y en a qu'une).
  - **Superadmin** : section « Types de pièce justificative » de `OrgSettingsPage` (racine uniquement) —
    mode **org fixée** : `DocumentTypesManager organizationId=…`, le dialogue **verrouille** l'organisation
    (`fixedOrganizationId`) et la liste n'affiche que les types de cette organisation.
- Code : `src/features/document-types/` — `useDocumentTypes.ts` (`useDocumentTypesQuery(enabled?)`,
  `useDocumentTypesForOrg(orgId)`, mutations), `DocumentTypesManager`, `DocumentTypeFormDialog`,
  `DocumentTypesPage` (fin conteneur). Sélecteur d'organisation via `useWritableRootOrganizations`.

## Feature : catalogue de documents (`document_templates`)

Modèles de documents et de courriers d'une collectivité — accusés de réception, notifications,
fiches internes — déposés une fois et porteurs de **variables** (`{{usager.nom}}`). **Multi-tenant
strict** comme les démarches : rattachés à une **organisation principale (racine)**, trigger
`enforce_document_template_root_org`. ⚠️ Ne pas confondre avec `document_types` (les **pièces
demandées à l'usager**) ni avec le bucket `procedure-documents` (les **documents d'aide à
l'agent**) : ce sont des **gabarits**, d'où le nom `document_templates` alors que l'UI dit
« Documents ».

⚠️ **Le Socle enregistre et publie, il ne fusionne rien** — même parti que la charte graphique et
l'étape Communication. Il n'inspecte pas le contenu des fichiers (Word découpe volontiers
`{{usager.nom}}` en plusieurs fragments XML : une détection naïve signalerait des variables
absentes qui sont bien là), et ne sait pas valoriser la plupart des variables qu'il publie.

- Champs : `name` (**obligatoire**, **unique par organisation, insensible à la casse** via l'index
  `document_templates_org_name_unique`), `description` (facultatif), `type`
  (`interne`/`externe`/`courrier`, CHECK en base — même mot que `procedures.type`, plus
  `courrier`), `file_path` + `file_name`, `created_at`/`updated_at` (trigger partagé
  `set_updated_at`).
- RLS `document_templates` (calqué sur `document_types`) : lecture `has_org_access(organization_id)`
  · écriture (ALL) `is_org_admin(organization_id)`. Unicité vérifiée côté client (feedback
  immédiat) **et** garantie en base (repli sur l'erreur Postgres `23505`).
- **Stockage : bucket privé `document-templates`** (25 Mio/fichier), formats `.doc`/`.docx`/`.odt`.
  Convention de chemin **`{organization_id}/{uid}-{fichier}`** — pas de segment de document : le
  fichier est déposé **avant** que la ligne existe, le `uid` (`crypto.randomUUID()`) suffit à
  écarter les collisions. RLS `storage.objects` scopé `bucket_id` : lecture `has_org_access`,
  écriture `is_org_admin` sur `((storage.foldername(name))[1])::uuid` — motif
  `procedure-documents`. Consultation par **URL signée temporaire**.
- ⚠️ **Ordre des écritures**, à ne pas inverser : à la **création**, le fichier part avant la ligne
  (abandon de la modale ⇒ objet orphelin, assumé ; un échec de l'insert **compense** en retirant le
  fichier) ; au **remplacement**, l'ancien objet n'est retiré qu'**après** succès de l'update (sans
  quoi un échec laisserait un document introuvable) ; à la **suppression**, la ligne part d'abord
  (le RLS peut refuser), le fichier ensuite en best-effort.
- **Catalogue de variables** (`documentVariables.ts`) : figé dans le code — c'est un **contrat de
  nommage**, pas une donnée client. Syntaxe `{{domaine.cle}}` (moteurs de fusion courants :
  docxtemplater, carbone.io). **Trois domaines** : **`usager.*`** (16 variables — identité, adresse
  complète *et* ses composantes, coordonnées, quartier), **`demande.*`** (13 variables — démarche,
  suivi, dates, état, agent instructeur) et **`organisme.*`** (8 variables — nom, adresse,
  téléphone, courriel, deux logos, deux couleurs). ⚠️ La liste des pièces est une **boucle**
  (`{{#demande.pieces}}{{libelle}} : {{statut}}{{/demande.pieces}}`), pas une variable plate : elle
  a autant de lignes que le dossier compte de pièces.
  ⚠️ **La plupart de ces variables n'ont pas de source dans le Socle** : les composantes d'adresse
  manquent à `contacts` (roadmap), et toute la famille `demande.*` vit dans Ariane/Clara. Le
  catalogue dit comment **nommer**, pas ce que le Socle sait remplir.
  **`organisme.*` est la seule exception, et elle est entière** : les quatre coordonnées sont des
  colonnes d'`organizations`, la charte vient de `resolve_branding` / `GET
  /v1/organizations/{id}/branding`. ⚠️ La charte s'entend **résolue** — une sous-organisation qui
  hérite a ses colonnes de charte **nulles**, un consommateur qui lirait `organizations` en direct
  peindrait du vide (même mise en garde qu'au changelog du 2026-08-30). ⚠️ Les logos sont des
  **URL d'image** et les couleurs des `#rrggbb` : un moteur de fusion doit savoir *insérer une
  image*, sinon le courrier affiche une adresse web à la place du logo — d'où les `hint` du
  catalogue, **testés**.
- **Deux points d'entrée**, tous deux via le composant partagé `DocumentTemplatesManager` (liste +
  CRUD), motif `document_types` :
  - **Admin** : écran **`/documents`** dans l'app par organisation — mode « toutes mes racines », le
    dialogue propose un sélecteur d'organisation (masqué s'il n'y en a qu'une).
  - **Superadmin** : section « Documents » d'`OrgSettingsPage` (`?section=documents`, racine
    uniquement) — mode **org fixée** (`fixedOrganizationId`).
  Colonnes de la liste : **libellé, nom fichier, type**. Un bouton **« Variables disponibles »**
  ouvre `VariablesDialog` (titre + jeton + copie par variable) — au-dessus de la liste, là où
  l'agent en a besoin au moment de préparer son fichier.
- **Exposé par `public-api`** depuis le 2026-09-01 (contrat 1.6.0) : catalogue
  `GET /v1/document-templates` (+ `/{id}`, filtre `type`), téléchargement par
  `GET /v1/document-templates/{id}/signed-url` (URL signée 5 min ; ⚠️ le `file_path` n'est **jamais**
  exposé — la garde de périmètre porte sur la ligne, pas sur une chaîne fournie par l'appelant), et
  sélection **résolue** dans `Procedure.documents`. ⚠️ Ne pas confondre avec
  `GET /v1/documents/signed-url`, qui sert la base de connaissances (bucket `procedure-documents`)
  — c'est d'ailleurs pourquoi l'endpoint s'appelle `document-templates` et non `documents`.
- **Rattachement aux démarches** : fait, par le bloc `documents` de l'étape Communication (voir la
  feature « paramétrage des démarches »).
- Code : `src/features/documents/` — `documentVariables.ts` et `documentTemplates.ts` (purs,
  **testés**), `useDocumentTemplates.ts` (CRUD + upload/suppression/URL signée),
  `DocumentTemplatesManager`, `DocumentTemplateFormDialog`, `VariablesDialog` (testé),
  `DocumentsPage` (fin conteneur). Helpers de fichier **partagés** avec les démarches dans
  `src/lib/fileStorage.ts` (`fileExtension`, `sanitizeFileName`, `isFormatAllowed`,
  `acceptAttribute`, `validateFile`) — `procedureStorage.ts` les réexporte.
- Migration : `document_templates`.

## Feature : API publique (lecture seule) — `public-api`

Socle expose son référentiel via une **API REST versionnée en lecture seule** (`GET` uniquement),
**contrat public** consommé en aval (Ariane, Clara, partenaires). C'est une **Edge Function Deno**
`supabase/functions/public-api`, servie sous `{SUPABASE_URL}/functions/v1/public-api/…`, déployée
avec **`verify_jwt = false`** (l'auth est portée par la fonction, pas par la passerelle).

- **Authentification = clé API** en `Authorization: Bearer <clé>`. Table `api_keys` (secret **haché
  SHA-256** dans `key_hash`, jamais en clair ; `key_prefix` affiché pour repérage ; `expires_at`,
  `revoked_at`, `last_used_at`). Le scope **`read`** est requis (403 sinon — vérifié depuis le
  2026-08-12). Une clé est **rattachée à une organisation principale (racine)** —
  trigger `enforce_api_key_root_org` (calqué sur `enforce_procedure_root_org`) — ou **plateforme**
  (`organization_id` NULL, autorisé depuis le 2026-07-17) : périmètre = **toutes** les organisations,
  toutes racines confondues — c'est la liaison unique avec Clara (une clé, deux plateformes
  multi-tenant). Les géométries de quartiers exigent alors le paramètre `organization_id`.
  RLS `api_keys` = `is_super_admin()` pour tout (gestion super admin uniquement). L'UI gère les
  clés **par racine** (section « API publique » d'`OrgSettingsPage`) et les clés **plateforme** sur
  la page dédiée **`/superadmin/cles-plateforme`** (`PlatformApiKeysPage`, entrée « Clés
  plateforme » du menu ; carte de comptage sur le tableau de bord) — avant le 2026-08-20 une clé
  plateforme n'apparaissait nulle part dans l'UI (créée et révocable seulement par SQL).
- **Isolation** : la fonction lit avec la **service role** (hors RLS) mais **restreint chaque requête
  au sous-arbre** de l'org de la clé, via `public.org_subtree_ids(root uuid) returns uuid[]`
  (récursif, `SECURITY INVOKER`, `EXECUTE` réservé à `service_role` — révoqué de
  `anon`/`authenticated` le 2026-08-12, migration `org_subtree_ids_revoke_execute`).
  C'est LE point où vit l'isolation → couvert par tests + vérif bout en bout.
- **Endpoints** (préfixe `/v1`) : `organizations` (+`/{id}`, filtres `status`, `tree=true`),
  `categories`, `procedures` (+`/{id}`, filtres `category_id`, `type`, `enabled_for`),
  `document-types`, `quartiers` (option `geometry=true` → polygones **GeoJSON** via la RPC
  `list_quartiers_geojson` ; sans elle, aucune géométrie — la colonne `geom` binaire n'est
  jamais exposée), `documents/signed-url?path=` (URL signée temporaire, bucket privé
  `procedure-documents`), `organizations/{id}/branding` (**charte graphique applicable**,
  héritage résolu — logos et couleurs ; scope `read`), `organizations/{id}/smtp` (**serveur
  d'envoi applicable** à l'organisation, héritage résolu — cf. sérialisation ci-dessous).
  Docs : `openapi.json` (public) et `docs`
  (Redoc, cf. ci-dessous).
- **Erreurs** : enveloppe `{ "error": { code, message } }` → `400`/`401`/`403`/`404`/`405`/`500`.
  Ressource hors périmètre = **404** (on ne révèle pas son existence).
- **Sérialisation = whitelist stricte** (`_shared/serializers.ts`) : aucune colonne sensible
  (`key_hash`, réglages IMAP…) ne peut fuir même sur un `select *`. Les JSON possédés
  (`form_schema`, `requester_config`, `knowledge_base`, `translations`, `metadata`) sont
  **transmis tels quels**. **Une seule exception, explicite et gardée** (2026-08-23) :
  `GET /v1/organizations/{id}/smtp` sert le relais de messagerie **mot de passe compris**
  (`serializeSmtpSettings`), parce que les applications de la gamme expédient les mails de la
  collectivité par SON relais et que le Socle en est propriétaire — Iris s'en sert pour
  alimenter son miroir plutôt que de faire ressaisir les identifiants. Deux gardes
  cumulatives : scope **`smtp`** sur la clé (le scope `read` ne suffit pas) et organisation dans
  le périmètre de la clé ; `configured: false` quand rien n'est défini. La garde « racine
  uniquement » a été **levée le 2026-08-23** avec l'héritage : toute organisation du périmètre
  répond, avec le relais **résolu** et `source_organization_id` qui dit qui le porte.
- **Logique pure co-localisée** dans `supabase/functions/public-api/_shared/` (`dto`, `serializers`,
  `scope`, `errors`, `openapi`) — **sans dépendance Deno/`@/`**, donc **testée par vitest**
  (`include` étendu dans `vite.config.ts` à `supabase/functions/**`) **et** déployée avec la fonction
  (tableau `files` de `deploy_edge_function`). Le déploiement inclut `index.ts` + tout `_shared/*.ts`.
- **Documentation humaine (type Swagger)** = **page in-app `/api-doc`** (`ApiDocsPage`, route
  **publique**) qui charge **Redoc** (CDN) pointé sur `…/public-api/openapi.json`. ⚠️ Pourquoi pas
  servie par la function : la passerelle Supabase force les réponses **HTML** des functions en
  `text/plain` + CSP `sandbox` (anti-hameçonnage sur `*.supabase.co`) → un rendu HTML depuis la
  function ne s'affiche pas. Le `openapi.json` (JSON) est, lui, servi normalement.
- **Gestion des clés (super admin)** : section **« API publique »** de `OrgSettingsPage`
  (**racine uniquement**), à côté de SMTP / catalogue / types de PJ, et page **« Clés plateforme »**
  (`/superadmin/cles-plateforme`). Les deux partagent `ApiKeysList` (liste + révocation via
  `AlertDialog`) + `ApiKeyFormDialog` (**génération + hachage navigateur** via `apiKeys.ts`, secret
  **affiché une seule fois**) + `useApiKeys.ts` (`useApiKeys`/`useCreateApiKey`/`useRevokeApiKey`,
  paramétrés par un `ApiKeyOwner` = id de racine **ou `null` = plateforme** (`organization_id IS
  NULL`) ; la liste **ne sélectionne pas** `key_hash`). En mode plateforme, le dialogue affiche un
  avertissement « périmètre global » et exige une **case d'assentiment** avant de créer (testé,
  `ApiKeyFormDialog.test.tsx`). `created_by` = `profile.id`.
- Logique pure **testée** : `_shared/{serializers,scope,errors,openapi}.ts`,
  `superadmin/organizations/apiKeys.ts` (génération/hachage, `apiKeyStatus`, `countActiveApiKeys`).

## Feature : site de démarches — portail usagers (`organization_domains`, `portal_pages`)

Le portail usagers est **Nora** (dépôt `Notch-pm/Nora`) : une instance unique, **sans base de
données**, qui sert toutes les collectivités. Elle demande au Socle à qui appartient le domaine
visité, puis ce qu'elle doit afficher. Le Socle est donc la source de vérité de trois choses : le
**domaine** (`organization_domains`), le **catalogue public** (`/v1/portal/procedures`) et la
**composition de la page d'accueil** (`portal_pages`), éditée ici, dans l'écran « Site de
démarches ». Ajouter une collectivité au portail = une ligne de domaine, aucun déploiement.

- **Domaines** (`organization_domains`) : `hostname` **unique sur toute la plateforme** (un domaine
  désigne exactement une collectivité — c'est l'invariant de toute la résolution de tenant),
  normalisé par trigger à l'écriture, au plus un `is_primary` par organisation, **pas** restreint
  à une racine (une sous-organisation peut tenir son guichet). Écran `DomainsSection` : onglet
  « Domaines du portail » de l'éditeur d'organisation (admin) et section `?section=domaines`
  d'`OrgSettingsPage` (superadmin). ⚠️ Un doublon peut appartenir à une organisation que
  l'administrateur n'a pas le droit de voir : l'erreur ne dit pas laquelle. `localhost` est
  refusé par CHECK — le développement de Nora simule un domaine réel (`<label>.localhost` →
  `<label>.<PORTAL_DEV_DOMAIN_SUFFIX>`).
- **Composition** (`portal_pages`, une ligne par `(organization_id, slug)`, racine uniquement) :
  deux colonnes, **`draft`** et **`published`**. ⚠️ **Sauvegarder n'est pas publier** — et c'est
  structurel, pas une option : le brouillon est **autosauvegardé** (`useSaveDraft`, 800 ms après
  la dernière modification, n'écrit que `draft`, flush au démontage et au `beforeunload`) ; la
  publication est un geste explicite (`usePublishPortalPage`, `AlertDialog` qui ne se ferme que
  sur succès — un refus RLS doit rester visible) ; « Annuler » = `draft := published`. Le portail
  ne sert **que** `published` (404 = jamais publiée). Test dédié : une rafale de modifications ne
  produit qu'une écriture, jamais sur `published`.
- **Schéma possédé** (`src/features/portal/portalPage.ts`, motif `formSchema.ts`) :
  `{ version: 1, sections }`, kinds `recherche` / `demarches` / `actus` / `compte` / `texte` /
  `footer`. Parse **tolérant section par section** (une section illisible est écartée, les autres
  restent — une page d'accueil de collectivité ne s'efface pas pour un bloc abîmé) ; repli total
  sur `defaultPortalPage()` si ce n'est pas une page. Les épinglages et raccourcis référencent des
  **`procedures.id`**, jamais des libellés. ⚠️ Les couleurs (`footer.background`) n'entrent que
  sous la forme `#rrggbb` : ce sont des valeurs CSS injectées dans une page publique — on écarte,
  on ne nettoie pas. « Contact et horaires » n'est pas un kind mais un **preset** de `texte`
  composé depuis `organizations.address / phone / email` (pas de colonne d'horaires : l'agent les
  tape).
- **Catalogue** (`catalogue.ts`) : la liste d'épinglage montre **tout** le catalogue de la racine
  avec sa visibilité portail (`brouillon` / `interne` / `masquee` / `hors-periode` / `visible`,
  calculée par les règles existantes de `communication.ts`) — on surface, on ne masque pas ;
  le canevas atténue les démarches que le portail n'affichera pas.
- **Éditeur** (`PortalEditorPage` → `PortalEditor` → `editor/*`) : entrée de menu « Site de
  démarches » (`/site-de-demarches`, `?org=` quand plusieurs racines) et
  `/superadmin/organisations/:orgId/portail`. Palette / canevas / inspecteur, aperçu = le canevas
  sans son chrome, Bureau / Tablette / Mobile (`device.ts`, largeur de page fixe mise à l'échelle
  par CSS `zoom` — pas `transform`, pour que le conteneur défilant suive ; ajustement à la fenêtre
  et Ctrl/⌘ + molette). Glisser-déposer dnd-kit avec la logique pure dans `portalReorder.ts` :
  **`dropIndex`** est le nombre unique que partagent l'ombre affichée et le dépôt (ce qu'on voit
  est là où le bloc va) ; `transition: null` + `dropAnimation={null}` (aucun effet de « retour »
  après dépôt) ; un dépôt sur sa propre place ne remonte pas au parent (sinon une sauvegarde
  partirait pour rien). **Retirer un bloc** : bouton « Supprimer la section » de l'inspecteur
  (hors du panneau grisé des actualités — on doit pouvoir retirer ce qu'on ne peut pas éditer),
  corbeille de la pastille du bloc (qui **annule le zoom** de la page pour rester cliquable), ou
  Suppr / Retour arrière hors d'un champ. Sans confirmation : c'est un brouillon.
- **Pied de page** (`footer`) : pleine largeur (annule les marges de la page), fond configurable
  (défaut sombre `#0f1f18`, texte clair ou sombre selon la luminance — `isDarkColor`), 1 à 3
  colonnes de sous-blocs `texte`. **En dernière position, il EST le bas de la page** : pas de
  marge sous lui, « Ajouter une section » passe au-dessus, et `appendIndex` glisse tout bloc
  ajouté « en fin de page » au-dessus de lui (un second pied de page s'ajoute après).
- **Grisé, pas caché** : le bloc « Actualités » (palette et inspecteur) et les vues « Contenus »
  / « Thème » — aucune route, `aria-disabled`, « Bientôt disponible ». Le parse accepte quand
  même `actus` : une composition importée plus tard ne sera pas amputée.
- **API** (tag « Portail » de `public-api`, contrat 1.7.0 → 1.9.0) : `GET /v1/portal/tenant?hostname=`
  (**même 404** pour inconnu / hors périmètre / obsolète : on ne renseigne pas sur l'existence des
  collectivités), `GET /v1/portal/procedures?tenant_id=` (déjà filtrées : `production`, `externe`,
  `portalVisible`, dans leur période **heure de Paris**), `GET /v1/portal/page?tenant_id=&slug=`
  (`published` seulement, références résolues sur les démarches publiées). La charte vient de
  `GET /v1/organizations/{id}/branding` (résolue). ⚠️ `supabase/config.toml` déclare
  `verify_jwt = false` pour `public-api` : un déploiement sans ce fichier remet le défaut `true`
  et coupe **tous** les consommateurs (incident du 2026-09-05).
- Code : `src/features/portal/` — `portalPage.ts`, `portalReorder.ts`, `catalogue.ts` (purs,
  **testés**), `usePortalPage.ts` (`usePortalPage`, `useEnsurePortalPage`, `useSaveDraft`,
  `usePublishPortalPage`, `useDiscardDraft`), `PortalEditorPage.tsx` (chargement, autosave,
  publier / annuler — **testé**), `PortalEditor.tsx` (shell, état du glisser), `editor/`
  (`PortalCanvas`, `SectionBlock`, `SectionInspector`, `SectionPalette`, `ProcedurePickList`,
  `sections/*` — l'implémentation **de référence** du rendu de chaque kind ; Nora est le rendu
  réel). `src/components/ui/segmented-control.tsx` (promu pour l'éditeur ; `TabButton` /
  `ModeButton` restent à y rallier). Domaines : `src/features/organizations/{organizationDomains.ts,
  useOrganizationDomains.ts, DomainsSection.tsx}` (testés). Migrations `organization_domains`,
  `portal_pages`.
- Suite prévue (démarches « pour de vrai », multilingue, comptes usagers, échanges, pièces
  jointes, FranceConnect…) : `docs/roadmap.md`, section « Portail usagers ».

## Feature : référentiel des usagers (`contacts`)

Référentiel **partagé par toute la gamme** (Ariane, Clara, Iris, portail citoyen), **multi-tenant
strict** : un contact est rattaché à une **organisation principale (racine)** — trigger
`enforce_contact_root_org` (motif habituel) ; les sous-organisations partagent le même référentiel.
⚠️ **Écriture uniquement via l'API dédiée `contacts-api`** (voir feature ci-dessous) :
**aucune policy RLS d'écriture** côté client sur les fiches ; pas d'UI Socle pour l'instant.

- **`contacts`** (une seule table pour les 4 types) : `contact_type`
  (`personne`/`entreprise`/`association`/`administration`), identité personne (`civility`
  madame/monsieur, `first_name`, `last_name`, `usage_name` nom d'usage, `birth_date`), structure
  (`legal_name`, `siret` 14 chiffres), coordonnées (`email`, `mobile_phone`, `landline_phone`),
  adresse à plat (`address_line1/2`, `postal_code`, `city`, `country` défaut France),
  `preferred_channel` (`email`/`telephone`/`courrier`), `consent_email`/`consent_sms`,
  `internal_notes` (**agents uniquement — à exclure de toute sérialisation publique**), `status`
  (`active`/`archived`, réversible), `display_name` **colonne générée** (nom d'usage/nom + prénom,
  ou raison sociale). **Invariants par type via CHECK** : civilité obligatoire ⟺ personne ;
  raison sociale obligatoire ⟺ structure ; SIRET et champs personne interdits sur le type opposé.
  **Unicité** : SIRET unique par org (index partiel) ; **pas de contrainte dure** sur l'identité
  pivot des personnes (homonymes réels — l'app avertira, choix validé).
- **`contact_roles`** : catalogue de rôles **par racine** (motif `document_types`), nom unique par
  org insensible à la casse. **Seed** : 8 rôles d'exemple insérés pour les racines existantes
  (Habitant, Représentant d'entreprise, Président d'association, Élu, Agent, Propriétaire,
  Demandeur, Bénéficiaire). Seule table du référentiel **modifiable côté client** (admins d'org).
- **`contact_role_assignments`** : n-n contact↔rôle, unique `(contact_id, role_id)`, trigger
  `enforce_contact_role_same_org` (contact et rôle de la même racine).
- **`contact_external_references`** : identifiants tiers (`source` libre : `portail_citoyen`,
  `logiciel_population`…). `organization_id` **dénormalisée par trigger**
  (`sync_contact_external_ref_org`) pour porter l'unicité `(org, source, external_id)` ; unique
  aussi `(contact_id, source)`.
- **`contact_relations`** : relations **dirigées** contact→contact (« X est *rôle* de Y »),
  typées par un rôle du catalogue : `contact_id`, `related_contact_id`, `role_id` (FK
  `contact_roles` **sans ON DELETE** — un rôle utilisé dans une relation bloque sa suppression),
  unique `(contact_id, related_contact_id, role_id)`, CHECK anti-auto-relation. Trigger
  `sync_contact_relation_org` (SECURITY DEFINER) : dénormalise `organization_id` depuis le
  contact porteur, impose la même racine (deux contacts + rôle) et **interdit de cibler une
  personne physique** (cible = entreprise/association/administration uniquement). RLS : SELECT
  `has_org_access` ; écriture via `contacts-api` seulement (payload `relations`, remplacement
  d'ensemble) ; la fiche expose `relations` (sortantes) et `reverse_relations` (entrantes).
- **RLS** : SELECT `has_org_access(organization_id)` partout (assignments via `EXISTS` sur le
  contact) ; écriture seulement `contact_roles` (`is_org_admin`). Les 4 fonctions trigger sont
  `SECURITY DEFINER` avec **`EXECUTE` révoqué** de `anon`/`authenticated` (advisor).
  **Étanchéité inter-tenants vérifiée de bout en bout** (2026-07-15) : test SQL simulant deux
  racines + `auth.uid()` de chaque tenant + anonyme — visibilité croisée nulle, écritures client
  refusées, unicité des refs externes bien scopée par org (transaction de test annulée).
  Nuance : `has_org_access` exige l'appartenance à la **racine** — un membre d'une sous-org ne
  voit aucun contact (comme `categories`).
- Volontairement exclus (validé) : alias, historique, documents, workflow, dédoublonnage/fusion
  automatique, données sensibles (NIR, CNI, IBAN), modèle d'adresses complexe.
- Migrations : `contacts_referentiel_usagers`, `contacts_trigger_functions_revoke_execute`.

## Feature : API usagers (lecture/écriture) — `contacts-api`

Edge Function Deno **séparée de `public-api`** (qui reste contractuellement en lecture seule),
servie sous `{SUPABASE_URL}/functions/v1/contacts-api/…`, déployée `verify_jwt = false` (l'auth
est portée par la fonction). Permet de **consulter, créer, modifier, archiver** un usager —
**aucune suppression** (pas de DELETE, méthode → 405).

- **Auth = clé `api_keys`** (Bearer, SHA-256) comme `public-api`, **mais scope `contacts` requis**
  (colonne `scopes` ; les clés `read` → 403 : les usagers sont des données personnelles).
  Depuis le 2026-08-12, `public-api` vérifie symétriquement le scope `read` — l'asymétrie
  historique (toute clé valide lisait le référentiel) est corrigée et déployée. Les
  scopes se choisissent à la création de clé (`ApiKeyFormDialog`, switches « Référentiel
  (lecture) » / « Usagers (lecture + écriture) ») et s'affichent en badges (`ApiKeysSection`).
- **Isolation** : service role (hors RLS) mais chaque requête bornée à une organisation **racine**
  (les contacts y sont rattachés) — égalité stricte, pas de sous-arbre. Clé liée :
  `organization_id = organisation de la clé`. Clé **plateforme** : la racine servie est celle de
  l'organisation portée par l'en-tête **`X-Organization-Id`** (requis, 400 sinon ;
  `resolveRootOrgId` remonte les `parent_id`, protégé des cycles). **Vérifiée bout en bout** (2026-07-15, 32 assertions :
  cross-tenant 404/liste vide, 401/403, conflits 409, invariants 400, archive/restore, données de
  test nettoyées).
- **Endpoints** (préfixe `/v1`) : `contacts` GET (filtres `type`, `status`, `search` sur
  `display_name`, `email` exact, `phone` — égalité sur chiffres significatifs, mobile ET fixe,
  `quartier_id` — UUID ou littéral `null` pour les sans-quartier,
  lookup `source`+`external_id`, pagination `limit`/`offset` max 500) + POST ·
  `contacts/match` POST (rapprochement d'identités, voir ci-dessous) ·
  `contacts/{id}` GET + PATCH (partiel ; `contact_type` immuable ; `status` refusé) ·
  `contacts/{id}/archive` et `/restore` POST (obsolescence réversible, idempotent) ·
  `contact-roles` GET (catalogue → `role_ids`). Racine `/` + `openapi.json` publics.
- **Rapprochement d'identités (détection de doublons)** : `POST /v1/contacts/match` — **lecture
  seule** malgré le POST (identité trop riche pour une query string). Requête = identité
  partielle (tous champs optionnels, au moins un critère ; un prénom seul ne suffit pas) ;
  réponse = candidats classés `[{contact, score, reasons}]`, `contact` = **même sérialiseur**
  que la liste. Motifs : `email`/`phone`/`siret` (égalités normalisées), `name_exact` /
  `name_similar` (normalisation sans accents/casse/ponctuation ; similarité **pg_trgm ≥ 0.5**
  sur le nom complet + **garde-fou prénom ≥ 0.1** quand les deux prénoms sont connus — un
  homonyme de nom de famille seul, « Marie Dupont » pour « Jean Dupont », n'est **pas** proposé ;
  noms de naissance ET d'usage comparés des deux côtés), `birth_date` (renfort, jamais suffisant
  seul). Score (classement uniquement, documenté OpenAPI) : email +100 · phone +80 · siret +120 ·
  name_exact +60 · name_similar +arrondi(40×sim) · birth_date +20. Archivées exclues par défaut
  (`status: null` = tous). Le rapprochement vit dans la **RPC `match_contacts`** (SECURITY
  INVOKER, `EXECUTE` réservé à service_role — motif `org_subtree_ids`), bornée à l'org de la clé.
  Support (tient à 10⁵ contacts) : extensions `pg_trgm` + `unaccent` (schéma `extensions`),
  colonnes **générées** `mobile_phone_normalized`/`landline_phone_normalized` (fonction
  `normalize_phone` : chiffres seuls, +33/0033 et 0 initial retirés — mêmes règles que
  `normalizePhoneNumber` TS, miroir testé) + index b-tree partiels, index **GIN trigram** sur
  `match_full_name(last_name|usage_name, first_name)` et `normalize_name(legal_name)`
  (`immutable_unaccent` fige le dictionnaire pour l'indexabilité). Migrations :
  `match_extensions_pg_trgm_unaccent`, `contacts_match_identites`. **Vérifié bout en bout**
  (2026-07-17) : les 10 critères d'acceptation Clara + sérialiseur identique, filtre `phone`,
  400/405, OpenAPI — données de test nettoyées.
- **Géocodage & quartier** : quand l'adresse change (`address_line1`/`postal_code`/`city`)
  sans coordonnées fournies, l'API **géocode côté serveur** via la BAN (Géoplateforme IGN,
  `_shared/geocoding.ts` pur/testé + `fetch` best-effort 5 s dans `index.ts` : échec → coordonnées
  nulles, jamais d'erreur d'écriture ; score < 0.4 rejeté). Un consommateur peut fournir
  `address_lat`/`address_lon` directement (paire exigée sur l'état fusionné). `quartier_id`
  dans le payload = rattachement **manuel** (`quartier_auto` passe à false, vérif d'appartenance
  à l'org → 400) ; `quartier_id: null` = retour à l'**auto** (recalcul immédiat par le trigger).
  La fiche expose `address_lat`, `address_lon`, `quartier_id`, `quartier_auto`, plus (2026-07-18)
  l'objet **`quartier`** (`id`, `name`, `color`) — le quartier **résolu**, pour que le consommateur
  l'affiche sans second appel (`GET /v1/quartiers` porte les géométries : hors de proportion pour
  un libellé). Il vient d'un embed PostgREST `quartier:quartiers(id, name, color)` centralisé dans
  la constante **`CONTACT_SELECT`** : ⚠️ toute nouvelle requête dont le résultat part dans
  `serializeContact` doit l'utiliser — un `select("*")` laisserait `quartier` à `null` sans erreur.
  (Le `select("*")` du PATCH est volontairement resté nu : il sert au merge, pas à la sérialisation.)
- **Payloads** : whitelist stricte des clés (clé inconnue → 400), chaînes normalisées (trim,
  `""`→`null`), invariants par type vérifiés sur l'**état fusionné** au PATCH (messages français ;
  les CHECK DB restent le garde-fou). `role_ids` / `external_references` / `relations` fournis
  **remplacent** l'ensemble (omis = intouchés ; remplacement par différence/upsert, pas de
  delete-all). Relations : pas d'auto-relation, cible jamais une personne physique. Création :
  compensation (delete) si rôles/refs/relations échouent après l'insert. Erreurs `{error:{code,message}}`
  + **409 `conflict`** (SIRET dupliqué, réf externe prise — mappage des contraintes 23505).
- ⚠️ `internal_notes` **est exposée** (API serveur-à-serveur pour les apps agents) : un
  consommateur servant des usagers finaux ne doit jamais la retransmettre — documenté dans l'OpenAPI.
- **Docs** : `/api-doc-usagers` (route publique, `ApiDocsPage api="contacts-api"` — Redoc pointé
  sur `…/contacts-api/openapi.json`) ; liens depuis la section « APIs de la gamme » de
  `OrgSettingsPage`.
- Code : `supabase/functions/contacts-api/` — `index.ts` + `_shared/{dto,errors,validation,
  serializers,openapi}.ts` (logique pure **testée** par vitest, sans dépendance Deno, déployée avec
  la fonction). Le déploiement (`deploy_edge_function`) doit inclure `index.ts` + tout `_shared/*.ts`.

## Feature : guichet IA (`ai-api`) — la clé du fournisseur et le décompte

Troisième edge function, `{SUPABASE_URL}/functions/v1/ai-api/…`, `verify_jwt = false`. **Le
Socle détient la clé du fournisseur LLM, compte les jetons et refuse au-delà du plafond** ; les
applications de la gamme composent leur prompt et le lui confient (décision PO du 2026-08-29,
première consommatrice : Iris).

**La frontière tombe là : l'application décide CE QUI EST DIT, le Socle décide SI ÇA PEUT
L'ÊTRE et CE QUE ÇA A COÛTÉ.** Le Socle ne sait pas ce qu'est une demande, un courrier ou un
dossier, et n'a pas à le savoir — il ne compose aucun prompt.

- **Pourquoi une troisième fonction** : `public-api` est contractuellement en lecture seule (sa
  garde `req.method !== "GET"` *est* son contrat) ; `contacts-api` est la surface des données
  personnelles, gardée par le scope `contacts`. Troisième domaine ⇒ troisième fonction ⇒
  troisième scope, ce qui est déjà la décision de la maison.
- **Auth** : clé `api_keys` + scope **`ai`** + **`api_keys.consumer` non nul**. L'imputation
  vient de la CLÉ, jamais du corps — sans quoi une application ferait porter sa dépense à une
  autre. Le périmètre suit `contacts-api` (`X-Organization-Id` + `resolveRootOrgId`) : le budget
  étant celui d'une **collectivité**, l'appel d'une sous-organisation débite sa racine.
- **Routes** : `POST /v1/completions` (l'appel), `GET /v1/usage?period=AAAA-MM` (plafond,
  consommation, ventilation par application), `/` et `/openapi.json` publiques.
- ⚠️ **Ce que l'appelant NE décide PAS** (400, message français) : `model` et `agent_id` — le
  Socle reste l'**autorité sur le coût**, l'appelant passe un **alias** `agent` résolu en secret ;
  `consumer` et `organization_id` (dérivés de la clé) ; `tools`/`tool_choice` (chaque outil est
  un second chemin d'accès aux données, non audité) ; `stream` (le `usage` n'arrive qu'au dernier
  événement SSE) ; `temperature` et consorts ; `role: "system"` dans `messages` — le prompt
  système a son propre champ.
- ⚠️ **PASSE-PLAT : le Socle voit le prompt, il ne le garde pas.** Ce n'est pas une déclaration
  mais une propriété **vérifiable**, par ordre de force : (1) aucune colonne du journal ne peut
  porter un contenu — un test épingle l'ensemble exact des 17 colonnes ; (2) les signatures de
  RPC ne portent que des bigints, des uuid et deux énumérés ; (3) l'appel fournisseur est isolé
  dans `_shared/provider.ts`, qui ne reçoit **ni client Supabase, ni logger** ; (4) un test **lit
  le source** pour interdire tout `console.*` mentionnant le contenu et l'URL
  `/v1/conversations`, qui stockerait le fil chez le fournisseur. La limite est écrite partout :
  la promesse porte sur la **persistance**, pas sur l'exposition.
- ⚠️ **Chaîne de délais, à ne pas inverser** : fournisseur 55 s < Socle 60 s < consommateur.
  Inversée, le consommateur abandonne des appels que le Socle termine et **facture**. Il n'y a
  pas de clé d'idempotence — elle exigerait de stocker la réponse, ce que le passe-plat interdit.
- **Réserver → appeler → solder** dans une seule fonction, sans frontière réseau au milieu :
  `reserve_ai_usage` fait UN `UPDATE` conditionnel (zéro ligne ⇒ refus **sans jamais appeler le
  fournisseur**), `settle_ai_usage` corrige avec la consommation réelle. Un échec ne consomme
  rien. Détail : [`docs/data-model.md`](docs/data-model.md) § « Plafond et journal d'utilisation IA ».
- **Écrans** : `/superadmin/ia` (inter-clients : qui coûte quoi, qui n'est pas bordé — **lecture
  seule**), Organisations › « Assistant IA » (plafond, consommation par application, 20
  derniers appels — **le seul écran qui écrit**, par les RPC) et, dans l'app par organisation,
  **`/consommation-ia`** (`AiUsagePage`, **consultation seule** pour l'admin de la collectivité).
  Les sections d'`OrgSettingsPage` sont adressables (`?section=ia`), ce qui rend la table
  inter-clients cliquable.
- Les trois cartes (jauge, ventilation par application, derniers appels) sont **un seul
  composant**, `src/features/ai-usage/AiUsageOverview.tsx`, qui **n'écrit rien** : la commande de
  réglage lui est glissée par `action`, que seul l'écran superadmin fournit. Le client n'a donc
  aucun chemin vers l'écriture dans l'arbre rendu (**testé**), et le serveur dit la même chose —
  RLS en SELECT seul, garde `is_super_admin()` **dans** les RPC de réglage. ⚠️ Un plafond que son
  porteur pourrait lever ne serait pas un plafond : ouvrir la **lecture** (migration
  `ai_usage_lecture_admin`, `is_admin_of_self_or_ancestor`) n'ouvre pas le réglage.
- Code : `src/features/ai-usage/` — `aiQuota.ts` (pur, **testé** : jauge, formats, période),
  `useAiUsage.ts` (lecture + les deux mutations superadmin), `AiUsageOverview.tsx`,
  `AiUsagePage.tsx`, `useAdminRootOrganizations.ts` (⚠️ racines **administrées**, pas simplement
  visibles : un membre ordinaire y lirait un « 0 jeton » faux, produit par le RLS). Côté
  superadmin : `SuperAdminAiUsagePage` + `aiUsageAll.ts` (pur, testé) et
  `organizations/sections/AiUsageSection.tsx` (la part qui écrit).
- **Garde-fou de DÉBIT** (`ai_usage_rate`, 2026-08-29) — un plafond mensuel n'est pas un
  rate-limit : il dit *combien*, jamais *à quelle vitesse*, et une boucle brûlerait le mois en
  quelques minutes. `reserve_ai_usage` a donc **deux portes** : la cadence **puis** le plafond.
  Les seuils dépendent de la NATURE de l'appel — conversationnel 20/minute par agent (120 sans
  agent), lot d'OCR 60 (360) : un humain qui lit 150 mots entre deux questions n'a pas le
  rythme d'une machine qui enchaîne des documents. Les deux natures ont des compteurs
  **SÉPARÉS** (`bucket` dans la clé) : sans quoi un lot de courrier mangerait le budget de
  questions du même agent. La nature vient de `p_resource_type`, **dérivé côté serveur** —
  un appelant ne peut pas se déclarer « lot ». Type inconnu ⇒ seuil conversationnel, le plus
  strict. Refus = `429 ai_rate_limited`
  + `Retry-After` — distinct du plafond, parce que le crédit est intact et que le geste attendu
  est d'attendre, pas de demander un relèvement.
  ⚠️ **Le compteur retient les TENTATIVES, refus de plafond compris** : sans cela, une boucle
  déjà refusée pour crédit épuisé ne serait jamais coupée — c'est-à-dire précisément dans le cas
  où le garde-fou sert. C'est aussi ce qui permet de le vérifier **sans dépenser un jeton**.
  ⚠️ La porte de cadence passe **avant** celle du plafond : elle doit couvrir les collectivités
  **sans plafond**, qui sortent par un `return` anticipé.
  ⚠️ Le seuil **n'est pas réglable** (décision PO) : un garde-fou de sécurité n'est pas un
  paramètre commercial, et le rendre négociable, c'est le voir négocié le jour où il gêne — or
  il ne gêne que les boucles.

## Feature : quartiers (découpage du territoire)

Portage de la fonctionnalité quartiers de Clara (instantané dans `references/clara-quartiers/`),
décidé quand Clara a délégué ses usagers au Socle. **Multi-tenant strict** : un quartier est
rattaché à une **organisation principale (racine)** — trigger `enforce_quartier_root_org` (motif
habituel). Livré : modèle DB + UI Socle + **exposition API** (catalogue dans `public-api`,
géocodage/rattachement dans `contacts-api` — voir les deux features API). Clara **affiche** le
quartier depuis le 2026-07-18 (objet `quartier` résolu dans la fiche contact). Reste : le
**filtre** par quartier côté Clara, et les **stats par quartier**, pas encore exposées par
l'API (RPC `stats_contacts_by_quartier` disponible).

- **`quartiers`** : `name` (unique par org, insensible à la casse — index
  `quartiers_org_name_unique`), `color`, `geom geometry(MultiPolygon, 4326)` (**PostGIS**,
  extension installée dans le schéma `extensions` ; index GIST). Pas de dessin dans l'app :
  **import GeoJSON uniquement** (`ST_MakeValid` répare les polygones auto-intersectants).
  RLS : SELECT `has_org_access` · écriture (ALL) `is_org_admin` — table modifiable côté
  client, comme `contact_roles`.
- ⚠️ **L'import GeoJSON remplace le découpage** (depuis le 2026-07-18) : le fichier fait foi,
  les quartiers de l'organisation sont **supprimés puis recréés dans la même transaction**
  (paramètre `p_replace` de `create_quartiers_batch`) — un import qui échoue ne laisse donc
  jamais l'organisation sans découpage, et les noms ne se retrouvent plus suffixés « (2) » par
  collision avec l'ancien jeu (seuls les doublons **internes au fichier** le sont). Remplacer
  par un lot **vide** est refusé (ce serait une suppression, qui a son propre bouton). L'UI
  avertit et fait confirmer par `AlertDialog` quand des quartiers existent.
- **`contacts`** : + `address_lat`/`address_lon` (géocodage BAN prévu en phase API),
  `quartier_id` (FK `ON DELETE SET NULL`), `quartier_auto` (passe à false quand une valeur est
  forcée manuellement, pour la protéger du recalcul de masse). **Rattachement automatique par
  trigger** `assign_contact_quartier` (BEFORE INSERT/UPDATE) : en mode auto, recalcule
  `quartier_id` quand les coordonnées changent, quand `quartier_auto` repasse à true, ou quand
  `quartier_id` arrive à NULL avec des coordonnées présentes (un PATCH `quartier_id: null`
  réassigne immédiatement — migration `assign_contact_quartier_recompute_on_null`) ; purge si
  coordonnées nulles ; en mode manuel, vérifie que le quartier appartient à la même racine que
  le contact.
- **RPC** (`SECURITY INVOKER` sauf mention ; `EXECUTE` accordé à authenticated + service_role,
  révoqué d'anon) : `quartier_for_point` (point-dans-polygone), `create_quartier_from_geojson` et
  `create_quartiers_batch` (import **atomique** en un appel, noms dédoublonnés « (n) » côté
  serveur), `list_quartiers_geojson` (cast `ST_AsGeoJSON` serveur — PostGIS stocke en binaire,
  illisible par Leaflet sinon), `stats_contacts_by_quartier` (+ ligne « Sans quartier »),
  `contacts_outside_quartiers` (géolocalisés hors de tout polygone),
  `recalculate_contact_quartiers` (**SECURITY DEFINER** — les contacts n'ont aucune policy
  d'écriture client ; garde interne `is_org_admin(p_org_id)` ou service_role),
  `reset_orphan_manual_quartiers` (même motif SECURITY DEFINER + garde) : après un import en
  remplacement, un usager rattaché **manuellement** à un quartier disparu (`quartier_id` mis à
  NULL par la FK, `quartier_auto = false`) serait **ignoré à jamais** par le recalcul — on le
  repasse donc en automatique. Appelée depuis `create_quartiers_batch` en mode remplacement.
- **UI** : carte **Leaflet** (deps `leaflet` + `react-leaflet@4` — la v5 exige React 19) via le
  composant partagé `QuartiersManager` : carte cadrée sur l'emprise, liste avec nombre d'usagers
  par quartier, import GeoJSON (noms devinés depuis les propriétés, couleurs cyclées), édition
  nom/couleur, suppression, recalcul des assignations. Deux points d'entrée (motif
  `document_types`) : page admin **`/quartiers`** (sélecteur de racine si plusieurs) et section
  « Quartiers » de `OrgSettingsPage` (racine uniquement). Les droits d'écriture sont portés par
  le RLS (l'UI ne masque pas les actions).
- Code : `src/features/quartiers/` — `useQuartiers.ts` (hooks + mutations ; l'import enchaîne
  le recalcul), `quartiersGeojson.ts` (logique pure **testée** : extraction des polygones d'un
  GeoJSON quelconque, noms devinés/dédoublonnés, palette, `readableTextColor`), `QuartiersMap`,
  `ImportQuartiersDialog`, `QuartierEditDialog`, `QuartiersManager`, `QuartiersPage`.
- Migrations : `quartiers_referentiel`, `assign_contact_quartier_recompute_on_null`,
  `quartiers_import_remplacement`. Vérifié de
  bout en bout (2026-07-17) : test SQL transactionnel annulé (assignation auto, dédoublonnage,
  invariants tenant/racine), parcours navigateur complet (import → stats → recalcul → renommage →
  suppression), et parcours API réel (géocodage BAN d'une adresse → quartier assigné, filtre,
  re-géocodage au changement d'adresse, manuel/auto, 400 sur paire de coordonnées incomplète et
  quartier inconnu).

## Design system

Socle consomme le **Notch / Ariane Design System** (projet Claude Design, partagé avec Ariane et
Clara). Les tokens sont déjà repris dans `src/index.css` + `tailwind.config.ts` (primaire vert
`hsl(153 90% 32%)`, secondaire beurre, radius 14px, ombres douces). Construire l'UI
avec les primitives `src/components/ui/*` (Button, Input, Field, Card, Badge, Dialog, AlertDialog)
et les classes de tokens — ce sont les « briques » du DS. Divergence connue : police Socle = Inter,
DS = Nunito Sans (non alignée volontairement pour l'instant).

### Shell de l'app par organisation (le même que dans la gamme)

- **Rail latéral vert** (`Sidebar.tsx`) : `bg-primary`, états sur `primary-foreground/10|20`.
  ⚠️ **Pas** les jetons `--sidebar-*` (charbon-forêt) : ils existent dans `index.css` à
  l'identique d'Iris et de Clara, qui ne s'en servent pas non plus pour le rail. Le rail est le
  repère qu'un agent retrouve d'une application à l'autre — le faire diverger serait la seule
  chose qu'il remarquerait en changeant d'outil.
- **En-tête** (`Header.tsx`) : wordmark Edilumen · mention **« Socle »** (le produit dans
  l'entreprise) · séparateur · **identité de l'organisation principale** (logo si `logo_url`,
  traité comme un wordmark — hauteur fixe, largeur libre : les logos de collectivité sont des
  bandeaux — puis nom) · menu utilisateur. Motif repris du shell d'Iris/Clara.
  L'organisation affichée vient de `visibleRootOrganizations` (pur, testé) : le sommet de la
  forêt **visible**, pas la racine stricte — un membre d'une sous-organisation ne voit pas sa
  racine (`has_org_access` exige l'appartenance directe) et resterait sans repère.
  ⚠️ L'en-tête lit `logo_url` **brut**, sans résoudre l'héritage de charte : un membre dont le
  sommet visible est une sous-organisation qui **hérite** n'y voit aucun logo, alors que sa charte
  en résout un. Écart connu, hérité d'avant la charte (il fallait un `logo_url` propre pour voir
  quoi que ce soit) ; le combler demande un `resolve_branding` par sommet visible. Le Socle
  n'ayant **pas** de bascule de tenant (chaque écran a son sélecteur), plusieurs sommets
  s'affichent « premier nom + `+N` » avec la liste en `title`.

## Conventions

- **Alias d'import** `@/` → `src/` (voir `vite.config.ts`).
- **Organisation par feature** sous `src/features/<domaine>/` (hook `useX.ts`, dialogues,
  pages). Primitives UI génériques dans `src/components/ui/`, layout dans
  `src/components/layout/`, partagé transverse dans `src/components/shared/`.
- **Données serveur = TanStack Query** : un hook `useXxx` par ressource, `queryKey` explicite,
  invalidation dans `onSuccess`. Pas d'appel `supabase` direct dans les composants de page.
- **Composition** : formulaires en `Dialog`, confirmations destructives en `AlertDialog`,
  états via `EmptyState` / squelettes `animate-pulse`. Classes fusionnées avec `cn()`.
- Textes et libellés **en français**.
```
