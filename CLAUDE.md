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

## Feature : paramétrage des démarches (`procedures`)

Catalogue des démarches, **multi-tenant strict** : une démarche est rattachée à une
**organisation principale (racine, `parent_id IS NULL`)** — imposé par le trigger DB
`enforce_procedure_root_org`. L'activation par sous-organisation (via `organization_procedures`)
viendra plus tard. Paramétrage par **admin** (sa principale) et **superadmin** (toutes).

- **Formulaire = stepper horizontal à 5 étapes** (`src/features/procedures/steps.ts`) : Descriptif,
  Informations demandeur, Formulaire, Communication, Base de connaissances. **Descriptif, Informations
  demandeur, Formulaire et Base de connaissances sont fonctionnelles** ; seule Communication reste un
  placeholder. Chaque étape fonctionnelle a un `<form id>` soumis depuis le pied de `ProcedureEditor`
  (`currentFormId`) et persiste via `useUpdateProcedure`.
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
  champs par **palette** (glisser-déposer positionné, ou clic → ajout à la fin).
- **Base de connaissances** → colonne `procedures.knowledge_base` (JSONB) : informations à destination
  de **l'agent et de son assistant LLM**, schéma **possédé** (contrat consommé en aval). Champs : texte
  d'aide agent & procédures (**Markdown**, aperçu via `markdown.ts` — rendu HTML échappé, aucune
  dépendance), liens utiles agent + sources IA (`{url, description}`), FAQ (`{question, answer}`),
  garde-fous (liste). Deux jeux de **documents** (aide agent PDF/image ; entraînement IA formats
  étendus) : sections **placeholder « à venir »** — l'upload attend un bucket Supabase (le schéma
  réserve déjà `agentDocuments`/`trainingDocuments`). Logique pure + parseur robuste `knowledgeBase.ts`
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
  `DeferredDocuments`, `controls`), `steps/PlaceholderStep`. Logique pure **testée** : `requesterFields.ts`,
  `formSchema.ts`, `conditions.ts`, `formats.ts`, `knowledgeBase.ts`, `markdown.ts`. Superadmin : section
  « Catalogue de démarches » dans `OrgSettingsPage` (racine uniquement).
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
