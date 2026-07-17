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
- `smtp_settings` (SMTP par organisation).
- `api_keys` (clés de l'API publique en lecture seule, rattachées à une racine — voir feature).
- `contacts`, `contact_roles`, `contact_role_assignments`, `contact_external_references`
  (référentiel des usagers — voir feature).
- `quartiers` (découpage du territoire par racine, polygones PostGIS — voir feature).

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
  `document-types`, `quartiers` (option `geometry=true` → polygones **GeoJSON** via la RPC
  `list_quartiers_geojson` ; sans elle, aucune géométrie — la colonne `geom` binaire n'est
  jamais exposée), `documents/signed-url?path=` (URL signée temporaire, bucket privé
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
  (colonne `scopes` ; les clés `read` → 403 : les usagers sont des données personnelles). Les
  scopes se choisissent à la création de clé (`ApiKeyFormDialog`, switches « Référentiel
  (lecture) » / « Usagers (lecture + écriture) ») et s'affichent en badges (`ApiKeysSection`).
- **Isolation** : service role (hors RLS) mais chaque requête bornée par
  `organization_id = organisation (racine) de la clé` — égalité stricte, pas de sous-arbre (les
  contacts sont rattachés aux racines). **Vérifiée bout en bout** (2026-07-15, 32 assertions :
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
  La fiche expose `address_lat`, `address_lon`, `quartier_id`, `quartier_auto`.
- **Payloads** : whitelist stricte des clés (clé inconnue → 400), chaînes normalisées (trim,
  `""`→`null`), invariants par type vérifiés sur l'**état fusionné** au PATCH (messages français ;
  les CHECK DB restent le garde-fou). `role_ids` / `external_references` fournis **remplacent**
  l'ensemble (omis = intouchés ; remplacement par différence/upsert, pas de delete-all). Création :
  compensation (delete) si rôles/refs échouent après l'insert. Erreurs `{error:{code,message}}`
  + **409 `conflict`** (SIRET dupliqué, réf externe prise — mappage des contraintes 23505).
- ⚠️ `internal_notes` **est exposée** (API serveur-à-serveur pour les apps agents) : un
  consommateur servant des usagers finaux ne doit jamais la retransmettre — documenté dans l'OpenAPI.
- **Docs** : `/api-doc-usagers` (route publique, `ApiDocsPage api="contacts-api"` — Redoc pointé
  sur `…/contacts-api/openapi.json`) ; liens depuis la section « APIs de la gamme » de
  `OrgSettingsPage`.
- Code : `supabase/functions/contacts-api/` — `index.ts` + `_shared/{dto,errors,validation,
  serializers,openapi}.ts` (logique pure **testée** par vitest, sans dépendance Deno, déployée avec
  la fonction). Le déploiement (`deploy_edge_function`) doit inclure `index.ts` + tout `_shared/*.ts`.

## Feature : quartiers (découpage du territoire)

Portage de la fonctionnalité quartiers de Clara (instantané dans `references/clara-quartiers/`),
décidé quand Clara a délégué ses usagers au Socle. **Multi-tenant strict** : un quartier est
rattaché à une **organisation principale (racine)** — trigger `enforce_quartier_root_org` (motif
habituel). Livré : modèle DB + UI Socle + **exposition API** (catalogue dans `public-api`,
géocodage/rattachement dans `contacts-api` — voir les deux features API). Reste : la
consommation côté Clara (filtre + stats via l'API) ; les **stats par quartier** ne sont pas
encore exposées par l'API (RPC `stats_contacts_by_quartier` disponible).

- **`quartiers`** : `name` (unique par org, insensible à la casse — index
  `quartiers_org_name_unique`), `color`, `geom geometry(MultiPolygon, 4326)` (**PostGIS**,
  extension installée dans le schéma `extensions` ; index GIST). Pas de dessin dans l'app :
  **import GeoJSON uniquement** (`ST_MakeValid` répare les polygones auto-intersectants).
  RLS : SELECT `has_org_access` · écriture (ALL) `is_org_admin` — table modifiable côté
  client, comme `contact_roles`.
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
  d'écriture client ; garde interne `is_org_admin(p_org_id)` ou service_role).
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
- Migrations : `quartiers_referentiel`, `assign_contact_quartier_recompute_on_null`. Vérifié de
  bout en bout (2026-07-17) : test SQL transactionnel annulé (assignation auto, dédoublonnage,
  invariants tenant/racine), parcours navigateur complet (import → stats → recalcul → renommage →
  suppression), et parcours API réel (géocodage BAN d'une adresse → quartier assigné, filtre,
  re-géocodage au changement d'adresse, manuel/auto, 400 sur paire de coordonnées incomplète et
  quartier inconnu).

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
