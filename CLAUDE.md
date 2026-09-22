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
public, append-only), `operations.md` (runbook), `onboarding.md` (mise en service d'un client),
`roadmap.md` (évolutions souhaitées), et **`features/`** — une **fiche par feature** (invariants,
pièges ⚠️, pointeurs de code), indexée plus bas.
**Règle de propriété unique** : la liste des endpoints vit dans les OpenAPI
(`supabase/functions/*/_shared/openapi.ts`, publiés sur `/api-doc`, `/api-doc-usagers` et
`/api-doc-ia`), le schéma détaillé dans `docs/data-model.md`, le détail d'une feature dans sa
fiche — les autres docs renvoient sans dupliquer ; CLAUDE.md garde les règles transverses et
l'**index des features**. ⚠️ Toute PR qui touche une **surface de
contrat** (`supabase/functions/*/_shared/{dto,serializers,openapi}.ts`,
`src/features/procedures/{formSchema,requesterFields,knowledgeBase,communication,userCommunication}.ts`)
ajoute une entrée datée
à `docs/api-changelog.md` ; une doc périmée par une PR — fiche de feature comprise — se met à
jour **dans cette PR**. `docs/archive/` = instantanés historiques non maintenus.

⚠️ **CLAUDE.md reste sous 40 000 caractères** : au-delà, Claude Code le signale comme trop lourd.
Il en faisait 150 000 le 2026-09-18, jour où les features sont parties dans `docs/features/`
(déplacées telles quelles, rien de réécrit). Un détail de feature va dans **sa fiche**, jamais
ici ; l'index n'en garde que ce qu'il faut savoir avant même d'ouvrir la fiche. Un test l'épingle
— `src/claudeMd.test.ts`, qui vérifie aussi que chaque fiche citée existe.

⚠️ **`AGENTS.md` est une copie BYTE-IDENTIQUE de ce fichier** (c'est le nom que lisent les
outils autres que Claude Code), et un test l'épingle — `src/agentsMirror.test.ts`, motif
`apiKeyAuth.ts` : la duplication est acceptée, la dérive ne l'est pas. Toute modification de
l'un se recopie dans l'autre **dans la même PR** (`cp CLAUDE.md AGENTS.md`). Sans ce test,
`AGENTS.md` retombe dans l'état où il était jusqu'au 2026-09-18 : un instantané du 23 août qui
annonçait encore comme « placeholder » une étape livrée depuis, et auquel manquaient neuf
sections entières — une doc fausse coûte plus cher qu'une doc absente, parce qu'on la croit.

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
   utilisateurs et **administrateurs d'organisation**. Routes : `/` (tableau de bord —
   voir feature), `/organisations`,
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

- `organizations` — hiérarchie auto-référencée via `parent_id` (voir feature ci-dessous) ; `favicon_url` (icône de l'onglet du site de démarches, **cinquième élément de la charte** — voir feature) ; `enabled_languages` (langues de la collectivité, **racine uniquement** — voir feature « langues ») ; `is_internal_service` (l'organisme instruit mais ne s'affiche pas au portail — voir feature « services internes »).
- `users`, `user_organizations` (jointure user↔org + `role`).
- `categories`, `procedures`, `organization_procedures` (catalogue de démarches) — la colonne
  `translations` des deux premières porte les **textes traduits** (voir feature « langues »).
- `smtp_settings` (SMTP par organisation, **hérité du parent** sauf configuration propre —
  voir feature).
- `api_keys` (clés d'API rattachées à une racine — partenaires —, ou **clé plateforme** — `organization_id` NULL, rattachée à une **application** du registre et bornée aux collectivités **abonnées** à celle-ci — voir feature « Applications et abonnements » ; `consumer` = l'application, FK `applications`, et l'imputation des appels facturés).
- `applications` (registre des applications de la gamme : `nora`, `iris`, `clara`, `socle`), `organization_applications` (abonnements par racine), `platform_settings` (ligne unique : zone des sous-domaines fournis, cible CNAME, plafond IA par défaut — voir feature « Mise en service d'un client »).
- `ai_usage_quotas` / `ai_usage_counters` / `ai_usage_events` (plafond mensuel de jetons, compteur et journal ; `ai_usage_consumer_quotas` / `_counters` = sous-plafond par application — voir feature « guichet IA »).
- `contacts`, `contact_roles`, `contact_role_assignments`, `contact_external_references`,
  `contact_relations` (référentiel des usagers — voir feature).
- `quartiers` (découpage du territoire par racine, polygones PostGIS — voir feature).
- `document_templates` (catalogue de documents à variables par racine, fichiers dans un bucket privé — voir feature).
- `organization_domains` (domaines du portail usagers, `hostname` **unique sur toute la plateforme** — voir feature « site de démarches »).
- `portal_pages` (composition des pages du portail, `draft` autosauvegardé / `published` explicite — voir feature « site de démarches »).
- `portal_themes` (apparence du site de démarches — une ligne par racine, `draft`/`published` comme `portal_pages` ; **aucune couleur** : elles vivent dans la charte — voir feature « thème du site »).
- `portal_contents` (pages de **texte** du site, une par `(racine, slug)`, `draft`/`published` ; aujourd'hui la **déclaration d'accessibilité** — voir feature « site de démarches »).
- `organization_agent_guidance` (**recommandations aux agents**, une ligne par racine — version globale de `knowledge_base`, **interne** — voir feature « Organisations »).
- `portal_assistant_settings` (**interrupteur de l'assistant du portail**, une ligne par racine, écriture **super admin** seule — voir feature « Assistant du portail usagers »).

Types TS générés dans `src/types/database.types.ts` — **ne pas éditer à la main**,
régénérer depuis le schéma live (Supabase MCP `generate_typescript_types` / CLI).
Les migrations passent par `apply_migration` (Supabase MCP) ou la CLI ; l'historique appliqué
est **versionné dans `supabase/migrations/`** (rapatrié le 2026-08-12) — toute nouvelle
migration doit y avoir son fichier miroir `{version}_{nom}.sql`.

## Index des features

Chaque feature a sa **fiche** dans [`docs/features/`](docs/features/) : invariants, pièges (⚠️),
pointeurs de code, tests. ⚠️ **Lire la fiche avant de modifier la feature**, et la mettre à jour
dans la même PR. Ci-dessous, seulement ce qu'il faut savoir avant même de l'ouvrir.

Trois motifs reviennent dans presque toutes les fiches — les connaître évite de les redécouvrir :
- **Multi-tenant strict** : un référentiel (démarches, catégories, types de PJ, documents,
  contacts, quartiers…) se rattache à une **organisation principale (racine)**, imposé par un
  trigger `enforce_*_root_org` ; RLS typique : lecture `has_org_access`, écriture
  `is_org_admin`.
- **Le réglage gouverne l'usage, pas la donnée** (motif `email_sender_name`) : désactiver un
  commutateur **conserve** les valeurs qu'il masque, pour que le retour en arrière soit gratuit.
  Un consommateur qui lit la valeur sans lire le commutateur se trompe.
- **Miroirs front / edge** : une edge function n'importe rien de `src/` ; une règle partagée
  (`bearerByOrganization`, `readAccessMode`, `readLanguages`, `enabledAudiences`…) est écrite
  des deux côtés et **testée des deux côtés** (motif `readDocumentIds`).

### [Organisations](docs/features/organisations.md)
Hiérarchie, édition en pleine page (onglets Informations, Charte graphique, Langues,
Recommandations aux agents, Démarches, Emails, Domaines), gestion superadmin (`OrgSettingsPage`,
menu latéral par client).
- ⚠️ **Recommandations aux agents** (2026-09-19) : version **globale** de `knowledge_base`, sur la
  racine seule, servie par `GET /v1/organizations/{id}/agent-guidance` — **interne**, jamais au
  portail ; « consignes générales », jamais « procédures » (le mot désigne les démarches).
- Arbre `parent_id`, **10 niveaux max** (`enforce_org_depth`, bloque aussi les cycles). Le super
  admin seul crée les racines et supprime (jamais une racine) ; un admin d'org gère tout son
  sous-arbre, sans suppression. Les racines sont les **clients** : aucune vue n'en fond plusieurs.
- ⚠️ **Héritage résolu à la lecture, jamais recopié** : charte (`resolve_branding`,
  `branding_inherit_parent`) et SMTP (`resolve_smtp_settings`). ⚠️ Une racine n'hérite jamais —
  le trigger la **corrige** au lieu de refuser (`enforce_branding_root_no_inherit`).
- ⚠️ Charte = **cinq** éléments (deux logos, favicon, deux couleurs), tous comptent dans
  « configuré ». Ses colonnes brutes ne vont **jamais** sur `OrganizationDto` (nulles quand on
  hérite). Recréer `resolve_branding`/`parent_branding` rend les EXECUTE par défaut : reposer les
  droits en citant les trois rôles.
- Code : `src/features/organizations/`, `src/features/superadmin/organizations/` (`orgTree.ts`
  pur et testé, `useOrganizationsAdmin.ts`, `OrgSettingsPage`).

### [Services internes](docs/features/services-internes.md)
- `is_internal_service` retire l'organisme du portail ; son **porteur** (premier ancêtre non
  interne) est nommé à sa place. Une racine n'est jamais service interne (corrigée par trigger).
- ⚠️ **Une démarche, un seul instructeur par porteur** : règle unique
  `internal_service_offer_conflicts`, appliquée par **deux** triggers AFTER (activation *et*
  modification de l'organisation). Le verrou de l'UI est un confort, la base la seule barrière.
- ⚠️ L'aperçu du porteur se résout depuis le **parent**. En aval sort `handling_organization_id`,
  **jamais le nom** du service ; le `slug` du porteur est public (`organizations_slug_url_form`).

### [Démarches (`procedures`)](docs/features/demarches.md)
- Stepper à 6 étapes, une colonne par étape. ⚠️ **La clé suit la colonne, le libellé suit
  l'agent** : l'étape « Publication » a pour clé `communication` (colonne
  `communication_config`), « Communication usager » a pour clé `usager` (`user_communication` +
  `user_description`) — table de correspondance dans la fiche.
- ⚠️ Notions indépendantes, à ne pas confondre : `status` (paramétrage fini ; au doute
  **brouillon**), `organization_procedures.is_enabled` (qui la propose),
  `communication_config.visibility` (où et quand ; NULL = défauts **actifs**),
  `is_internal_service` (sous quel nom). `access_mode` **ne filtre rien** (au doute `libre`), et
  `user_communication` ne dit rien de la publication.
- ⚠️ **Tout ce que porte `user_communication` est public** (servi tel quel au portail, défauts
  vides) ; rien de ce qui sert à instruire n'y entre. Deux FAQ qui ne se fusionnent jamais :
  `knowledge_base.faq` (agent et IA) ne traverse jamais vers le portail.
- ⚠️ **Lieu d'intervention** = champ `type: "location"` (2026-09-22, contrat 1.29.0) : adresse
  sur une ligne (BAN) + point déplaçable dans un rayon de **150 m** (constante, pas une option) ;
  réponse **objet** `LocationValue`, un point présent **ne se géocode pas**, l'adresse ne bouge
  pas. L'ancienne section `intervention_*` n'est plus proposée mais subsiste sur les démarches
  existantes. L'aperçu du builder ne simule ni BAN ni carte.
- JSON possédés = **contrats publics** (`form_schema`, `requester_config`,
  `communication_config`, `knowledge_base`, `user_communication`) : parseurs robustes testés.
  Documents de la base de connaissances : bucket privé `procedure-documents`, 1er segment du
  chemin = la racine (le RLS storage s'appuie dessus). Code : `src/features/procedures/`.

### [Langues et libellés traduits](docs/features/langues.md)
- `enabled_languages` sur la **racine** ; catalogue figé dans le code (`languages.ts`, codes
  BCP 47 — contrat de nommage). `translations` sur `procedures`, `categories`, les sections de
  `portal_pages` et chaque entrée de `user_communication` (la traduction vit sur l'entrée).
- ⚠️ Le français est la langue pivot : il vit dans les colonnes, **jamais** dans `translations`.
  ⚠️ Repli **champ par champ** ; traduction vide = non stockée ; désactiver une langue n'efface
  rien ; un écran n'efface que les champs qu'il affiche (`translationsForWrite(…, fields)`).
- Traduction automatique : `translate-labels` → **`ai-api`** (clé `SOCLE_AI_API_KEY`), ⚠️ jamais
  le fournisseur en direct ; un seul appel par ligne, ne remplit que les cases vides, ne persiste
  rien. Code : `src/features/languages/`, `supabase/functions/translate-labels/`.

### [Types de pièce justificative (`document_types`)](docs/features/types-pieces.md)
- Par racine, nom unique insensible à la casse ; alimentent le champ PJ du form builder
  (`documentTypeId`, obligatoire à la saisie). Code : `src/features/document-types/`.

### [Catalogue de documents (`document_templates`)](docs/features/documents.md)
- Gabarits à variables `{{domaine.cle}}`, bucket privé `document-templates`. ⚠️ Ni
  `document_types` (pièces demandées à l'usager), ni `procedure-documents` (aide à l'agent).
- ⚠️ Le Socle enregistre et publie, **il ne fusionne rien** ; catalogue de variables figé
  (`documentVariables.ts`). ⚠️ Ordre des écritures fichier / ligne à ne pas inverser.
  Code : `src/features/documents/`.

### [API publique (`public-api`)](docs/features/public-api.md)
- Lecture seule (`GET`), clé `api_keys` hachée SHA-256, scope `read` ; isolation au sous-arbre
  par `org_subtree_ids` (service role) ; hors périmètre = **404**.
- ⚠️ Sérialisation en **whitelist stricte** (`_shared/serializers.ts`). Seule exception, gardée
  par le scope `smtp` : `organizations/{id}/smtp`, mot de passe compris.
- ⚠️ `verify_jwt = false` est déclaré dans `supabase/config.toml` : déployer sans ce fichier
  coupe **tous** les consommateurs (incident du 2026-09-05). Logique pure dans `_shared/` (sans
  Deno, testée par vitest, déployée avec `index.ts`). Doc humaine = page in-app `/api-doc`.

### [Mise en service d'un client](docs/features/mise-en-service.md)
- Par client, rien dans Supabase — tout dans le Socle (procédure : `docs/onboarding.md`). Une
  racine naît équipée (trigger `provision_root_organization`) — ⚠️ idempotent et jamais bloquant.
- Check-list `root_onboarding_status` (`jsonb`, lecteur tolérant). Plafond IA : ligne absente =
  non décidé, `is_active = false` = illimité **explicite**. Courriels d'authentification : SMTP de
  la collectivité, sinon `PLATFORM_SMTP_*`.

### [Applications et abonnements](docs/features/applications.md)
- Registre `applications` (`nora`, `iris`, `clara`, `socle`) + `organization_applications`
  (abonnements, super admin). Une clé plateforme appartient à une application et ne voit que les
  racines abonnées (`application_scope_ids`) ; sans application → **403**.
- ⚠️ Décision d'auth dans `_shared/apiKeyAuth.ts`, **identique dans les quatre fonctions** (test
  d'identité). ⚠️ Ordre de déploiement : migration → abonnements et clés dans l'UI → fonctions.

### [Site de démarches — portail usagers](docs/features/site-de-demarches.md)
- Le portail est **Nora** (dépôt `Notch-pm/Nora`, sans base) ; le Socle détient le domaine
  (`organization_domains`, `hostname` unique sur la plateforme, écriture super admin), le
  catalogue public et la page composée (`portal_pages`).
- ⚠️ **Sauvegarder n'est pas publier** : `draft` autosauvegardé, `published` par geste explicite ;
  le portail ne sert que `published`.
- ⚠️ Schéma de page en `version: 1` — **ne pas l'incrémenter** (le parseur retomberait sur la page
  par défaut) ; parse tolérant section par section ; Zod strippe les clés inconnues : tout nouveau
  champ se déclare dans les schémas de section. URL d'image `https` absolue, couleurs `#rrggbb` :
  on écarte, on ne nettoie pas.
- ⚠️ Règle du catalogue = miroir de `public-api/_shared/portalCatalogue.ts`. Code :
  `src/features/portal/`.
- **Accessibilité** : la *mention* du pied de page se règle dans « Composition » (ce n'est pas une
  section — sélection à part) et vit dans le thème ; la *déclaration* se rédige dans « Contenus »
  (`portal_contents`). ⚠️ Le lien ne mène jamais à une page vide (`declaration_link` résolu par
  l'API) ; « Publier » publie composition, thème et contenus d'un geste.

### [Thème du site de démarches (`portal_themes`)](docs/features/theme-du-site.md)
- ⚠️ **Le thème ne porte aucune couleur** (elles vivent dans la charte) ; il vaut pour tout le
  site ; pas de `version` ; « Aperçu gros texte » n'est pas enregistré. Publié avec la page, d'un
  seul geste.
- ⚠️ Polices : catalogue figé, licence de redistribution exigée, auto-hébergées — **jamais Google
  Fonts au rendu**. Rendu par variables CSS (`themeStyle.ts`) ; `contrast.ts` est la seule
  implémentation de la luminance. En aval : rien de publié ⇒ défauts, jamais `null`.

### [Référentiel des usagers (`contacts`)](docs/features/referentiel-usagers.md)
- Partagé par toute la gamme ; ⚠️ écriture **uniquement via `contacts-api`** (aucune policy
  d'écriture client, sauf `contact_roles`), pas d'UI Socle. Invariants par type en CHECK ;
  `internal_notes` réservé aux agents ; la cible d'une relation n'est jamais une personne.

### [API usagers (`contacts-api`)](docs/features/contacts-api.md)
- Lecture/écriture, scope `contacts`, **aucune suppression** ; bornée à la racine (égalité
  stricte), `X-Organization-Id` pour une clé plateforme.
- ⚠️ Toute requête sérialisée passe par `CONTACT_SELECT` (sinon `quartier` arrive `null` sans
  erreur). Géocodage BAN best-effort ; rapprochement par la RPC `match_contacts`.

### [Guichet IA (`ai-api`)](docs/features/ai-api.md)
- Le Socle détient la clé du fournisseur, compte les jetons, refuse au-delà du plafond ;
  l'application décide ce qui est dit. Scope `ai` ; l'imputation vient de la **clé**, jamais du
  corps.
- ⚠️ **Passe-plat** : aucun contenu persisté ni journalisé (tests sur les colonnes et sur le
  source). ⚠️ Délais fournisseur 55 s < Socle 60 s < consommateur. Cadence avant plafond, seuil
  non réglable. Le plafond ne s'écrit que côté superadmin.
- ⚠️ Le plafond est **commun** aux applications d'une collectivité ; une application peut porter
  une **part réservée** (`ai_usage_consumer_quotas`, née pour `nora` — en jetons ou en
  **pourcentage vivant** du plafond), et **les applications sans part se partagent le reste**, où
  elles sont bornées (partage du 2026-09-22). `reserve_ai_usage` : cadence → part → plafond moins
  les parts des autres, et **rend** la réservation du sous-compteur si le plafond refuse. Les
  chiffres rendus (appel, `429`, `/v1/usage`) sont ceux de **l'appelant**. Cas limites acceptés
  et inoffensifs (pourcentage sans plafond = sans effet), jamais refusés à la pose. Toute
  retouche se joue d'abord **à blanc** avec `supabase/tests/plafond-ia.test.sql`.

### [Assistant du portail usagers](docs/features/assistant-usager.md)
- Assistant conversationnel de Nora. Le Socle n'en tient que **l'interrupteur**
  (`portal_assistant_settings` : `enabled`, `deposit_enabled`), réglé par le **super admin** seul,
  effet immédiat (⚠️ ni dans le thème, ni sur `organizations`), servi sur `TenantDto.assistant`.
- ⚠️ Le commutateur s'applique **à la frontière** (`readPortalAssistant`) : couper `enabled`
  conserve `deposit_enabled`. Au doute, **fermé**. `TenantDto` est public : deux booléens, rien
  d'autre.
- ⚠️ Corpus = ce que `/v1/portal/*` sert déjà ; `knowledge_base` et les recommandations aux agents
  n'entrent **jamais** dans son prompt. ⚠️ Pas d'ouverture au public sans **part de crédit
  réservée** : elle se règle dans la section « Assistant IA » (bouton « Répartir », le seul écran
  qui écrit) et s'affiche à côté de l'interrupteur, qui y renvoie.

### [Tableau de bord et fréquentation](docs/features/tableau-de-bord.md)
- ⚠️ **Aucune donnée personnelle** (ni cookie, ni IP, ni User-Agent, ni référent) : c'est ce qui
  dispense de bandeau, et des tests le vérifient. Une visite = une arrivée sur le site ; le jour
  vient du serveur, heure de Paris.
- `audience-api` : **écriture seule**, scope `audience`. Tables sans policy (RPC seulement).
  ApexCharts épinglé (3.54.1 / wrapper 1.5.0) ; `charts/*` copiés d'Iris à l'identique.

### [Quartiers](docs/features/quartiers.md)
- Polygones PostGIS par racine, import GeoJSON seulement — ⚠️ l'import **remplace** le découpage,
  dans une seule transaction. Rattachement automatique des contacts par trigger
  (`assign_contact_quartier`, `quartier_auto`). `react-leaflet@4` (la v5 exige React 19).

### [Shell de l'app et bascule entre applications](docs/features/shell-et-lanceur.md)
- Rail aux **mesures de la gamme** (`w-[52px]`, tuiles 36 px, `RAIL_WIDTH_CLASS`), couleur propre
  à Socle (jeton `--rail`) : changer de couleur = changer le jeton **et** son jeton de contraste,
  jamais de `white/…` en dur. En-tête : la collectivité à gauche, le produit à droite.
- Lanceur `AppLauncher` (catalogue figé `suiteApps.ts`, la `key` est le sous-domaine) — ⚠️ à ne
  pas confondre avec la table `applications`. Le damier est réservé au lanceur.

## Design system

Socle consomme le **Notch / Ariane Design System** (projet Claude Design, partagé avec Ariane et
Clara). Les tokens sont déjà repris dans `src/index.css` + `tailwind.config.ts` (primaire vert
`hsl(153 90% 32%)`, secondaire beurre, radius 14px, ombres douces). Construire l'UI
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
