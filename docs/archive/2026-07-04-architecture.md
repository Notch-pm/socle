> ⚠️ **Instantané historique (2026-07-04) — non maintenu.** Ce document est archivé tel quel :
> plusieurs de ses affirmations sont devenues fausses (modèle de droits, catalogue de démarches,
> écrans). L'état actuel est décrit dans [README.md](../../README.md) et [docs/](../).

# SOCLE — Architecture système (staff engineer)

> **Statut** : Architecture produit/système construite AUTOUR du schéma existant.
> **Aucune modification de schéma, aucune migration proposée.** Ce document
> analyse l'état réel de la base Supabase (projet `Socle`, `qhrokbkyxgcvkbpmbmna`)
> et bâtit l'architecture applicative dessus.
> **Documents liés** : `DATA_MODEL.md` (modèle de données), `UI_ARCHITECTURE.md`
> (navigation).
> **Dernière mise à jour** : 2026-07-04

---

## 0. Ce que l'inspection de la base a révélé

Avant toute proposition, le projet Supabase `Socle` a été inspecté directement
(`list_tables`, `list_extensions`, `pg_policies`, définitions de fonctions,
`get_advisors`). Trois faits changent la donne par rapport à une architecture
théorique et **doivent piloter toutes les décisions qui suivent** :

1. **RLS est déjà activé sur les 6 tables**, avec un jeu de policies et 3
   fonctions helper déjà en place : `is_super_admin()`, `is_org_admin(org_id)`,
   `has_org_access(org_id)`. Le modèle de sécurité existe — ce document
   l'analyse et construit dessus, il n'en invente pas un nouveau.
2. **Ce modèle existant répond déjà** à un point resté ouvert dans
   `DATA_MODEL.md` (§4.C — la hiérarchie propage-t-elle les droits ?) :
   **non**. `is_org_admin` vérifie une ligne `user_organizations` exacte pour
   l'`org_id` demandé — être admin d'une organisation parente ne donne
   aujourd'hui **aucun** droit sur ses enfants. Seul `is_super_admin()` traverse
   toute la hiérarchie.
3. **Un jeu de policies confirme l'hypothèse de `DATA_MODEL.md` §4.A**
   (modèle « catalogue central + activation locale ») : la policy `write
   procedures` autorise l'écriture sur `procedures` à quiconque a
   `users.global_role IN ('admin','super_admin')` — un rôle **plateforme**,
   pas un rôle par organisation. Cela confirme que `procedures` est pensée
   comme un catalogue géré par le staff SOCLE, et `organization_procedures`
   comme la couche d'activation/personnalisation par tenant.

**Cinq lacunes concrètes ont été identifiées puis corrigées** (2026-07-04, voir
§5 et le journal des décisions) via une migration additive
(`fix_rls_gaps_org_admin_visibility_and_scoping`) — aucune table modifiée,
uniquement des policies RLS ajoutées/resserrées et un `REVOKE EXECUTE` :

- Un admin d'organisation ne pouvait **pas lister les membres de sa propre
  organisation** (policy `user_organizations` SELECT restreinte à
  `user_id = auth.uid()`) → **corrigé**.
- La policy UPDATE sur `organizations` autorisait **tout membre** (pas
  seulement un admin) à modifier nom/slug/type/`parent_id` → **corrigé**.
- La création d'organisation ne vérifiait pas que le `parent_id` fourni
  appartient à l'admin qui la crée → **corrigé**.
- La lecture de `procedures` était scopée au seul propriétaire
  (`organization_id`) — une organisation activant une démarche via
  `organization_procedures` sans être membre de l'organisation propriétaire
  ne pouvait pas relire le contenu de la démarche → **corrigé**.
- `rls_auto_enable()` était exécutable via RPC public (`anon`/`authenticated`)
  → **corrigé** (`REVOKE EXECUTE`).

---

## 1. Architecture globale du système

```
┌─────────────────────────────────────────────────────────────────┐
│  Client web (SPA)                                                │
│  - supabase-js (Auth + PostgREST + Realtime)                     │
│  - Aucune logique d'autorisation côté client (RLS = seule source)│
└───────────────┬───────────────────────────────┬─────────────────┘
                │ JWT (auth.uid(), rôle)         │
                ▼                                ▼
   ┌─────────────────────────┐      ┌──────────────────────────┐
   │ Supabase Auth            │      │ Edge Functions (Deno)     │
   │ (émission JWT)            │      │ - orchestration transacti-│
   └───────────┬───────────────┘      │   onnelle multi-tables    │
               │                      │ - appel LLM (assistant IA)│
               ▼                      │ - service_role si besoin  │
   ┌─────────────────────────────┐    │   de bypass RLS contrôlé  │
   │ PostgREST                    │◄───┘                          │
   │ (API REST auto-générée)      │                                │
   │ RLS appliqué à CHAQUE requête│                                │
   └───────────┬──────────────────┘                                │
               ▼                                                   │
   ┌─────────────────────────────────────────────────────────┐     │
   │ PostgreSQL                                                 │◄───┘
   │ organizations · users · user_organizations                │
   │ categories · procedures · organization_procedures          │
   │ + smtp_settings (2026-07-04, 1 ligne / organisation)       │
   │ + fonctions RLS existantes (is_org_admin, has_org_access…) │
   │ + (futur, additif) table(s) d'embeddings + extension vector│
   └─────────────────────────────────────────────────────────┘
```

### 1.1 Edge Functions en place (2026-07-04)

Trois Edge Functions sont déployées, toutes construites sur le modèle de Clara
(`invite-user`, `auth-email-hook`, `send-test-email` existent dans
`clara-mailflow-hub/supabase/functions`) et adaptées au schéma SOCLE :

| Fonction | `verify_jwt` | Déclenchée par | Rôle |
|---|---|---|---|
| `invite-user` | `true` | Le frontend (admin d'organisation ou super_admin, via `supabase.functions.invoke`) | Crée le compte auth (sans email Supabase par défaut), remplit `first_name`/`last_name`, rattache à l'organisation (`user_organizations`), génère un lien d'invitation et envoie un email personnalisé via le SMTP **de l'organisation concernée** (`smtp_settings`) |
| `auth-email-hook` | **`false`** | Le mécanisme "Send Email" hook de Supabase Auth (requête HTTP signée, pas un JWT utilisateur) | Intercepte tous les emails Auth standards (recovery, invite, signup, magiclink, email_change, reauthentication) et les envoie avec le même template, via le SMTP de l'organisation de l'utilisateur (retrouvée par sa première ligne `user_organizations`) |
| `send-test-email` | `true` | Le frontend (bouton "Envoyer un mail de test" de l'écran SMTP) | Envoie un email de test via la config SMTP d'une organisation, pour valider les identifiants saisis |

**Point critique sur `verify_jwt: false`** : `auth-email-hook` doit impérativement
être déployée avec `verify_jwt: false` — elle est appelée par le hook Supabase
Auth via une requête signée (headers Standard Webhooks `webhook-id`/
`webhook-timestamp`/`webhook-signature`), **pas** avec un `Authorization: Bearer
<jwt>`. Avec `verify_jwt: true` (le défaut), la passerelle Supabase rejetterait
la requête avant même que le code de la fonction s'exécute.

**Autorisation** : `invite-user` et `send-test-email` ne dupliquent pas la
logique d'autorisation en JS — elles appellent `is_org_admin(org_id)` via RPC
avec un client Supabase authentifié comme l'appelant (JWT transmis), donc la
règle vit à un seul endroit (la base), pas recopiée dans chaque fonction.
`auth-email-hook` n'a pas de notion d'appelant (c'est Supabase Auth lui-même
qui l'invoque) — sa seule barrière est la vérification de signature.

**Dépendances externes à configurer** (hors base de données, non gérables via
les outils MCP Supabase disponibles — voir échange du 2026-07-04 sur les
outils manquants) :
- Secrets de fonction `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD`/
  `SMTP_FROM_EMAIL`/`SMTP_FROM_NAME` — **obsolètes depuis l'ajout de
  `smtp_settings`** : ces secrets globaux ne sont plus lus par le code actuel,
  qui va chercher la configuration par organisation. Ils peuvent être
  supprimés s'ils avaient été configurés lors d'une itération précédente.
- Secret de fonction `AUTH_HOOK_SECRET` sur `auth-email-hook`, valeur générée
  par Dashboard → Authentication → Hooks → Send Email hook (type **HTTPS**,
  pas Postgres/SQL — voir justification dans l'échange du 2026-07-04).
- Dashboard → Authentication → URL Configuration → Redirect URLs doit inclure
  l'origine de l'app (`/activer-compte`, `/reinitialiser-mot-de-passe`).

**Principe directeur** : PostgREST + RLS couvre 100 % du CRUD standard
multi-tenant nativement — **aucun backend applicatif custom n'est nécessaire**
pour les 6 tables existantes. Les Edge Functions n'interviennent que là où
PostgREST ne suffit pas :
- opérations transactionnelles multi-tables (ex. créer une organisation *et*
  y rattacher automatiquement le créateur comme admin en une seule opération
  atomique) ;
- tout appel à un service externe (futur assistant IA / LLM) ;
- toute lecture qui nécessite de contourner délibérément et ponctuellement
  RLS via `service_role`, uniquement côté serveur, jamais exposée au client.

Aucun serveur d'API intermédiaire (Express/NestJS/etc.) n'est introduit — cela
respecte la contrainte de « compatibilité API Supabase native » et évite toute
duplication du modèle de données dans une couche ORM parallèle.

---

## 2. Consommation de Supabase par le frontend

- **Client unique** `supabase-js`, session JWT via Supabase Auth. Le frontend
  ne fait *aucune* vérification de rôle pour décider si une écriture est
  autorisée — il peut masquer des boutons pour l'UX, mais l'autorisation
  réelle est intégralement déléguée à RLS. Une requête refusée par RLS doit
  être gérée comme un cas d'erreur standard (403/empty result), jamais
  pré-empêchée par une logique dupliquée côté client.
- **Types générés automatiquement** depuis le schéma réel (`supabase gen
  types typescript`) — zéro modèle de données réécrit à la main côté
  frontend, conformément à la contrainte « zéro duplication inutile ».
  Toute évolution de schéma se propage aux types sans intervention manuelle.
- **Lecture imbriquée native PostgREST** (`select=*,categories(*),procedures(*)`)
  pour limiter les allers-retours — mais à borner par les lacunes RLS
  identifiées en §0/§5 (ex. l'embedding `organization_procedures → procedures`
  ne fonctionnera pas pour un membre d'une organisation non-propriétaire tant
  que ce point n'est pas arbitré).
- **RPC (`supabase.rpc(...)`)** réservé aux besoins que RLS pure ne peut pas
  exprimer proprement : résolution de la chaîne d'ancêtres pour le fil
  d'Ariane de l'arborescence, liste des membres d'une organisation pour un
  org-admin (une fois la lacune §0 arbitrée). Ces fonctions seraient de
  nouveaux objets additifs (fonctions `SECURITY DEFINER` bornées), pas des
  modifications de table.
- **Cache de requêtes** côté client (TanStack Query ou équivalent) au-dessus
  de `supabase-js` — pattern standard, indépendant du framework choisi.
- **Realtime** (nativement disponible) : optionnel pour refléter en direct les
  bascules `organization_procedures.is_enabled` entre sessions admin
  concurrentes — à activer à la demande, aucun changement de schéma requis
  (Realtime s'appuie sur la réplication logique déjà native à Postgres).

---

## 3. Structuration des modules applicatifs

Alignée sur les 5 domaines fonctionnels de `UI_ARCHITECTURE.md`, chaque module
frontend encapsule ses propres hooks de requête construits sur les types
générés — aucune ré-modélisation :

```
src/
├── auth/                     Login, session, Mon profil
├── organizations/            Arbre, détail, création — table `organizations`
├── categories/                Liste, édition — table `categories`
├── procedures/                 Catalogue (vue "global_role admin/super_admin")
│                                — table `procedures`
├── organization-procedures/    Activation/personnalisation par tenant
│                                — table `organization_procedures`
│                                (module distinct de `procedures/` car régi
│                                par un modèle d'autorisation différent :
│                                is_org_admin vs global_role)
├── users-roles/                Utilisateurs & rôles — tables `users` +
│                                `user_organizations` (⚠ dépend de l'arbitrage
│                                de la lacune §0 avant implémentation)
├── settings/                   Paramètres globaux
├── assistant/ (futur)          Client du futur module RAG — consomme une
│                                Edge Function, jamais d'accès direct DB
└── shared/
    ├── ui/                     Composants du design system (§5 UI_ARCHITECTURE.md)
    └── data/                   Client supabase-js, types générés, wrappers RPC
```

**Séparation `procedures/` vs `organization-procedures/` délibérée** : elle
reflète une frontière d'autorisation réelle et déjà en place dans la base
(rôle plateforme vs rôle par organisation), pas une préférence stylistique —
les mélanger dans un seul module masquerait cette distinction de sécurité aux
développeurs futurs.

---

## 4. Stratégie multi-tenant basée sur les tables existantes

- **Le tenant, c'est une ligne `organizations`** — n'importe quel nœud de
  l'arbre, pas seulement une racine. Le rattachement (`user_organizations`)
  se fait nœud par nœud.
- **La hiérarchie (`parent_id`) est aujourd'hui un objet d'affichage/
  organisation, pas un mécanisme de sécurité** (confirmé §0.2) : le rail de
  navigation peut présenter un arbre visuel, mais les droits réels restent
  déterminés ligne par ligne dans `user_organizations`, sauf pour
  `super_admin` qui traverse tout. **Décision produit à trancher** (voir
  §5/§6) : garder ce modèle plat (chaque organisation doit recevoir ses
  propres rattachements admin explicitement) ou introduire plus tard une
  vérification récursive (CTE remontant/descendant `parent_id`). Ne pas
  supposer l'un ou l'autre silencieusement dans l'UI.
- **RLS est l'unique frontière d'isolation** — pas de tenant_id dans un
  header custom, pas de schéma par tenant, pas de base par tenant. Le
  sélecteur d'organisation du header (`UI_ARCHITECTURE.md` §1.2) est un
  confort de navigation, jamais une frontière de sécurité : même si le
  client envoyait un `organization_id` falsifié, RLS refuserait toute donnée
  hors périmètre.
- **Deux niveaux de rôle coexistent et gouvernent des périmètres différents**
  (confirmé §0.3) : `users.global_role` (plateforme, transverse) gouverne le
  catalogue `procedures` ; `user_organizations.role` (par organisation)
  gouverne `categories`, `organization_procedures`, et l'admission de
  membres. Tout développeur doit vérifier *lequel* des deux rôles une
  fonctionnalité donnée consulte avant de coder une vérification côté client.

---

## 5. Modèle de sécurité (RLS — état réel, conceptuel)

### 5.1 Ce qui est en place et solide

| Table | Lecture | Écriture |
|---|---|---|
| `categories` | Membre de l'organisation (`has_org_access`) | Admin de l'organisation (`is_org_admin`) |
| `organization_procedures` | Membre de l'organisation | Admin de l'organisation |
| `organizations` (DELETE) | — | `super_admin` uniquement |
| `procedures` (INSERT/UPDATE/DELETE granulaires) | — | Admin de l'organisation propriétaire OU `super_admin` |
| `procedures` (ALL, policy `write procedures`) | — | `global_role` plateforme (`admin`/`super_admin`) — **catalogue central** |
| `users` / `user_organizations` (propre profil) | Soi-même | Soi-même |
| `smtp_settings` (ajoutée 2026-07-04) | Admin de l'organisation ou super_admin (`is_org_admin`) | `super_admin` uniquement — identifiants SMTP (dont un mot de passe en clair, voir `DATA_MODEL.md` point I) traités comme configuration plateforme, non délégués aux admins d'organisation |

### 5.2 Lacunes — état : corrigées (2026-07-04)

Migration appliquée : `fix_rls_gaps_org_admin_visibility_and_scoping`
(additive uniquement — nouvelles policies + resserrement de 2 policies
existantes + un `REVOKE EXECUTE`, aucune table touchée).

| # | Table / policy | Avant | Après |
|---|---|---|---|
| 1 | `user_organizations` SELECT | Restreinte à `user_id = auth.uid()` — un admin ne voyait pas les membres de sa propre organisation | + policy `org admins can read org memberships` : `is_org_admin(organization_id)` |
| 2 | `users` SELECT | Restreinte à `id = auth.uid()` — impossible de résoudre `user_id` → email/nom pour un org-admin | + policy `org admins can read member profiles` : lisible si la cible partage une organisation administrée par l'appelant |
| 3 | `organizations` UPDATE (`update org`) | `has_org_access(id)` — tout membre (y compris consultant) pouvait modifier l'organisation | `is_org_admin(id)` — seul un admin (ou super_admin) peut modifier |
| 4 | `organizations` INSERT (`create org`) | Vérifiait juste « admin de *n'importe quelle* organisation » | Si `parent_id` fourni : exige `is_org_admin(parent_id)`. Si `parent_id` NULL (création racine) : comportement inchangé |
| 5 | `procedures` SELECT | Scopée au propriétaire (`procedures.organization_id`) — une organisation activant une démarche ne pouvait pas en relire le contenu | + policy `read procedures via activation` : lisible si `has_org_access` sur une organisation liée via `organization_procedures` |
| — | `rls_auto_enable()` | Exécutable via RPC public (`anon`/`authenticated`) | `REVOKE EXECUTE` sur `public`/`anon`/`authenticated` |

**Vérifié post-migration** : `get_advisors(security)` ne remonte plus les deux
warnings liés à `rls_auto_enable`. Restent 3 warnings pré-existants et non
liés à ces 5 points — `function_search_path_mutable` sur `is_org_admin`,
`is_super_admin`, `has_org_access` (les fonctions n'ont pas de `search_path`
figé). Non corrigé dans cette passe (hors périmètre de la demande), à traiter
séparément si souhaité — fix mineur (`SET search_path = ''` ou équivalent sur
chaque fonction).

**Note sur le point #4** : la création d'organisation racine (`parent_id`
NULL) reste ouverte à « tout admin d'une organisation, n'importe laquelle » —
ce comportement pré-existant n'était pas signalé comme une lacune et n'a donc
pas été modifié. À arbitrer séparément si vous voulez restreindre la création
de nouvelles organisations racines au seul `super_admin`.

### 5.3 Point d'hygiène mineur

La fonction `rls_auto_enable()` (event trigger `SECURITY DEFINER` qui active
RLS automatiquement sur toute nouvelle table — bonne pratique en place, voir
§7) est actuellement exécutable via RPC public (`anon`/`authenticated`)
d'après l'advisor de sécurité. L'appeler hors contexte de trigger DDL échoue
nativement, donc le risque réel est faible, mais un `REVOKE EXECUTE` sur les
rôles `anon`/`authenticated` serait une hygiène simple à appliquer
séparément.

---

## 6. Flux utilisateurs

### Architecture de routage réellement implémentée (2026-07-04)

Contrairement à l'hypothèse initiale de `UI_ARCHITECTURE.md` (un seul AppShell
partagé avec sélecteur d'organisation pour tous les rôles), l'exploration du
code réel de Clara (`SuperAdminLayout`, `SuperAdminSidebar`, `SuperAdminRoute`)
a montré que Clara sépare **complètement** l'espace super-admin de l'espace
régulier — pattern repris à l'identique pour SOCLE :

- Un `super_admin` est **automatiquement redirigé** vers `/superadmin` à la
  connexion et **ne peut jamais accéder** aux routes régulières (`ProtectedRoute`
  redirige vers `/superadmin` si `profile.global_role === 'super_admin'`).
- `/superadmin/*` est gardé par `SuperAdminRoute`, qui redirige vers `/` tout
  utilisateur dont `global_role !== 'super_admin'`.
- Les deux espaces ont des shells (Header/Sidebar) et des menus **distincts** —
  voir `UI_ARCHITECTURE.md` pour le détail. Le sélecteur d'organisation dans le
  header régulier (point ouvert #1 de `UI_ARCHITECTURE.md`) n'a donc plus de
  raison d'être pour un super_admin ; il concerne uniquement le compte régulier
  (admin/consultant), et n'est toujours pas implémenté (voir §UI_ARCHITECTURE.md).

### Super admin (`users.global_role = 'super_admin'`)
`is_super_admin()` court-circuite toutes les autres vérifications. Voit et
gère l'intégralité de l'arbre d'organisations, le catalogue de démarches, tous
les utilisateurs, depuis l'espace `/superadmin` dédié décrit ci-dessus.

### Admin de plateforme (`users.global_role = 'admin'`)
Rôle transverse distinct d'un rattachement à une organisation précise. D'après
la policy `write procedures`, ce rôle gouverne le **catalogue central de
démarches** (créer/modifier/supprimer des `procedures`, indépendamment de
l'organisation propriétaire). Ne donne en revanche aucun droit automatique
sur `organizations`, `categories` ou `organization_procedures` d'une
organisation à laquelle il n'est pas rattaché.

### Admin d'organisation (`user_organizations.role = 'admin'` pour l'org X)
Scopé strictement à l'org X (pas de cascade vers ses enfants, §0.2). Peut :
gérer les catégories de X, activer/personnaliser des démarches pour X
(`organization_procedures`), ajouter/retirer des membres de X. Ne peut *pas*
aujourd'hui lister les membres existants de X (lacune §5.2 #1) ni modifier le
catalogue `procedures` sauf s'il a *aussi* `global_role = 'admin'`.

### Consultant (`user_organizations.role = 'consultant'` pour l'org X)
Lecture seule sur X : catégories, démarches activées. Aucune écriture nulle
part. Le masquage des actions d'écriture côté UI est un confort — RLS
refuserait de toute façon la moindre tentative d'écriture.

---

## 7. Stratégie d'évolution sans migration lourde

- **`rls_auto_enable()` est déjà un filet de sécurité pour l'avenir** : toute
  nouvelle table créée dans `public` reçoit RLS activé automatiquement par un
  event trigger existant. Les policies restent à écrire à chaque fois, mais
  l'oubli d'activer RLS lui-même est déjà structurellement exclu.
- **Les colonnes `metadata` (jsonb) sont la soupape d'extension désignée** —
  `organizations.metadata`, `organization_procedures.metadata`. Tout besoin de
  configuration additionnelle doit d'abord être évalué contre ces colonnes
  avant d'envisager une nouvelle colonne ou table, conformément à la
  contrainte « zéro duplication ».
- **RAG (futur assistant IA) — chemin additif uniquement** : l'extension
  `vector` (pgvector 0.8.2) est disponible sur ce projet mais **non installée**
  — son activation et l'ajout d'une table dédiée (type `procedure_embeddings`,
  référençant `procedures.id` par clé étrangère) sont des ajouts purs, sans
  aucune altération des tables existantes. `pg_net`/`pg_cron` (disponibles,
  non installés) permettraient plus tard d'orchestrer un rafraîchissement
  périodique des embeddings si le pipeline le nécessite — l'orchestration
  LLM elle-même reste préférable en Edge Function plutôt qu'en base.
- **Historique de migrations désormais tracké** (mise à jour 2026-07-04) : le
  schéma initial (6 tables) avait été construit hors du système de migration
  Supabase (`list_migrations` vide au départ). Depuis, chaque évolution est
  passée par `apply_migration`, ce qui constitue le premier historique
  reproductible du projet :
  1. `fix_rls_gaps_org_admin_visibility_and_scoping` — 5 correctifs RLS + hygiène `rls_auto_enable`
  2. `provision_public_user_on_signup` — trigger `on_auth_user_created`
  3. `add_user_first_last_name` — colonnes `users.first_name`/`last_name`
  4. `allow_org_admins_update_member_profiles` — policy UPDATE manquante sur `users`
  5. `create_smtp_settings` — table `smtp_settings` + RLS + trigger `updated_at`

  À poursuivre : toute évolution future doit passer par ce même mécanisme,
  jamais par une modification manuelle non tracée.
- **Dette de performance identifiée, toujours ouverte** (non traitée dans les
  passes ci-dessus, hors périmètre des demandes traitées jusqu'ici) :
  plusieurs clés étrangères ne sont pas indexées (`organizations.parent_id`,
  `procedures.organization_id`/`category_id`, `organization_procedures.
  procedure_id`, `user_organizations.organization_id`, `categories.
  organization_id`) et plusieurs policies ré-évaluent `auth.uid()` par ligne
  plutôt qu'une fois par requête. Ce sont des ajouts (`CREATE INDEX`,
  réécriture mineure de policies) sans impact sur la forme du schéma — à
  traiter par petites passes indépendantes, jamais comme un gros chantier de
  migration. `smtp_settings.organization_id` n'a pas cette dette : la
  contrainte `UNIQUE` y crée déjà un index automatiquement.

---

## Journal des décisions

| Date | Point traité | Décision | Justification |
|---|---|---|---|
| 2026-07-04 | Lacunes RLS §5.2 (#1–#5) + hygiène `rls_auto_enable` | Corrigées via migration `fix_rls_gaps_org_admin_visibility_and_scoping` (policies additives/resserrées, aucune table modifiée) | Demande explicite utilisateur ; bloquait l'écran *Utilisateurs & rôles* et le modèle catalogue/activation de `UI_ARCHITECTURE.md` |
| 2026-07-04 | Création d'organisation racine (`parent_id` NULL) | Non modifiée — reste ouverte à tout admin d'organisation | Non signalée comme lacune ; à arbitrer séparément si restriction souhaitée |
| 2026-07-04 | `function_search_path_mutable` (3 fonctions helper) | Non corrigé | Hors périmètre de la demande ; warning pré-existant, non bloquant |
| 2026-07-04 | `users` UPDATE — un admin d'organisation ne pouvait pas modifier le prénom/nom d'un membre (seule une policy SELECT existait pour les profils des membres) | Corrigé — nouvelle policy `org admins can update member profiles`, miroir exact de la policy SELECT équivalente | Découvert en testant l'écran Utilisateurs & rôles (édition) : la mise à jour échouait silencieusement (0 ligne affectée sous RLS, aucune erreur levée) |
| 2026-07-04 | Colonnes `users.first_name` / `users.last_name` | Ajoutées (migration additive, aucune table existante modifiée en profondeur) | Demande explicite : création d'utilisateurs avec prénom/nom, sur le modèle de Clara |
| 2026-07-04 | Architecture de routage super-admin | Espace `/superadmin` complètement séparé (layout, sidebar, redirection automatique) plutôt qu'un AppShell unique avec menu conditionnel | Découvert en explorant le code réel de Clara (`SuperAdminLayout`/`SuperAdminRoute`) ; « les menus sont différents » — demande explicite de l'utilisateur |
| 2026-07-04 | Table `smtp_settings` + 3 Edge Functions (`invite-user`, `auth-email-hook`, `send-test-email`) | SMTP configurable par organisation plutôt qu'un compte SMTP global ; secrets de fonction globaux devenus obsolètes | Demande explicite, sur le modèle de Clara (`smtp_settings`, composant `SmtpSettings`) |
| 2026-07-04 | Écriture sur `smtp_settings` | Restreinte à `super_admin` uniquement (lecture ouverte aux admins d'organisation) | Reproduit le choix de sécurité de Clara — identifiants SMTP (dont mot de passe en clair) traités comme configuration plateforme |
| 2026-07-04 | Hook Supabase Auth "Send Email" | Configuré en HTTPS (pas Postgres/SQL) pointant vers `auth-email-hook`, déployée avec `verify_jwt: false` | Vérifié dans la doc officielle Supabase ; le type Postgres/SQL sert des cas d'usage différents (mise en file d'attente via `pg_cron`), pas l'envoi direct |
