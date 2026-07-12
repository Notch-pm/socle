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

## Stack

- **Vite 5** + **React 18** + **TypeScript** (strict)
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
   `/demarches`, `/categories`, `/utilisateurs`.
2. **Zone super admin** (`SuperAdminLayout`, protégée par `SuperAdminRoute`) — routes
   `/superadmin/*`. Réservée à `global_role = 'super_admin'`.

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

### Modèle de données (principales tables)

- `organizations` — hiérarchie auto-référencée via `parent_id` (voir feature ci-dessous).
- `users`, `user_organizations` (jointure user↔org + `role`).
- `categories`, `procedures`, `organization_procedures` (catalogue de démarches).
- `smtp_settings` (SMTP par organisation).
- `api_keys` (clés de l'API publique en lecture seule, rattachées à une racine — voir feature).

Types TS générés dans `src/types/database.types.ts` — **ne pas éditer à la main**,
régénérer depuis le schéma live (Supabase MCP `generate_typescript_types` / CLI).
Les migrations passent par `apply_migration` (Supabase MCP) ou la CLI.

## Feature : hiérarchie d'organisations

- Arbre auto-référencé (`organizations.parent_id`), **10 niveaux max** (racine + 9),
  imposé par le trigger DB `enforce_org_depth` (bloque aussi les cycles).
- **Super admin** : agit sur toute la plateforme ; seul à créer des **organisations racines**
  et à **supprimer** (uniquement des sous-organisations, jamais une racine).
- **Admin d'organisation** : gère son org **et toute sa descendance** (créer/modifier/rendre
  obsolète), pas de suppression.
- Champs : `name` (obligatoire), `logo_url`, `address`, `phone`, `email`, `status`
  (`active` | `obsolete`, obsolescence **réversible**), + `slug`, `type` hérités.
- RLS `organizations` : SELECT `has_org_access(id) OR is_admin_of_self_or_ancestor(id)` ·
  INSERT super_admin ou (parent défini ET admin d'un ancêtre) · UPDATE admin self/ancêtre ·
  DELETE `is_super_admin() AND parent_id IS NOT NULL`.

### Où est le code

- `src/features/organizations/` — UI **partagée** : `OrganizationTree` (arbre récursif),
  `OrganizationsManager` (conteneur CRUD + dialogues), `OrganizationsPage` (route admin).
- `src/features/superadmin/organizations/` — hooks (`useOrganizationsAdmin.ts` : requêtes,
  mutations, `buildOrgTree`, `MAX_ORG_DEPTH`), `OrganizationFormDialog`, page superadmin,
  et `OrgSettingsPage` (paramétrage par org : infos, sous-orgs, utilisateurs, SMTP…).
- Le même `OrganizationsManager` sert les deux zones : `canManageRoots=false` côté admin,
  `canManageRoots` + `onConfigure` côté superadmin.

### Édition d'organisation en pleine page (app par organisation)

Côté **admin** (`/organisations`), l'action « éditer » ouvre une **page dédiée à onglets**
(`OrganizationEditorPage`, route `organisations/:orgId`) au lieu de la modale — le superadmin
garde sa modale (`OrganizationsManager` reçoit `onEditOrganization` seulement côté admin).

- **Onglet « Informations de base »** (`OrganizationInfoTab`) : formulaire complet
  (nom, parent, logo, adresse, téléphone, courriel, type, slug) enregistré via
  `useUpdateOrganization` + liste des **sous-organisations** (bouton « Éditer » → même page pour
  l'enfant, « Ajouter » via `OrganizationFormDialog`). Inclut aussi, **pour toute organisation
  (sous-orgs comprises)**, un toggle **« Expéditeur spécifique pour les e-mails »** :
  colonnes `organizations.email_sender_override` (bool, défaut false) + `email_sender_name` (text).
  Si activé, on saisit un nom d'expéditeur propre à l'org ; sinon le nom du SMTP racine est utilisé.
  Le nom est **conservé** en base quand on désactive (le flag gouverne l'usage). L'edge function
  `send-test-email` applique ce nom quand `email_sender_override` est vrai. La colonne est
  consommée en aval (Ariane/Clara). Écriture couverte par le RLS UPDATE `organizations`
  (`is_admin_of_self_or_ancestor`).
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
- **Onglet « Emails (SMTP) »** (`rootOnly` — visible **uniquement sur la racine**) : réutilise le
  composant partagé `SmtpSettingsSection` (+ `useSmtpSettings`, edge function `send-test-email`),
  déjà utilisé côté superadmin dans `OrgSettingsPage`. Champs : hôte, port, identifiant, mot de
  passe, e-mail/nom expéditeur, TLS, + envoi d'un **mail de test**. RLS `smtp_settings` : lecture
  `is_org_admin(organization_id)` ; écriture ouverte aux admins d'org via
  `is_org_admin(organization_id)` (migration `smtp_settings_org_admin_write` — l'écriture était
  auparavant réservée au super admin). `send-test-email` autorise via `is_org_admin`.
- Code : `src/features/organizations/` — `OrganizationEditorPage`, `OrganizationInfoTab`,
  `OrganizationProceduresTab`, `useOrganizationProcedures.ts`, `organizationProcedures.ts` (pur,
  testé). Helpers d'arbre purs `findRootAncestor` / `collectDescendantIdsFlat` dans `orgTree.ts`.

## Feature : paramétrage des démarches (`procedures`)

Catalogue des démarches, **multi-tenant strict** : une démarche est rattachée à une
**organisation principale (racine, `parent_id IS NULL`)** — imposé par le trigger DB
`enforce_procedure_root_org`. L'**activation par organisation** (via `organization_procedures`)
est fonctionnelle (voir feature « Édition d'organisation » ci-dessous). Paramétrage par **admin**
(sa principale) et **superadmin** (toutes).

- **Formulaire = stepper horizontal à 5 étapes** (`src/features/procedures/steps.ts`) : Descriptif,
  Informations demandeur, Formulaire, Communication, Base de connaissances. **Descriptif, Informations
  demandeur, Formulaire et Base de connaissances sont fonctionnelles** ; seule Communication reste un
  placeholder. Chaque étape fonctionnelle a un `<form id>` soumis depuis le pied de `ProcedureEditor`
  (`currentFormId`) et persiste via `useUpdateProcedure`. Le pied propose **deux boutons** :
  « Enregistrer » (reste sur l'étape, confirmation « Enregistré ✓ » éphémère) et « Enregistrer et
  continuer » (avance) — dernière étape : « Enregistrer » seul. L'étape courante est **reflétée dans
  `?step=`** (`onStepChange` → `setSearchParams` en `replace`) : position restaurée après rechargement.
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
  `FieldRow`, `ConditionEditor`, `FormPreview`, `FormatsPicker`), `steps/KnowledgeBaseStep` (+
  `steps/connaissances/*` : `MarkdownField`, `LinkListEditor`, `FaqEditor`, `StringListEditor`,
  `DocumentsUploader`, `controls`), `steps/PlaceholderStep`. Stockage des documents :
  `procedureStorage.ts` (logique pure de chemin/validation, testée) + `useProcedureDocuments.ts`
  (upload/suppression/URL signée). Logique pure **testée** : `requesterFields.ts`,
  `formSchema.ts`, `formReorder.ts`, `conditions.ts`, `formats.ts`, `knowledgeBase.ts`,
  `markdown.ts`, `procedureStorage.ts`.
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

## Feature : API publique (lecture seule) — `public-api`

Socle expose son référentiel via une **API REST versionnée en lecture seule** (`GET` uniquement),
**contrat public** consommé en aval (Ariane, Clara, partenaires). C'est une **Edge Function Deno**
`supabase/functions/public-api`, servie sous `{SUPABASE_URL}/functions/v1/public-api/…`, déployée
avec **`verify_jwt = false`** (l'auth est portée par la fonction, pas par la passerelle).

- **Authentification = clé API** en `Authorization: Bearer <clé>`. Table `api_keys` (secret **haché
  SHA-256** dans `key_hash`, jamais en clair ; `key_prefix` affiché pour repérage ; `expires_at`,
  `revoked_at`, `last_used_at`). Une clé est **rattachée à une organisation principale (racine)** —
  trigger `enforce_api_key_root_org` (calqué sur `enforce_procedure_root_org`). RLS `api_keys` =
  `is_super_admin()` pour tout (gestion super admin uniquement).
- **Isolation** : la fonction lit avec la **service role** (hors RLS) mais **restreint chaque requête
  au sous-arbre** de l'org de la clé, via `public.org_subtree_ids(root uuid) returns uuid[]`
  (récursif, `SECURITY INVOKER`, `EXECUTE` révoqué de `anon`/`authenticated`, accordé à
  `service_role`). C'est LE point où vit l'isolation → couvert par tests + vérif bout en bout.
- **Endpoints** (préfixe `/v1`) : `organizations` (+`/{id}`, filtres `status`, `tree=true`),
  `categories`, `procedures` (+`/{id}`, filtres `category_id`, `type`, `enabled_for`),
  `document-types`, `documents/signed-url?path=` (URL signée temporaire, bucket privé
  `procedure-documents`). Docs : `openapi.json` (public) et `docs` (Redoc, cf. ci-dessous).
- **Erreurs** : enveloppe `{ "error": { code, message } }` → `400`/`401`/`403`/`404`/`405`/`500`.
  Ressource hors périmètre = **404** (on ne révèle pas son existence).
- **Sérialisation = whitelist stricte** (`_shared/serializers.ts`) : aucune colonne sensible (SMTP,
  `key_hash`…) ne peut fuir même sur un `select *`. Les JSON possédés (`form_schema`,
  `requester_config`, `knowledge_base`, `translations`, `metadata`) sont **transmis tels quels**.
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
  (**racine uniquement**), à côté de SMTP / catalogue / types de PJ. `ApiKeysSection` (liste +
  révocation via `AlertDialog`) + `ApiKeyFormDialog` (**génération + hachage navigateur** via
  `apiKeys.ts`, secret **affiché une seule fois**) + `useApiKeys.ts` (`useApiKeys`/`useCreateApiKey`/
  `useRevokeApiKey` ; la liste **ne sélectionne pas** `key_hash`). `created_by` = `profile.id`.
- Logique pure **testée** : `_shared/{serializers,scope,errors,openapi}.ts`,
  `superadmin/organizations/apiKeys.ts`.

## Design system

Socle consomme le **Notch / Ariane Design System** (projet Claude Design, partagé avec Ariane et
Clara). Les tokens sont déjà repris dans `src/index.css` + `tailwind.config.ts` (primaire vert
`hsl(153 90% 32%)`, secondaire beurre, sidebar forêt, radius 14px, ombres douces). Construire l'UI
avec les primitives `src/components/ui/*` (Button, Input, Field, Card, Badge, Dialog, AlertDialog)
et les classes de tokens — ce sont les « briques » du DS. Divergence connue : police Socle = Inter,
DS = Nunito Sans (non alignée volontairement pour l'instant).

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
