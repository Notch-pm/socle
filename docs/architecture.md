# Architecture — Socle

> **Public** : développeuses et développeurs (humains et agents IA) travaillant sur Socle ·
> **Question traitée** : comment le système est-il construit, et pourquoi · **Dernière mise à
> jour** : 2026-09-12

Ce document explique les frontières du système et les décisions qui les justifient. Il ne liste
ni les tables (→ [`./data-model.md`](./data-model.md)), ni les endpoints (→ les OpenAPI, publiées
sur `/api-doc` et `/api-doc-usagers`), ni les règles de contribution (→ [`../CLAUDE.md`](../CLAUDE.md)).

## 1. Vue système

Trois grandes zones, une seule base de données :

```
┌──────────────────────────┐          ┌───────────────────────────────────┐
│ SPA React (Vite/TS)       │          │ Consommateurs de la gamme            │
│ src/App.tsx — 2 zones UI  │          │ Ariane · Clara · Iris · portail…      │
└─────────────┬──────────────┘          └───────────────────┬──────────────────┘
              │ supabase-js                                  │ Authorization: Bearer
              │ JWT utilisateur                               │ <clé api_keys>
              ▼                                               ▼
┌──────────────────────────┐          ┌───────────────────────────────────┐
│ PostgREST + Auth           │          │ Edge Functions Deno                   │
│ (Supabase)                 │          │ public-api      (lecture seule)       │
│ RLS = frontière unique     │          │ contacts-api    (lecture/écriture)    │
│                            │          │ ai-api          (guichet LLM)         │
│                            │          │ audience-api    (écriture seule)      │
└─────────────┬──────────────┘          │ verify_jwt=false, auth portée par le  │
              │ requêtes filtrées par    │ code de la fonction                    │
              │ le rôle de l'appelant    └───────────────────┬──────────────────┘
              │                                               │ service role (hors RLS)
              │                                               │ périmètre reconstruit en
              │                                               │ code (`org_subtree_ids`)
              ▼                                               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Postgres (schéma public) — organizations, procedures, contacts, quartiers…  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       ▼
                       Storage privé — bucket `procedure-documents`
                       (RLS `storage.objects`, même motif que les tables)
```

Six autres Edge Functions ne sont **pas** des APIs de gamme, uniquement des besoins internes à
l'UI Socle ou à Supabase Auth : `send-test-email` et `invite-user` (JWT utilisateur +
`is_org_admin`), `translate-labels` (JWT utilisateur + `is_org_admin` ; traduction automatique
des textes d'une démarche ou d'une catégorie, **par `ai-api`** — le Socle y est sa propre
application consommatrice, jamais un second appelant du fournisseur), `integration-test` et `integration-procedures` (JWT utilisateur +
`is_super_admin` ; test de connexion et import des démarches d'une intégration partenaire,
seuls lecteurs des secrets d'intégration), `auth-email-hook` (webhook Supabase Auth, signature Standard
Webhooks). Détail des fonctions → [`./operations.md`](./operations.md).

## 2. Principe fondateur : la sécurité vit dans le RLS

**Les droits ne sont jamais appliqués côté client.** Le SPA appelle PostgREST avec le JWT de
l'utilisateur connecté ; c'est le Row Level Security de Postgres qui décide ce qui est lisible ou
écrivable. L'UI ne fait que **refléter** ce que le RLS autorise (masquer un bouton n'est jamais
une mesure de sécurité, seulement du confort).

Quatre fonctions helper, toutes `SECURITY DEFINER`, portent cette logique :

- `is_super_admin()` — l'utilisateur courant est super admin (accès plateforme total).
- `is_org_admin(org_id)` — admin **direct** de cette organisation (ou super admin).
- `has_org_access(org_id)` — membre de cette organisation (ou super admin).
- `is_admin_of_self_or_ancestor(org_id)` — admin de l'organisation **ou de n'importe quel
  ancêtre** (remonte `parent_id`).

Elles doivent rester `SECURITY DEFINER` : en `SECURITY INVOKER`, elles créeraient une récursion
infinie (une policy sur `users` qui appelle une fonction qui relit `users`…). Le détail du motif
anti-récursion, des GRANT/REVOKE et du catalogue complet des policies vit dans
[`./data-model.md`](./data-model.md) — il n'est pas dupliqué ici.

**Deux niveaux de rôle**, à ne pas confondre :

- `users.global_role` — rôle **plateforme** (`super_admin` ou non). Gouverne l'accès à la zone
  superadmin, rien d'autre.
- `user_organizations.role` — rôle **par organisation** (notamment `admin`). Gouverne la gestion
  d'une organisation et de son catalogue.

**La hiérarchie propage les droits admin vers le bas** : un admin d'une organisation gère aussi
toute sa descendance (`is_admin_of_self_or_ancestor`), pas seulement l'organisation exacte. Un
super admin, lui, agit sur toute la plateforme et est seul à créer des organisations racines et à
supprimer des sous-organisations (jamais une racine). Ce point a une histoire — voir le journal
des décisions (§6) : le modèle initial ne propageait aucun droit vers les enfants.

## 3. Zones applicatives & navigation

Un seul `BrowserRouter`, un `AuthProvider` global, trois groupes de routes réels (`src/App.tsx`).
Il n'y a **pas** de route catch-all `*` (constat en §7).

### 3.1 Routes publiques (hors shell, sans garde)

| Route | Composant |
|---|---|
| `/login` | `LoginPage` |
| `/mot-de-passe-oublie` | `ForgotPasswordPage` |
| `/activer-compte` | `SetPasswordPage` (flux `invite`) |
| `/reinitialiser-mot-de-passe` | `SetPasswordPage` (flux `recovery`) |
| `/api-doc` | `ApiDocsPage` — Redoc sur l'OpenAPI de `public-api` |
| `/api-doc-usagers` | `ApiDocsPage api="contacts-api"` |

### 3.2 Zone super admin — `SuperAdminRoute` › `SuperAdminLayout`

| Route | Composant |
|---|---|
| `/superadmin` (index) | `SuperAdminDashboardPage` |
| `/superadmin/applications` | `ApplicationsPage` — registre des applications de la gamme, **une clé plateforme par application** (périmètre = collectivités abonnées) |
| `/superadmin/integrations` | `IntegrationsCataloguePage` — catalogue des intégrations partenaires (Arpège…), par type ; la configuration d'un client est une section de son `OrgSettingsPage` |
| `/superadmin/cles-plateforme` | `<Navigate to="/superadmin/applications" replace />` — redirection de compatibilité |
| `/superadmin/plateforme` | `PlatformSettingsPage` — réglages de plateforme (zone des sous-domaines, cible CNAME, plafond IA par défaut) et rejeu du provisioning |
| `/superadmin/organisations` | `<Navigate to="/superadmin" replace />` — redirection de compatibilité |
| `/superadmin/organisations/:orgId` | `OrgSettingsPage` |
| `/superadmin/organisations/:orgId/demarches/nouveau` | `ProcedureEditorPage variant="superadmin"` |
| `/superadmin/organisations/:orgId/demarches/:procId` | idem |
| `/superadmin/organisations/:orgId/portail` | `PortalEditorPage variant="superadmin"` — éditeur du site de démarches (pleine hauteur dans le shell) |

**Principe structurant : une organisation racine = un client = une entrée de menu = une
`OrgSettingsPage`.** Aucune vue ne fond tous les clients de la plateforme dans un même arbre —
c'est précisément ce que faisait l'ancienne `OrganizationsAdminPage` (supprimée). Le menu latéral
(`SuperAdminSidebar`) liste les organisations principales (racines strictes, `parent_id` null)
triées par nom sous une ligne « Organisations » non cliquable, avec un bouton icône « + » pour
créer une nouvelle racine ; chaque entrée mène à l'`OrgSettingsPage` de son client, dont l'accueil
affiche l'arbre borné à son propre sous-arbre. `/superadmin/organisations` n'a donc plus de
raison d'exister en tant que vue : c'est une redirection.

Seule exception à « tout est rangé sous un client » : les **clés API plateforme** (périmètre =
toutes les organisations) n'appartiennent à aucune racine. Elles ont leur propre entrée de menu
« Clés plateforme » et leur page (`PlatformApiKeysPage`, depuis le 2026-08-20), qui réutilise la
liste et le dialogue des clés d'organisation (`ApiKeysList`, `ApiKeyFormDialog`) avec un
avertissement et une case d'assentiment explicites à la création. Le tableau de bord affiche le
nombre de clés plateforme actives.

### 3.3 Zone app par organisation — `ProtectedRoute` › `AppShell`

| Route | Composant |
|---|---|
| `/` (index) | `DashboardPage` (chiffres du référentiel + fréquentation du site) |
| `/organisations` | `OrganizationsPage` |
| `/organisations/:orgId` | `OrganizationEditorPage` (page à onglets) |
| `/demarches` | `ProceduresPage` |
| `/demarches/nouveau` (`?org=<rootId>`) | `ProcedureEditorPage variant="admin"` |
| `/demarches/:procId` (`?step=N`) | idem |
| `/categories` | `CategoriesPage` |
| `/types-pieces` | `DocumentTypesPage` |
| `/documents` | `DocumentsPage` (modèles à variables) |
| `/site-de-demarches` (`?org=<rootId>`) | `PortalEditorPage variant="admin"` — éditeur du site de démarches (pleine hauteur dans le shell) |
| `/quartiers` | `QuartiersPage` |
| `/utilisateurs` | `UtilisateursPage` |

### 3.4 Gardes (`src/components/layout/ProtectedRoute.tsx`)

- **`ProtectedRoute`** : `loading` → écran de chargement ; pas de session → `/login` (avec
  `state.from` pour revenir après connexion) ; `profile.global_role === "super_admin"` →
  **redirigé vers `/superadmin`**. Un super admin ne voit donc jamais l'app par organisation ; il
  a ses propres écrans.
- **`SuperAdminRoute`** : pas de session → `/login` ; `global_role !== "super_admin"` → `/`.

Le chargement du profil (`AuthProvider`) est **keyé sur l'id utilisateur, pas sur l'objet
session** — supabase-js ré-émet un nouvel objet session à chaque retour d'onglet ; keyer dessus
repasserait `loading` à `true` et démonterait toute la page en cours (perte de saisie). Détail et
piège complet → [`../CLAUDE.md`](../CLAUDE.md) (section Authentification & rôles).

## 4. Frontend

### 4.1 Organisation par feature

Alias d'import `@/` → `src/`. Le code métier vit sous `src/features/<domaine>/` (un hook
`useX.ts`, des dialogues, des pages) ; les primitives UI génériques dans
`src/components/ui/`, le layout dans `src/components/layout/`, le partagé transverse dans
`src/components/shared/`. Neuf features aujourd'hui : `auth`, `organizations`, `superadmin`,
`procedures`, `categories`, `document-types`, `quartiers`, `users`, `public-api-docs`. Il n'existe
**pas** de feature `contacts` côté frontend : les contacts n'existent que via `contacts-api`, sans
UI Socle pour l'instant (voir [`features/referentiel-usagers.md`](./features/referentiel-usagers.md)).

### 4.2 Données serveur : TanStack Query

Un hook par ressource, `queryKey` explicite, invalidation dans `onSuccess` — pas d'appel
`supabase` direct dans les composants de page (deux exceptions ponctuelles assumées :
`UtilisateursPage`, `SuperAdminDashboardPage`). `QueryClient` configuré avec `retry: 1` et
`refetchOnWindowFocus: false` (`src/main.tsx`). Les requêtes dépendantes utilisent
systématiquement `enabled: Boolean(x)`.

### 4.3 Réutilisation entre les deux zones

Le même composant sert l'app par organisation et la zone superadmin, paramétré par une prop
`organizationId` (ou `rootOrganizationId`) plutôt que dupliqué : `OrganizationsManager`,
`UsersManagementPage`, `SmtpSettingsSection`, `ProceduresListPanel`, `DocumentTypesManager`,
`QuartiersManager`. Exception : `CategoriesPage` reste mono-zone (pas de section « Catégories »
dans `OrgSettingsPage`).

### 4.4 Design system

Socle consomme le **Notch / Ariane Design System**, partagé avec Ariane et Clara. Les tokens sont
repris dans `src/index.css` + `tailwind.config.ts` (primaire vert `hsl(153 90% 32%)`, secondaire
beurre, sidebar forêt, `--radius: 0.875rem`, ombres douces `socle-sm/md/lg`). L'UI se construit
avec les primitives maison façon shadcn sous `src/components/ui/` — à ce jour **9 primitives**
(`alert-dialog`, `badge`, `button`, `card`, `dialog`, `field`, `input`, `label`, `switch`, sur
Radix + `class-variance-authority` + `cn()`) et **2 composants partagés**
(`src/components/shared/` : `EmptyState`, `PageHeader`). Le reste (Select générique, Skeleton,
Toast, DataTable, TreeView générique…) reste à construire au fil des besoins. Divergence assumée
avec le DS : police Socle = Inter, DS = Nunito Sans (non alignée volontairement pour l'instant).

Le **rail de navigation** de l'app par organisation partage avec la gamme ses **mesures et sa
disposition**, pas sa **couleur** : chaque application peint le sien. Au 2026-09-11, celui de
Socle est en secondaire beurre (`#FFCC57`) à icônes bleu nuit (`#0B132B`), celui de Clara en bleu
nuit à icônes blanches, ceux d'Iris et d'Ariane en primaire verte — ce n'est pas un écart à
réaligner. Socle et Clara portent chacun leur couleur dans un jeton `--rail` / `--rail-foreground` ;
aucun rail ne se sert des jetons `--sidebar-*` (forêt). Détail et contrastes :
[`features/shell-et-lanceur.md`](./features/shell-et-lanceur.md).

### 4.5 Logique métier en modules purs testés

Les règles qui ne dépendent ni du DOM ni du réseau (constitution du schéma de formulaire,
réordonnancement par glisser-déposer, moteur de conditions, formats de fichiers, parsing de la
base de connaissances, arbre d'organisations, génération de clé API, GeoJSON des quartiers…)
vivent dans des fichiers `.ts` sans effet de bord, testés par vitest indépendamment des
composants. Cette séparation permet de tester le cœur métier sans monter de DOM. L'inventaire
exhaustif par feature est maintenu dans les fiches [`features/`](./features/) (une ligne « logique pure
testée » par feature) plutôt que dupliqué ici.

## 5. APIs & contrats publics

Socle est le référentiel central de la gamme : les autres produits (Ariane, Clara, Iris, et le
portail usagers Nora) ne redéfinissent pas les organisations, démarches, quartiers ou usagers — ils
les **consomment**. Cette consommation passe par deux Edge Functions Deno qui font autorité :
`public-api` (référentiel, lecture seule) et `contacts-api` (usagers, lecture/écriture, scope de
clé dédié). Les deux authentifient par clé API (`api_keys`, secret haché SHA-256, jamais en
clair) et lisent avec la **service role** — donc **hors RLS** : le périmètre par organisation est
alors reconstruit en code (`org_subtree_ids` pour `public-api`, égalité stricte sur la racine pour
`contacts-api`), pas délégué à Postgres. Détail des tables, RPC et policies →
[`./data-model.md`](./data-model.md).

Trois garanties structurent ce contrat public :

- **Sérialisation par whitelist stricte** (`_shared/serializers.ts` de chaque fonction) : aucune
  colonne sensible ne peut fuir même sur un `select *` mal formé côté code.
- **JSON possédés transmis tels quels** (`form_schema`, `requester_config`, `knowledge_base`,
  `translations`, `metadata`) : Socle ne les valide pas au passage, il les doit à sa propre
  logique de saisie (`src/features/procedures/*.ts`) qui en est la source de vérité.
- **L'OpenAPI est la documentation de référence**, publiée en pages Redoc in-app (`/api-doc`,
  `/api-doc-usagers`) plutôt que servie par la fonction elle-même (la passerelle Supabase force
  les réponses HTML des Edge Functions en `text/plain` avec une CSP `sandbox`). Aucun document du
  corpus ne réénumère les endpoints — c'est la propriété exclusive des OpenAPI.

Garanties d'isolation, scopes, clé plateforme et politique de compatibilité pour les équipes
consommatrices → [`./integration.md`](./integration.md).

**Le portail usagers (Nora) est le consommateur le plus contraint** : une instance unique, sans
base de données, servie sous le domaine de chaque collectivité. Le Socle lui résout le domaine
visité (`GET /v1/portal/tenant?hostname=`, table `organization_domains`, `hostname` unique sur
toute la plateforme), lui sert le catalogue déjà filtré (`/v1/portal/procedures`), la composition
**publiée** de la page d'accueil (`/v1/portal/page`, table `portal_pages` — éditée dans le Socle
par l'écran « Site de démarches », voir [`features/site-de-demarches.md`](./features/site-de-demarches.md)) et la charte résolue. Nora ne connaît que ces
routes ; la traduction vers son propre vocabulaire se fait chez lui, en un seul endroit, et il
ignore toute section qu'il ne sait pas rendre — le Socle peut apprendre un bloc avant le portail.

## 6. Journal des décisions

| Date | Décision | Pourquoi |
|---|---|---|
| 2026-07-04 | Deux zones applicatives strictement séparées (app par organisation / superadmin), chacune avec son shell, ses routes et ses gardes. | Un super admin gère la plateforme entière, un admin d'organisation gère la sienne : deux parcours simples plutôt qu'une UI unique truffée de branchements conditionnels sur le rôle. |
| Après le 2026-07-04 (date précise non tracée dans les rapports disponibles) | Propagation hiérarchique des droits admin (`is_admin_of_self_or_ancestor`) : un admin d'organisation gère aussi toute sa descendance, pas seulement l'organisation exacte. | Remplace un modèle plus strict, documenté comme tel dans l'ancien `ARCHITECTURE.md` du 2026-07-04 (aujourd'hui faux) : être admin d'un parent n'y donnait aucun droit sur les enfants — intenable dès qu'un admin doit configurer tout son sous-arbre. Étendue ensuite à `organization_procedures` par une migration dédiée (`org_procedures_rls_admin_subtree`). |
| Non daté précisément ; en place au plus tard le 2026-07-11 (éditeur d'organisation à onglets, activation par organisation) | Motif « organisation principale (racine) » : chaque table de catalogue ou de référentiel (`procedures`, `document_types`, `api_keys`, `contacts`, `contact_roles`, `quartiers`) est rattachée par trigger à une organisation **racine**, jamais à une sous-organisation. | Isolation multi-tenant stricte entre clients : un même mécanisme (`enforce_*_root_org`), appliqué systématiquement à chaque nouvelle table, plutôt qu'une règle réinventée à chaque feature. |
| 2026-07-16 | `public-api` (référentiel, lecture seule) et `contacts-api` (usagers, lecture/écriture) sont deux Edge Functions distinctes, avec des scopes de clé différents (`read` / `contacts`). | Les usagers sont des données personnelles : `public-api` reste contractuellement en lecture seule pour tous ses consommateurs, sans exception d'écriture à gérer dans son contrat. |
| 2026-07-16 | Aucune policy RLS d'écriture sur `contacts` côté client : la table ne s'écrit que par la service role de `contacts-api`. | Centraliser le géocodage BAN, le rattachement de quartier et les invariants par type de contact dans un seul point d'entrée serveur, plutôt que de les redupliquer dans chaque client autorisé par RLS. |
| 2026-07-17 | Clé API « plateforme » (`api_keys.organization_id` NULL) : périmètre = toutes les organisations, toutes racines confondues. | Liaison unique Socle↔Clara sans multiplier les clés par client ; nécessite l'en-tête `X-Organization-Id` côté `contacts-api` pour désigner la racine servie à chaque appel. |
| 2026-07-18 | Un import GeoJSON de quartiers **remplace** tout le découpage existant d'une organisation (suppression + recréation transactionnelle), plutôt que de le fusionner. | Le fichier importé fait foi ; fusionner aurait pu laisser cohabiter d'anciennes zones obsolètes avec les nouvelles. Un import qui échoue ne laisse jamais l'organisation sans découpage (même transaction). |
| 2026-08-12 (working tree, non commité) | La zone superadmin est réorganisée par client : une organisation racine = une entrée de menu = une `OrgSettingsPage` ; `/superadmin/organisations` devient une redirection de compatibilité. | Les racines *sont* les clients de la plateforme ; une vue qui fond tous les clients dans un même arbre ne correspond à aucun besoin réel et complique l'isolation visuelle des périmètres. |
| 2026-08-12 | Refonte du corpus documentaire : un document = un public + une question (`README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/integration.md`, `docs/operations.md`, `docs/api-changelog.md`, `docs/roadmap.md`) ; anciens `ARCHITECTURE.md` / `DATA_MODEL.md` / `UI_ARCHITECTURE.md` archivés sous `docs/archive/`. | Les trois anciens documents contredisaient l'état réel du système (notamment le modèle de droits) — une doc fausse est pire qu'une doc absente. |
| 2026-08-12 | Durcissement du contrat de clés et traçabilité : `public-api` vérifie le scope `read` (403 sinon), `EXECUTE` d'`org_subtree_ids` réservé à `service_role`, historique des migrations rapatrié dans `supabase/migrations/`, baseline complète `supabase/schema.sql` générée (`db dump`), types TS régénérés ; les deux APIs redéployées. | Aligner le comportement réel sur le contrat documenté (le modèle de scopes n'était vérifié que par `contacts-api`), et redonner au repo la trace du schéma. |
| 2026-08-23 | Le serveur d'envoi (SMTP) **s'hérite** le long de la hiérarchie : une organisation utilise le relais de l'ancêtre le plus proche qui en a un propre, sauf si elle en déclare un elle-même (`smtp_settings.inherit_parent`). La résolution se fait **à la lecture** (`resolve_smtp_settings`), sans recopie dans les enfants. | Une collectivité paramètre son relais une fois, à la racine, et toutes ses entités en bénéficient — y compris quand elle le change ensuite. Recopier la configuration dans chaque enfant aurait créé autant de copies à resynchroniser (et à désynchroniser silencieusement). |
| 2026-09-05 | Le portail usagers (Nora) est une instance unique **sans base de données** : le Socle résout le domaine visité (`organization_domains`, `hostname` unique globalement) et sert catalogue, composition publiée et charte par `public-api` (tag « Portail »). Le portail ne connaît que ces routes, jamais la structure interne du Socle. | Ajouter une collectivité = une ligne au Socle, aucun déploiement ; un seul référentiel, aucune copie à resynchroniser ; un renommage de colonne au Socle ne remonte pas jusqu'aux écrans du portail (traduction en un seul endroit, côté Nora). Le nom d'hôte est une donnée non fiable : il est déterminé côté serveur (`Origin`), et inconnu / hors périmètre / obsolète reçoivent le même 404. |
| 2026-09-05 | Composition de la page d'accueil dans `portal_pages` : deux colonnes `draft` (autosauvegardé) et `published` (publication explicite), une ligne par `(organization_id, slug)`, schéma JSON possédé et versionné, parse tolérant section par section. **Sauvegarder n'est pas publier.** | La maquette distingue exactement deux états et le public ne lira jamais que `published` ; la séparation est structurelle (deux colonnes, deux mutations) et non une option — une autosauvegarde ne peut pas publier par accident. Une table de versions aurait été prématurée. |
| 2026-09-05 | `supabase/config.toml` déclare `verify_jwt` **fonction par fonction**, et un déploiement passe toujours par ce fichier. | Un redéploiement de `public-api` sans lui a remis le défaut `verify_jwt = true` et coupé tous les consommateurs (Iris, Clara, `/api-doc`) le temps d'un redéploiement. Le fichier gouverne le déploiement : il n'est pas de la documentation. |
| 2026-09-08 | **Une clé par application, bornée par abonnement.** Registre `applications`, abonnements `organization_applications` par racine ; une clé plateforme est rattachée à une application et voit les seules collectivités abonnées (`application_scope_ids`). `consumer` devient une clé étrangère, `scopes` un CHECK. Remplace « clé plateforme = toutes les organisations » (2026-07-17). | Onboarder un client exigeait un secret par client et par application, transmis à la main ; ou une clé plateforme dont l'isolation vivait dans le code de chaque application (une application compromise lisait tout). Le périmètre vit désormais au Socle, et l'arrivée d'un client se réduit à cocher ses applications. Rien n'était en production : rupture assumée, racines existantes abonnées à tout par la migration. |
| 2026-09-08 | **Une racine naît équipée** : trigger `provision_root_organization` (rôles de contact, plafond IA par défaut, sous-domaine fourni `<slug>.<zone>`), réglages de plateforme dans `platform_settings`, check-list de mise en service (`root_onboarding_status`) en tête de la page d'un client, catégories et activations accessibles au super administrateur. | Trois pièges silencieux à chaque client (rôles jamais seedés, plafond absent = illimité, SMTP absent à l'invitation) et deux écrans interdits au super administrateur (catégories, activations) obligeaient à du SQL. Le provisioning est idempotent et jamais bloquant : la création de l'organisation reste l'acte principal. |
| 2026-09-08 | **Relais de plateforme en repli** (`PLATFORM_SMTP_*`) pour les seuls courriels d'authentification ; les courriels métier restent sur le relais de la collectivité. Les domaines du portail s'écrivent par le super administrateur seul ; les administrateurs les lisent et voient la cible CNAME. | Poule et œuf : inviter le premier administrateur exigeait un SMTP que seul un administrateur pouvait saisir. Un domaine personnalisé suppose un CNAME chez le client et un enregistrement chez l'hébergeur — un travail de l'éditeur, et l'unicité globale permettait de réserver par erreur le domaine d'un autre client. |
| 2026-10-01 | Les **attributions** d'un organisme (ce qu'il traite) ont leur table (`organization_attributions`) et leur route (`GET /v1/organizations/attributions?tenant_id=`), au lieu d'une colonne d'`organizations` ou d'un champ d'`OrganizationDto`. | Trois textes, trois publics : le descriptif usager est public et absent des services internes, les recommandations aux agents ne vivent que sur la racine. Une colonne aurait alourdi chaque `select("*")` des organisations ; une route « sous-arbre en un appel » est le motif que Clara consomme déjà. |
| 2026-10-02 | **Intégrations partenaires : le Socle configure, l'application exécute.** Catalogue (`integrations`, types en table) séparé de la configuration par racine (`organization_integrations`) ; secrets dans une table illisible par tout client, lus par le service role seul ; le Socle ne fait qu'un test de connexion. Arpège (connecteur Clara) est la première ; Clara continue de lire sa propre table jusqu'à la bascule (lot 2, route public-api). | Clara et Ariane tenaient chacune leur table `organization_integrations`, secrets en clair et lus par le navigateur, sans catalogue. Le Socle est le référentiel : la configuration y vit une fois, et l'exécution reste là où est le métier — réécrire le connecteur au Socle aurait dupliqué un code en service. |
| 2026-09-18 | `CLAUDE.md` devient un **index** : le détail de chaque feature (invariants, pièges, pointeurs de code) part, tel quel, dans une fiche `docs/features/*.md` ; `CLAUDE.md` garde les règles transverses et, par feature, ce qu'il faut savoir avant d'ouvrir la fiche. Un test (`src/claudeMd.test.ts`) le tient sous 40 000 caractères et vérifie que fiches et index se citent. | Chargé en entier à chaque session d'agent, il avait atteint 150 000 caractères, près de quatre fois la limite au-delà de laquelle Claude Code le signale. Une fiche par feature se lit quand on touche la feature — et seulement alors. |

## 7. Risques acceptés & dette

Constats factuels au 2026-08-12, à ne pas masquer :

- **Mot de passe SMTP en clair** (`smtp_settings.password`) — et son écriture est désormais
  ouverte à tout admin d'organisation (`is_org_admin`), pas seulement au super admin : la surface
  s'est élargie sans chiffrement en contrepartie. `pgsodium` est disponible au catalogue Postgres
  mais non installé.
- **Pas de route 404** : `src/App.tsx` n'a pas de route catch-all `*` ; une URL inconnue rend un
  écran vide.
- **`darkMode: ["class"]` déclaré sans palette sombre** : `tailwind.config.ts` l'active, mais
  aucun bloc `.dark` n'existe dans `src/index.css`. Le thème sombre n'est pas réellement supporté.
- **Pas de sélecteur global d'« organisation courante »** : trois mécanismes concurrents
  coexistent — `useMyOrganizationId` (première appartenance, dans `UtilisateursPage`), un
  `<select>` local via `useWritableRootOrganizations` (`ProceduresPage`, `QuartiersPage`), et un
  sélecteur intégré au formulaire (`CategoryFormDialog`, `DocumentTypeFormDialog`). C'est le point
  ouvert le plus structurant côté frontend.
- **`npm run lint` = `tsc -b` seul** : il n'y a ni ESLint ni Prettier configurés dans le projet.

Ajoutés le 2026-09-05 (éditeur du site de démarches) :

- **L'éditeur vit dans le shell** de l'app (barre haute + rail) alors qu'il a son propre shell
  plein écran : deux barres superposées. À sortir du `AppShell` / `SuperAdminLayout`.
- **Ergonomie de la publication** : le bouton de confirmation « Publier » prend le style
  destructif par défaut de l'`AlertDialogAction` (rouge), et la ligne d'état continue de dire
  « brouillon enregistré » après une publication.
- **Les tests de composants ne pilotent pas dnd-kit** (`PointerSensor`) : le glisser-déposer
  n'est couvert qu'à travers sa logique pure (`portalReorder.test.ts`) et le placement de l'ombre
  (`PortalCanvas.test.tsx`) ; le geste lui-même se vérifie à la main.

Ajoutés le 2026-09-23 (audit purge / performance de la gamme, avant mise en production) :

- **Policies RLS réévaluées à chaque ligne.** Aucune policy ne suit le motif
  `(select …)` : elles appellent directement `is_super_admin()`, `has_org_access(organization_id)`,
  `is_org_admin(organization_id)`, et l'advisor `auth_rls_initplan` en relève 4 sur `auth.uid()`
  (`procedures` « read procedures », `users` « read / update own profile »,
  `user_organizations` « read own org memberships »). Aggravant : `has_org_access`,
  `is_org_admin` et `is_super_admin` sont en PL/pgSQL **sans marqueur `STABLE`** (donc
  `VOLATILE`), contrairement à `org_subtree_ids` et `is_admin_of_self_or_ancestor` — le
  planificateur les réexécute par ligne. Le coût croît avec les listes protégées (les écrans
  superadmin sur `ai_usage_events` en premier). Correctif mécanique :
  `alter function … stable` sur les trois (elles ne font que lire), puis réécriture des policies
  en `using ((select public.is_super_admin()))` — table par table, en testant l'accès, une
  policy mal réécrite coupe un écran.
- **50 `multiple_permissive_policies`** (advisor) : un couple « read X » / « write X »
  `FOR ALL` sur la plupart des tables du référentiel (`categories`, `document_types`,
  `procedures`, `portal_*`, `users`, `user_organizations`…) ; les deux sont évaluées à chaque
  SELECT. Scinder la policy d'écriture en `INSERT` / `UPDATE` / `DELETE`.
- **FK sans index** (17, advisor) : les plus sollicitées sont `user_organizations.organization_id`
  (comptage des membres) et `procedures.organization_id` / `category_id`. Faible volume
  aujourd'hui. `organizations.parent_id`, le plus coûteux, est posé
  (`20260923063836_organizations_parent_id_index.sql`).
- **`quartiers` lu à 140 ms en moyenne** (`pg_stat_statements`, 5 lignes) : la géométrie part
  en entier dans le `select *`. À vérifier avant que le nombre de quartiers ne grandisse.
- **Fichiers orphelins des buckets** `document-templates` / `procedure-documents` : le fichier
  part avant la ligne (`useDocumentTemplates.ts`, `useProcedureDocuments.ts`), une modale
  abandonnée laisse un objet. Un seul orphelin au 2026-09-23 (une image retirée d'une base de
  connaissances). Modèle à reprendre le jour venu : l'outbox `storage_deletions` d'Iris ou de
  Clara (trigger AFTER DELETE + edge de drain), et non un DELETE SQL sur `storage.objects`.

## 8. Voir aussi

- [`./data-model.md`](./data-model.md) — tables, contraintes, triggers, RLS, RPC, extensions, storage.
- [`./integration.md`](./integration.md) — guide consommateurs (Ariane/Clara/Iris) : clés, scopes, garanties, compatibilité.
- [`./operations.md`](./operations.md) — déploiement, secrets, migrations, advisors, CI.
- [`./onboarding.md`](./onboarding.md) — mise en service : la plateforme une fois, puis chaque client sans SQL.
- [`../CLAUDE.md`](../CLAUDE.md) — règles de développement transverses et index des features.
- [`./features/`](./features/) — une fiche par feature : invariants, pièges, pointeurs de code.
- [`../README.md`](../README.md) — porte d'entrée du projet.
