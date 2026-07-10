# SOCLE — Modèle de données (Documentation technique)

> **Statut** : Documentation d'analyse du schéma existant.
> **Portée** : Reformulation, relations, points critiques. Aucune modification proposée à ce stade.
> **Dernière mise à jour** : 2026-07-04

---

## 1. Vue d'ensemble

SOCLE est une plateforme SaaS multi-tenant construite sur Supabase/PostgreSQL. Le modèle repose sur :

- une hiérarchie d'**organisations** (tenants) en arbre (`organizations.parent_id`),
- un système de **rôles à deux niveaux** (global vs par-organisation),
- un contenu métier (**procedures**) organisé en **categories**, avec un mécanisme de **template + personnalisation par tenant** (`organization_procedures`).

---

## 2. Tables

### 2.1 `organizations` — Entité tenant, structure arborescente

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid, PK | Identifiant de l'organisation |
| `parent_id` | uuid, self FK | Hiérarchie arborescente (holding → filiale → agence, etc.) |
| `name` | text | Nom affiché |
| `slug` | text | Identifiant lisible, probable usage routing (sous-domaine/URL) |
| `type` | text | Discriminant du rôle dans la hiérarchie (valeurs non contraintes par enum) |
| `metadata` | jsonb | Extension libre |

**Notes** : aucune limite de profondeur ni de cardinalité imposée — arbre générique, pas seulement 2 niveaux.

### 2.2 `users` — Profil métier, distinct de l'auth

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid, PK | = `auth.users.id` (extension métier du user Supabase Auth) |
| `email` | text | |
| `global_role` | enum (`super_admin` \| `admin` \| `consultant`) | Rôle **plateforme**, transversal à toutes les organisations |
| `first_name` | text, nullable | Ajouté le 2026-07-04 (migration `add_user_first_last_name`) |
| `last_name` | text, nullable | Ajouté le 2026-07-04 (migration `add_user_first_last_name`) |

**Notes** : `public.users` porte les données applicatives ; `auth.users` gère les credentials (pattern standard Supabase). Une ligne `public.users` est désormais **provisionnée automatiquement** à l'inscription via un trigger `on_auth_user_created` (migration `provision_public_user_on_signup`) — voir `ARCHITECTURE.md` §1.1. Ce trigger fixe `global_role` : premier utilisateur inscrit → `super_admin`, tous les suivants → `consultant`.

### 2.3 `user_organizations` — Table d'appartenance (rattachement tenant)

| Colonne | Type | Rôle |
|---|---|---|
| `user_id` | FK → `users` | |
| `organization_id` | FK → `organizations` | |
| `role` | enum (`admin` \| `consultant`) | Rôle **local à l'organisation** |

**Notes** : jointure N↔N. C'est la seule table qui matérialise l'accès effectif d'un utilisateur à une organisation donnée, avec un rôle contextuel à cette organisation.

### 2.4 `categories` — Regroupement de procédures

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid, PK | |
| `organization_id` | FK → `organizations` | Scoping tenant |
| `name` | text | |
| `icon` | text | |

**Notes** : pas de hiérarchie propre (pas de `parent_id`), pas d'i18n.

### 2.5 `procedures` — Contenu métier central

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid, PK | |
| `organization_id` | FK → `organizations` | Organisation "auteure"/propriétaire |
| `category_id` | FK → `categories` | |
| `name` | text | |
| `order_index` | int | Ordre d'affichage par défaut |
| `translations` | jsonb | i18n du contenu |
| `keywords` | text[] | Recherche/indexation |
| `agent_description` | text | Description destinée à un agent IA |
| `user_description` | text | Description destinée à l'utilisateur humain |
| `is_active_global` | bool | Interrupteur d'activation au niveau de la procédure elle-même (killswitch global) |

### 2.6 `organization_procedures` — Surcharge / activation par tenant

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid, PK | |
| `organization_id` | FK → `organizations` | Organisation **consommatrice** (active/personnalise) |
| `procedure_id` | FK → `procedures` | |
| `is_enabled` | bool | Activation **locale** au tenant |
| `custom_order` | int | Surcharge de l'ordre d'affichage |
| `custom_name` | text | Surcharge du nom (texte plat, pas de traductions visibles) |
| `metadata` | jsonb | Extension libre |

**Notes** : table de personnalisation d'un contenu "source" par une organisation consommatrice.

### 2.7 `smtp_settings` — Configuration email par organisation

Ajoutée le 2026-07-04 (migration `create_smtp_settings`), sur le modèle de Clara.

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid, PK | |
| `organization_id` | uuid, FK → `organizations`, **UNIQUE**, NOT NULL | Une ligne par organisation (relation 1-1) |
| `host` | text, NOT NULL, défaut `''` | |
| `port` | int, NOT NULL, défaut `587` | |
| `username` | text, NOT NULL, défaut `''` | |
| `password` | text, NOT NULL, défaut `''` | Stocké en clair — voir point critique I ci-dessous |
| `from_email` | text, NOT NULL, défaut `''` | |
| `from_name` | text, NOT NULL, défaut `''` | |
| `use_tls` | bool, NOT NULL, défaut `true` | |
| `created_at`, `updated_at` | timestamptz | `updated_at` maintenu par un trigger `set_updated_at()` |

**Notes** : consommée par les Edge Functions `invite-user`, `auth-email-hook` et `send-test-email` (voir `ARCHITECTURE.md` §1.1) pour envoyer les emails d'invitation et de réinitialisation de mot de passe avec les identifiants SMTP propres à chaque organisation, plutôt qu'un compte SMTP unique pour toute la plateforme.

---

## 3. Relations

```
organizations (self: parent_id → organizations.id)
     │
     ├──< user_organizations >── users (first_name, last_name, global_role)
     │        (role local)
     │
     ├──< categories
     │        │
     │        └──< procedures (via category_id)
     │                 │  (procedures a AUSSI son propre organization_id)
     │                 │
     ├──< organization_procedures >── procedures
     │        (organization_id)         (procedure_id)
     │
     └──1:1── smtp_settings (organization_id UNIQUE)
```

**Points structurants** :

- `organizations.parent_id` : hiérarchie récursive au sein de la même table.
- `user_organizations` : seule table reliant un utilisateur à une organisation — l'accès n'est a priori **pas dérivé automatiquement** de la hiérarchie (pas de propagation visible parent → enfants).
- `procedures` porte **deux chemins** vers la notion d'organisation :
  1. directement via `procedures.organization_id` (organisation propriétaire du contenu) ;
  2. indirectement via `organization_procedures.organization_id` (organisation qui active/consomme le contenu).
  Ce sont potentiellement deux organisations différentes.
- `procedures.category_id` → `categories.organization_id` : un second chemin indirect vers une organisation, sans garantie déclarée de cohérence avec `procedures.organization_id`.

---

## 4. Points critiques identifiés

### A. Double porteur d'`organization_id` sur `procedures` vs `organization_procedures`
Sémantique non formalisée entre :
- `procedures.organization_id` (organisation auteure/propriétaire),
- `organization_procedures.organization_id` (organisation qui active/personnalise).

Hypothèse probable : pattern **template/héritage**, où une organisation "modèle" (potentiellement liée au `parent_id`) définit des procédures que des organisations filles activent via `organization_procedures`. Aucune contrainte visible ne relie `organization_procedures.organization_id` à la hiérarchie de `procedures.organization_id` — ambiguïté centrale à clarifier avant toute implémentation RLS.

**Statut** : **confirmé par l'implémentation RLS existante** — voir `ARCHITECTURE.md` §0.3. La policy `write procedures` autorise l'écriture sur `procedures` à quiconque a `global_role` plateforme (`admin`/`super_admin`), indépendamment de tout rattachement d'organisation : `procedures` est bien un catalogue central géré par le staff SOCLE, `organization_procedures` la couche d'activation locale par tenant.

### B. Cohérence `categories.organization_id` ↔ `procedures.organization_id`
Pas de FK composite garantissant `procedures.organization_id == categories.organization_id` (pour la catégorie référencée via `category_id`). Risque latent de procédure rattachée à une organisation mais catégorisée sous une catégorie d'une autre organisation.

**Statut** : ouvert.

### C. Hiérarchie des organisations et propagation des droits
`organizations.parent_id` établit un arbre, mais `user_organizations` est une table d'appartenance **plate**. Question ouverte : un admin d'une organisation parente a-t-il un accès implicite aux organisations filles, ou l'accès doit-il être explicitement dupliqué ligne par ligne ? Décision d'architecture RLS majeure (policies récursives via CTE vs appartenance stricte).

**Statut** : **répondu par l'implémentation RLS existante** — voir `ARCHITECTURE.md` §0.2. `is_org_admin()` vérifie une ligne exacte dans `user_organizations` ; être admin d'un parent ne donne aujourd'hui aucun droit implicite sur ses enfants. Seul `is_super_admin()` traverse toute la hiérarchie. Une propagation récursive resterait une évolution possible mais n'est pas le comportement actuel.

### D. Double système de rôles (`global_role` vs `user_organizations.role`)
- `global_role` (super_admin/admin/consultant) : hors-tenant.
- `user_organizations.role` (admin/consultant) : par-tenant.

Préséance non explicitée (un `global_role = admin` bypass-t-il les checks `user_organizations` ?). Absence logique de `super_admin` au niveau organisation (rôle présumé transversal). Point de vigilance majeur : c'est typiquement là qu'apparaissent des failles d'isolation tenant (ex. un rôle global outrepassant un contexte organisationnel où il ne devrait avoir aucun droit).

**Statut** : **clarifié par l'implémentation** (voir `ARCHITECTURE.md` §0.3 et §6 « Flux utilisateurs ») — `global_role` gouverne exclusivement le catalogue `procedures` ; `user_organizations.role` gouverne `categories`, `organization_procedures`, l'admission de membres et (depuis le 2026-07-04) la lecture/écriture des profils des membres d'une organisation administrée. Chaque écran/fonctionnalité doit documenter explicitement lequel des deux rôles il consulte — ce n'est plus une ambiguïté du modèle, mais une règle à respecter au cas par cas lors de l'implémentation.

### E. Double interrupteur d'activation (`is_active_global` vs `is_enabled`)
Une procédure peut être désactivée à deux niveaux indépendants :
- `procedures.is_active_global` (killswitch global),
- `organization_procedures.is_enabled` (activation locale).

Logique de composition non déclarée dans le schéma (probable ET logique : active globalement ET activée localement). Règle métier à implémenter en couche applicative ou via vue, non garantie par la structure des données.

**Statut** : ouvert.

### F. Asymétrie i18n entre `translations` et `custom_name`
`procedures.translations` est structuré en jsonb multi-langue. `organization_procedures.custom_name` semble être un texte plat. Si confirmé, la surcharge locale du nom perd la capacité multilingue de la donnée source — incohérence de modélisation entre contenu source et personnalisation.

**Statut** : à vérifier (type exact de `custom_name` non confirmé).

### G. Absence de mécanisme explicite d'isolation tenant (RLS)
Le modèle repose entièrement sur `organization_id` comme discriminant de tenant (`categories`, `procedures`, `organization_procedures`) et sur `user_organizations` pour les droits utilisateur. Aucune contrainte de niveau base ne garantit à elle seule l'étanchéité multi-tenant : à porter entièrement par les policies RLS, en particulier pour les cas hiérarchique (point C) et double appartenance organisationnelle des procédures (point A).

**Statut** : ouvert — bloquant avant écriture des policies RLS.

### H. Unicité de `slug`
Non précisé si `organizations.slug` est unique globalement ou seulement parmi les frères/sœurs d'un même `parent_id`. Impact direct si `slug` sert au routing (sous-domaine, URL publique).

**Statut** : à vérifier.

### I. Mot de passe SMTP stocké en clair (`smtp_settings.password`)
Ajouté le 2026-07-04. La colonne `password` de `smtp_settings` est un `text` en clair, sans chiffrement applicatif ni au repos au-delà du chiffrement disque standard de Postgres. La lecture est restreinte par RLS (`is_org_admin`/`is_super_admin`, voir `ARCHITECTURE.md` §5.1), mais toute fuite de la base (dump, accès direct) exposerait ces identifiants en clair, pour potentiellement plusieurs organisations à la fois.

**Statut** : ouvert — accepté comme premier jet (mirroir exact de Clara) ; à revisiter si un chiffrement applicatif (ex. `pgsodium`, déjà disponible sur le projet, ou chiffrement côté Edge Function) est jugé nécessaire avant mise en production.

---

## 5. Résumé

Le modèle est cohérent pour un SaaS multi-tenant hiérarchique avec un système de contenu "template + personnalisation par tenant" (`procedures` + `organization_procedures`). Les points **A, B, C et D** constituent des zones d'ambiguïté sémantique à trancher explicitement (convention documentée ou contrainte SQL) avant l'écriture des policies RLS, sous peine de failles d'isolation tenant.

---

## 6. Journal des décisions (à compléter au fil des évolutions)

| Date | Point traité | Décision | Justification |
|---|---|---|---|
| 2026-07-04 | Points A, C, D | Statuts mis à jour de « ouvert » à « répondu/confirmé/clarifié par l'implémentation » | L'inspection directe des policies RLS existantes (voir `ARCHITECTURE.md` §0) a répondu à ces trois questions sans qu'un choix de conception nouveau soit nécessaire |
| 2026-07-04 | `users.first_name` / `users.last_name` | Colonnes ajoutées (migration `add_user_first_last_name`) | Support de la création d'utilisateurs avec prénom/nom, sur le modèle de Clara |
| 2026-07-04 | Table `smtp_settings` | Ajoutée (migration `create_smtp_settings`), 1 ligne par organisation | Support d'un serveur SMTP propre à chaque organisation pour les emails d'invitation/réinitialisation, sur le modèle de Clara |
| 2026-07-04 | Point I (mot de passe SMTP en clair) | Accepté tel quel pour l'instant, signalé comme point ouvert | Mirroir volontaire du modèle Clara ; chiffrement applicatif non demandé à ce stade |

