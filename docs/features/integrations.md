# Feature : intégrations partenaires (`integrations`, `organization_integrations`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

**Le catalogue des partenaires auxquels la gamme sait se connecter, et leur configuration par
collectivité** (lot 1, 2026-10-02). Première intégration réelle : **Arpège**.

## Catalogue ≠ configuration

| | Catalogue (ce que propose Edilumen) | Configuration (ce qu'en fait une collectivité) |
|---|---|---|
| Tables | `integration_types`, `integrations`, `integration_applications` | `organization_integrations` + `organization_integration_secrets` |
| Contenu | partenaire, type, applications concernées, logo, description, proposée ou non | paramètres, secrets, activation, dernier test |
| Lecture | tout `authenticated` | **super admin seul** |
| Écriture | super admin | super admin (secrets : par RPC) |

- **Types** : table `integration_types` (`parapheur_electronique`, `signature_electronique`,
  `application_services_techniques`, `application_gru`) — ajouter un type = insérer une ligne,
  sans toucher au code. Le code est un **contrat**, le libellé français vit dans `name`.
- **Une ligne `integrations` = un partenaire et son offre** (une seule table : un partenaire, une
  offre, aujourd'hui ; on extraira `partners` le jour où un éditeur en proposera deux — le contrat
  sort par `slug`). `adapter` NULL ⇒ « Bientôt disponible », non configurable.
- **Plusieurs applications par intégration** : `integration_applications` (FK `applications`).
- ⚠️ **Pas de partenaire fictif** : seule Arpège est posée. iXBus, Maarch, Yousign… s'ajouteront
  quand ils seront réels.

## Arpège

- ⚠️ **Arpège n'est pas un parapheur** : c'est la plateforme GRU / démarches en ligne
  **Espace Citoyens** (« Interop.Api v2 ») — type `application_gru`.
- Application rattachée : **Clara seule** (décision du 2026-10-02). Ariane s'y connecte aussi
  (rendez-vous, file d'attente), mais elle ne consomme pas encore le Socle et n'est pas au
  registre `applications` : elle y entrera ce jour-là.
- **Le connecteur vit dans Clara** (`clara-mailflow-hub/supabase/functions/_shared/arpege.ts`,
  `create-arpege-demande`, `check-arpege-ticket-status`, `sync-arpege-services`,
  `test-arpege-connection`). ⚠️ **Le Socle configure, l'application exécute** : le Socle ne
  crée aucune demande, ne synchronise rien ; il ne fait qu'un **test de connexion**.
- Paramètres = ceux du formulaire de Clara, **clés = ses colonnes** (la bascule sera une recopie,
  pas une traduction) : `api_base_url` (requis), `api_url_ticketingapp`, `client_id` (non
  secrets) ; `client_secret`, `access_token` (secrets ; le jeton, « ancien mode », est replié en
  paramètres avancés). Complète si URL + (identifiant **ou** jeton) + (secret **ou** jeton) —
  règle de `resolveHawkCredentials`.
- Authentification **Hawk (HMAC-SHA256)**, test `GET /v2/Hello`. `hawk.ts` est **porté tel quel**
  de Clara, son test aussi (oracle `node:crypto`). Seul ajout : l'URL doit être en `https`.

## Secrets

- ⚠️ **Aucun navigateur ne lit jamais un secret — super admin compris.**
  `organization_integration_secrets` : RLS **sans policy** et privilèges **révoqués** pour
  `anon`/`authenticated` (erreur franche 42501, pas un résultat vide). Lecture par le **service
  role seul** : la fonction `integration-test`, et demain la route public-api.
  ⚠️ C'est l'inverse de `smtp_settings` (mot de passe lisible par l'admin) et des tables
  `organization_integrations` de Clara et d'Ariane (`select("*")`) : **ne pas recopier ces
  modèles**.
- Écriture : `set_organization_integration_secrets(id, patch)` — valeur = remplace, **chaîne vide
  = conserve** (un champ secret n'est jamais prérempli), `null` = efface. Présence :
  `organization_integration_secret_keys(org)` → noms des secrets renseignés, jamais leur valeur.
- En clair au repos (comme partout dans la gamme aujourd'hui) ; Vault est installé et le
  chiffrement viendra sans changer cette frontière (roadmap).
- ⚠️ `integration-test` ne journalise **qu'un libellé fixe et un code d'erreur Postgres** — test
  sur le source (Ariane journalisait le début de l'en-tête Hawk).

## Statut (dérivé, jamais stocké)

`integrationStatus.ts` (pur, testé). Catalogue : *Disponible*, *Bientôt disponible* (sans
adaptateur), *Désactivée* (`is_available = false`). Collectivité : *Non configurée* (rien, ou
incomplet), *Configurée*, *Active*, *En erreur* (dernier test en échec — prime sur les deux
précédents), *Désactivée* (offre retirée — configuration **conservée**).

- ⚠️ **Activer exige un test réussi** — tenu par la base (trigger
  `guard_organization_integration_test`), pas seulement par l'écran : règle `canActivate` de
  Clara. Modifier les paramètres **ou** un secret **invalide** le test (`last_test_*` remis à
  NULL) sans désactiver ; un test en échec ne désactive pas non plus (le statut passe « En
  erreur », au super admin de suspendre).
- Racine seule (trigger `enforce_organization_integration_root_org`, motif applications).

## Adaptateurs — miroir front / edge

Un adaptateur = la liste des champs (secret, requis, avancé), la règle de complétude, et (côté
edge seulement) le test de connexion. **Pas un framework.** Ajouter un partenaire configurable :
une ligne de catalogue (migration) + un adaptateur **des deux côtés** —
`src/features/integrations/adapters.ts` et
`supabase/functions/integration-test/_shared/adapters.ts` ; `adapters.mirror.test.ts` vérifie
qu'ils disent la même chose. Un partenaire non configurable : la ligne seule, `adapter` NULL.

## Écrans

- `/superadmin/integrations` (`IntegrationsCataloguePage`) : cartes par type ; les types sans
  partenaire sont **nommés sur une ligne, en bas** (ils ne doivent pas repousser Arpège sous trois
  blocs vides), « Modifier » → description, URL du logo (`https`, sinon l'initiale), « Proposée ».
- Fiche client → section **« Intégrations »** (`?section=integrations`, racine seule) :
  `IntegrationsSection` — mêmes cartes avec le statut de la collectivité ; « Configurer » →
  `IntegrationConfigDialog` (formulaire généré, test, activation). Aucun écran côté administrateur
  de collectivité (décision du 2026-10-02 : super admin seul, comme le verrou de Clara).
- Badges : variantes `success` / `destructive` ajoutées à `Badge`, sur les jetons existants.

## Consommation par les applications (lot 2, 2026-10-02)

- **`GET /v1/integrations`** (scope `read`) : le catalogue, sans secret.
- **`GET /v1/organizations/{id}/integrations/{slug}`** (scope **`integrations`**, contrat
  1.34.0) : la configuration de la racine, **secrets compris** — motif `organizations/{id}/smtp`,
  mêmes gardes (scope explicite → 403, hors périmètre → 404). Rien de complet → 200
  `configured: false`, valeurs vides. ⚠️ `is_active` y est **effectif** (activée **et** offre
  proposée).
- ⚠️ Sérialisation en **whitelist par adaptateur** (`public-api/_shared/integrations.ts`) : troisième
  copie des champs, épinglée sur `integration-test` par `integrations.test.ts`. Un partenaire
  configurable s'ajoute donc à **trois** endroits (front, `integration-test`, `public-api`).
- **Clara** recopie la configuration dans sa propre table `organization_integrations` à chaque
  synchronisation du référentiel (`sync-socle-referentiel`, motif du miroir SMTP) : ses fonctions
  Arpège n'ont pas changé. ⚠️ **Transition** : tant que le Socle ne déclare rien de complet pour
  une collectivité, Clara **garde** sa configuration locale (au lieu de l'effacer comme pour le
  SMTP) ; dès qu'il en déclare une, le Socle fait foi, et l'écran de Clara la montre en lecture
  seule. La clé de Clara doit porter le scope `integrations`.
- **Bascule faite le 2026-10-02** : scope `integrations` posé sur la clé « Clara avec IA » ;
  configuration Arpège d'**ACCM** reprise de Clara (identifiants passés de base à base, jamais
  affichés), testée au Socle (`GET /v2/Hello` réussi) et activée ; première sync : valeurs
  identiques dans Clara, toujours active, désormais en lecture seule là-bas. ACCM était la seule
  collectivité configurée.
- **2026-10-02, à la demande du PO** : la configuration d'ACCM a été **dupliquée** chez **SNA** et
  **Rosny** (« Mairie de Saint Laurent ») — copie de base à base, tests réussis, activées,
  recopiées dans Clara. ⚠️ Mêmes identifiants : les trois collectivités parlent au **même espace
  Arpège**.
- Un tenant Clara rattaché à une **sous-organisation** recevrait la configuration de sa racine
  (comme pour le SMTP). Le seul cas (« Marie d'Arles », tenant de test d'avant le miroir des
  organisations) a été supprimé le 2026-10-02 : les sous-organisations d'ACCM sont des
  organisations du tenant ACCM, pas des tenants.
- Reste : Ariane (pas encore consommatrice du Socle), chiffrement au repos (Vault), retrait du
  formulaire Arpège de Clara une fois toutes les collectivités passées par le Socle.

## Démarches partenaires (2026-10-02, contrat 1.35.0)

L'API Arpège ne dit rien de **quel service propose quelle démarche** : l'activation par
organisation ne peut venir que du Socle. Les démarches Arpège y vivent donc comme les autres.

- **Import** : bouton « Récupérer les démarches » de la fiche Arpège (intégration **active**),
  fonction `integration-procedures` (super admin). Lecture **portée de Clara**
  (`sync-arpege-services`) : formulaires par type, `TypesDemandes` avec repli, filtre
  `ENLIGNE` ou vide. Les démarches entrent au catalogue de la **racine**, catégorie
  « Démarches Arpège » (créée au besoin), `status = production`, marquées `integration_id` +
  `external_reference` (code) + `partner_config` (opaque : `CodeQualificationMetier`,
  `ConfigInfoUsagerObligs`, `FormComponents` — exactement l'`arpege_config_fields` de Clara).
- ⚠️ Un nouvel import ne met à jour que **nom, description courte, `partner_config`** — jamais
  la catégorie, le statut ni les activations — et ne **supprime jamais** une démarche disparue
  d'Arpège (elle est signalée).
- **Activation** : écran existant « Démarches activées » (`organization_procedures`) ; la
  colonne catégorie (« Démarches Arpège ») les distingue.
- ⚠️ **Visibilité** (`procedureVisibleTo`, public-api) : une démarche partenaire n'est servie
  qu'aux clés dont l'application est rattachée à l'intégration (`clara`) — pour Iris, Nora, une
  clé d'organisation, **elle n'existe pas** (absente des listes, 404). Le portail l'écarte en plus
  (`isPubliclyPublished`, miroir front `catalogueVisibility` → « partenaire »), et l'éditeur du
  site ne la propose pas à l'épinglage.
- `ProcedureDto.partner` : `{ integration, reference, config } | null`.
- Éditeur : bandeau « Démarche partenaire » ; les étapes Demandeur, Formulaire, Communication
  usager et Publication restent affichées mais sont **sans effet** pour elle. Liste : badge au
  nom du partenaire.
- ⚠️ **Ordre** : importer est sans risque, mais **n'activer qu'après le déploiement de Clara** —
  sinon Clara, qui ne lit pas encore `partner`, la routerait vers Iris.

## Code et tests

`supabase/migrations/20261002090000_integrations_catalogue.sql`,
`supabase/tests/integrations.test.sql` (à blanc : `supabase db query --linked -f`),
`supabase/functions/integration-test/` (`index.ts`, `_shared/{hawk,adapters}.ts` + tests),
`supabase/functions/public-api/_shared/integrations.ts` (+ test),
`supabase/functions/integration-procedures/` (`index.ts`, `_shared/{arpegeCatalogue,importPlan,hawk}.ts` + test),
`supabase/migrations/20261002190000_procedures_partenaires.sql`,
`supabase/migrations/20261002160000_api_keys_scope_integrations.sql`,
`src/features/integrations/` (`useIntegrations.ts`, `integrationStatus.ts`, `adapters.ts`,
`IntegrationCard`, `IntegrationGrid`, `IntegrationsSection`, `IntegrationConfigDialog`),
`src/features/superadmin/integrations/IntegrationsCataloguePage.tsx`.
