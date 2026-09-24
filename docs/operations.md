# Exploitation & déploiement

> **Public** : ops, devs déployant Socle · **Question traitée** : comment exploiter et déployer
> Socle (edge functions, fronts, secrets, base, CI) ? · **Dernière mise à jour** : 2026-09-24

Ce document est un runbook. Pour le « pourquoi » des choix, voir
[architecture.md](./architecture.md) ; pour le détail du schéma, [data-model.md](./data-model.md).

## Environnement

- Projet Supabase : **`qhrokbkyxgcvkbpmbmna`**.
- `.env.local` à la racine, **non versionné** :

  ```
  VITE_SUPABASE_URL=...
  VITE_SUPABASE_PUBLISHABLE_KEY=...
  ```

  Le client (`src/lib/supabase.ts`) **échoue au démarrage** si l'une des deux manque — pas de
  repli silencieux.

## Edge functions

Huit fonctions Deno dans `supabase/functions/`. Le déploiement passe par l'outil MCP
`deploy_edge_function` (ou la CLI équivalente), avec un `verify_jwt` fixé par fonction au
déploiement. ⚠️ **`supabase/config.toml` gouverne ce réglage pour la CLI** (ajouté le 2026-09-05,
après l'incident où un redéploiement de `public-api` sans lui a remis le défaut `true` et coupé
tous les consommateurs) : toute fonction nouvelle doit y déclarer son `verify_jwt`, y compris
quand la valeur voulue est le défaut.

| Fonction | `verify_jwt` | Pourquoi |
|---|---|---|
| `public-api` | `false` | Auth par clé API (`Authorization: Bearer <clé>`), vérifiée dans le code de la fonction — pas un JWT Supabase |
| `contacts-api` | `false` | Idem : clé API + scope `contacts`, portée par la fonction |
| `ai-api` | `false` | Idem : clé API + scope `ai` + **application imputable**. Guichet du fournisseur LLM — la seule fonction qui appelle un tiers **payant** |
| `audience-api` | `false` | Idem : clé API + scope `audience`. Compteurs de fréquentation du site de démarches, appelée par `portal-api` de Nora. **Écriture seule** — aucun `GET` : la clé vit dans une fonction qui sert des pages publiques |
| `auth-email-hook` | `false` | Appelée par Supabase Auth (hook « Send Email »), authentifiée par **signature Standard Webhooks** (`AUTH_HOOK_SECRET`), pas par JWT |
| `invite-user` | `true` | Appelée depuis l'UI Socle avec le JWT de l'utilisateur connecté ; l'autorisation fine (`is_admin_of_self_or_ancestor`, depuis le 2026-09-08 — un admin de racine invite dans ses sous-organisations) est vérifiée en plus, dans le code. Action `resend` : renvoi d'une invitation restée sans suite |
| `send-test-email` | `true` | Idem : JWT utilisateur + `is_org_admin(organization_id)` |
| `translate-labels` | `true` | Idem : JWT utilisateur + `is_org_admin(organization_id)`. Traduit les textes d'une ligne (libellé, descriptif court) **en appelant `ai-api`** avec la clé plateforme du Socle (`SOCLE_AI_API_KEY`) — elle n'appelle jamais le fournisseur directement |

⚠️ **Piège de déploiement** : le tableau `files` passé à `deploy_edge_function` doit inclure
`index.ts` **et tout `_shared/*.ts`** de la fonction. `public-api` et `contacts-api` colocalisent
leur logique pure dans `_shared/` (testée par vitest) — un déploiement qui n'embarque pas ces
fichiers casse la fonction en production alors que les tests passent en local.

## Secrets & configuration Auth

- **`AUTH_HOOK_SECRET`** : secret du hook Supabase Auth « Send Email » (Dashboard →
  Authentication → Hooks), au format `v1,whsec_...` — `auth-email-hook` retire le préfixe avant
  de vérifier la signature Standard Webhooks. Le hook doit pointer vers l'URL HTTPS de la
  fonction déployée.
- **Redirect URLs** (Dashboard → Authentication → URL Configuration) : doivent inclure
  `/activer-compte` (activation après invitation) et `/reinitialiser-mot-de-passe` (mot de passe
  oublié), routes définies dans `src/App.tsx`.
- **`PLATFORM_SMTP_*`** (2026-09-08) : le relais de messagerie de la **plateforme**, repli des seuls
  courriels d'**authentification** (`invite-user`, `auth-email-hook` : invitation, activation, mot de
  passe oublié) quand la collectivité n'a pas encore de relais résolu — et pour un compte sans
  organisation (le super administrateur). Sept secrets : `PLATFORM_SMTP_HOST`, `PLATFORM_SMTP_PORT`
  (défaut 587), `PLATFORM_SMTP_USERNAME`, `PLATFORM_SMTP_PASSWORD`, `PLATFORM_SMTP_FROM_EMAIL`,
  `PLATFORM_SMTP_FROM_NAME`, `PLATFORM_SMTP_USE_TLS` (défaut vrai). Absents, le comportement
  d'avant subsiste : sans relais de collectivité, aucun courriel d'authentification ne part (404
  du hook, `email_sent: false` de l'invitation). ⚠️ Les courriels MÉTIER ne connaissent pas ce
  repli — `send-test-email` et les applications de la gamme expédient par le relais de la
  collectivité, ou pas du tout. Le journal de la fonction dit lequel a servi (`relais=collectivite`
  / `relais=plateforme`), jamais les identifiants.
- **SMTP** : pas de secret SMTP global pour les courriels métier. Chaque organisation racine porte ses propres identifiants
  dans la table `smtp_settings` (hôte, port, identifiant, mot de passe, expéditeur), saisis par un
  admin d'org depuis l'onglet « Emails (SMTP) ». `auth-email-hook` et `send-test-email` lisent
  cette table avec la service role.
  **Depuis le 2026-08-23, ces identifiants sortent aussi du Socle** : `public-api` les sert sur
  `GET /v1/organizations/{id}/smtp` aux clés portant le scope `smtp` (racine uniquement), pour
  que les applications de la gamme expédient les mails de la collectivité par son relais sans
  ressaisie — Iris en tient un miroir. Conséquence d'exploitation : **le relais d'une
  collectivité se change ici, une seule fois**, et redescend en aval à leur synchronisation ;
  et le scope `smtp` ne se coche que pour une application de la gamme, jamais pour un
  partenaire.
- **`MISTRAL_API_KEY`** (2026-08-29) : la clé du fournisseur LLM, secret d'edge function de
  `ai-api`. ⚠️ **Elle ne quitte JAMAIS le Socle** — c'est tout l'objet de la centralisation : une
  application compromise ne compromet pas la clé. Ne pas la ranger dans le Vault ni dans une
  table : un secret d'edge function est le bon endroit, et **`smtp_settings.password` est une
  dette assumée, pas un modèle à imiter**. Absente, `ai-api` répond `503 not_configured` — après
  l'authentification, pour qu'un appelant non authentifié n'apprenne pas si la plateforme est
  équipée.
- **`SOCLE_AI_API_KEY`** (2026-09-06) : la clé par laquelle **le Socle s'appelle lui-même**, secret
  d'edge function de `translate-labels`. C'est une clé `api_keys` ordinaire, **plateforme**
  (`organization_id` NULL), portant le scope **`ai`** et le consommateur **`socle`** —
  exactement ce qu'on donnerait à Iris ou à Clara. Le Socle est ici une application de la gamme
  comme les autres : sa dépense de traduction apparaît dans la ventilation de la collectivité au
  nom de `socle`, sous le même plafond et la même cadence.

  **À poser une fois par plateforme**, sinon le bouton « Traduire automatiquement » répond
  `503 not_configured` (l'écran affiche « La traduction automatique n'est pas configurée sur
  cette plateforme. ») :

  1. `/superadmin/cles-plateforme` → **Nouvelle clé** : nom libre (« Socle — traduction »), scope
     **Assistant IA**, application imputable **`socle`**, case « périmètre global » cochée ;
  2. copier le secret **affiché une seule fois** ;
  3. `supabase secrets set SOCLE_AI_API_KEY=<secret>` (ou Dashboard → Edge Functions → Secrets).

  ⚠️ **Révoquer cette clé coupe la traduction automatique**, rien d'autre : les écrans continuent
  de fonctionner, les traductions déjà saisies restent. C'est le levier d'arrêt d'urgence si la
  fonctionnalité dérape. ⚠️ Elle porte le scope `ai` **et lui seul** : une clé qui porterait aussi
  `read` ou `contacts` donnerait à une fonction de traduction un accès au référentiel et aux
  usagers, que rien dans son travail ne justifie.
- **`MISTRAL_AGENT_<ALIAS>`** (optionnel) : identifiant d'un agent Mistral créé en console, pour
  l'alias correspondant (`assistant-instruction` → `MISTRAL_AGENT_ASSISTANT_INSTRUCTION`).
  Absent, `ai-api` retombe sur `chat/completions` avec un modèle par défaut — le service
  fonctionne, il n'est simplement pas piloté depuis la console. C'est ce qui permet de changer
  d'agent ou de modèle **sans toucher une seule application**.

  **Alias en service** (le nom du secret se déduit de l'alias : majuscules, tirets en
  soulignés) :

  | Alias | Secret | Consommateur | Usage |
  |---|---|---|---|
  | `assistant-instruction` | `MISTRAL_AGENT_ASSISTANT_INSTRUCTION` | Iris | Assistant d'instruction des demandes |
  | `extraction-courrier` | `MISTRAL_AGENT_EXTRACTION_COURRIER` | Clara | Analyse de courrier, extraction structurée, préremplissage de démarche |
  | `redaction-reponse` | `MISTRAL_AGENT_REDACTION_REPONSE` | Clara | Brouillon de réponse à un courrier |
  | `assistant-usager` | `MISTRAL_AGENT_ASSISTANT_USAGER` | Nora | Assistant conversationnel du portail usagers — **à créer** ; absent, repli sur le modèle par défaut (le choix du modèle, donc du coût, ne se pilote alors pas depuis la console) |

  ⚠️ **« Optionnel » ne veut pas dire « sans conséquence », et l'écart entre consommateurs
  mérite d'être connu.** Pour un assistant conversationnel (Iris), le repli sur le modèle par
  défaut change le ton, pas la fonction. Pour les **extractions structurées de Clara**, l'agent
  historique portait le comportement d'extraction : le repli dégrade la qualité des champs
  proposés **silencieusement** — aucune erreur, aucun journal, juste des suggestions moins
  bonnes. Clara s'en protège en composant des prompts système autosuffisants (elle ne peut pas
  savoir si son alias résout), mais renseigner ces deux secrets à la bascule reste le bon geste.
  L'identifiant de l'agent d'extraction historique de Clara est récupérable dans son dépôt,
  avant la bascule du 2026-08-29.

  **État au 2026-08-29** : les deux secrets de Clara sont renseignés, et la bascule est
  vérifiée — ses appels sont passés de `resource_type = 'chat'` à `'agent'` dans
  `ai_usage_events` dès que les secrets ont été posés.

  `MISTRAL_AGENT_ASSISTANT_INSTRUCTION` (Iris) est **absent, et c'est normal — ne le cherchez
  pas.** Contrairement à Clara, Iris n'a **jamais** eu d'agent : aucun identifiant dans son
  historique git, aucun secret `MISTRAL_*` dans son projet, et il compose son propre prompt
  système (`_shared/ai/prompt.ts`, `buildAssistantPrompt`, ~190 lignes) en appelant
  `chat/completions`. Son `resource_type = 'chat'` n'est donc pas une dégradation due à la
  bascule : c'est l'état dans lequel il a toujours tourné. Rien à restaurer.

  En créer un reste possible, et c'est une décision **produit** : le seul gain serait de régler
  le ton de l'assistant depuis la console Mistral sans redéployer. Le coût est réel — le
  comportement vivrait à deux endroits, le prompt composé par Iris et celui de l'agent, qui se
  superposeraient. À faire le jour où le besoin existe, pas avant : poser le secret suffira,
  aucune application ne bougera.

  ⚠️ **Cette colonne `resource_type` est le seul témoin de la résolution d'alias.** Un
  identifiant erroné se voit (`failed` + 502) ; un identifiant absent, non. Après tout
  changement de secret `MISTRAL_AGENT_*`, lire :

  ```sql
  SELECT consumer, feature, resource_type, status, created_at
  FROM public.ai_usage_events ORDER BY created_at DESC LIMIT 10;
  ```

## Mesure d'audience du portail (2026-09-12)

Rien à poser **côté Socle** : `audience-api` n'a aucun secret propre (elle lit `api_keys` avec la
service role, comme les trois autres). Deux gestes seulement, dans cet ordre :

1. **Le scope `audience` sur la clé plateforme `nora`**, en plus de `read` — depuis
   `/superadmin/applications`. Une clé par application : ne pas en créer une seconde pour la
   mesure, ce serait un secret de plus à poser, à faire tourner et à révoquer.
2. **`SOCLE_AUDIENCE_API_URL`** dans les secrets de **Nora** (projet Supabase du portail) :
   `https://<ref-socle>.supabase.co/functions/v1/audience-api`, puis redéploiement de `portal-api`.

⚠️ **L'ordre importe peu, et c'est voulu** : sans le scope, le Socle répond 403 et Nora ignore
l'échec ; sans l'URL, Nora ne compte rien. Dans les deux cas, **aucune page ne casse** — un
compteur ne fait jamais échouer un portail.

⚠️ **Tant que `SOCLE_AUDIENCE_API_URL` n'est pas posée, le tableau de bord d'une collectivité
affiche « Aucune visite enregistrée ».** C'est l'état normal, pas une panne : l'écran le dit.

⚠️ **Un environnement de développement ne compte rien** (`import.meta.env.PROD`,
`navigator.webdriver`) : ne pas poser l'URL sur un projet de test suffit d'ailleurs à l'isoler
complètement.

Vérification : `POST /v1/page-views` sans clé → 401 ; avec une clé `read` seule → 403 ; avec un
`tenant_id` hors périmètre → 404 ; avec une clé inconnue dans le corps → 400.

## Réglages de plateforme et provisioning (2026-09-08)

- **`/superadmin/plateforme`** (table `platform_settings`, ligne unique) : la **zone des
  sous-domaines fournis** (ex. `demarches.edilumen.fr` — le DNS wildcard `*.<zone>` doit pointer
  vers l'hébergeur du portail), la **cible CNAME** des domaines personnalisés (affichée dans l'écran
  des domaines de chaque collectivité), le **plafond IA par défaut**. Aucun secret n'y vit.
- **À la création d'une racine**, le trigger `provision_root_organization` pose les rôles de
  contact, le plafond IA par défaut et le sous-domaine fourni (`provision_root`, idempotent, jamais
  bloquant : un sous-domaine déjà pris fait un `raise warning`, pas un échec). ⚠️ Tout script qui
  insère des racines en hérite — `supabase/tests/plafond-ia.test.sql` neutralise le plafond par
  défaut en tête de transaction.
- **« Rejouer le provisioning »** (`provision_existing_roots`, super administrateur) : après avoir
  posé les réglages, pour les collectivités créées avant eux. Idempotent.
- **Applications et abonnements** (`/superadmin/applications`, tables `applications` et
  `organization_applications`) : une clé plateforme par application, dont le périmètre est la
  liste des collectivités abonnées. ⚠️ **Ordre de déploiement d'un changement de périmètre** :
  migration → vérifier les abonnements et rattacher les clés dans l'UI → déployer les fonctions.
  Inverser les deux derniers coupe le portail (toutes les racines hors périmètre → 404).
- **Tests SQL** (`supabase/tests/`) : `provisioning.test.sql`, `applications.test.sql`,
  `plafond-ia.test.sql` — des blocs `DO` qui s'annulent d'eux-mêmes (l'exception finale « OK »
  est le verdict), à jouer par `execute_sql` ou le SQL editor.

## Base de données

- **Migrations** : appliquées via l'outil MCP `apply_migration`, ou la CLI `supabase`
  équivalente. L'historique appliqué est **versionné dans `supabase/migrations/`** (rapatrié le
  2026-08-12 depuis `supabase_migrations.schema_migrations`, contenu vérifié à l'octet) — toute
  nouvelle migration doit y avoir son **fichier miroir** `{version}_{nom}.sql`.
- **Baseline de schéma** : `supabase/schema.sql` — dump complet du schéma `public` (tables,
  fonctions, triggers, policies), généré le 2026-08-12 via `supabase db dump -f
  supabase/schema.sql --linked` (nécessite Docker Desktop). C'est la photo de l'état courant, à
  régénérer après une série de migrations. Les fichiers de `supabase/migrations/` restent
  l'**historique** — ils ne rejouent pas depuis une base vide, le socle initial du 2026-07-04
  leur étant antérieur : la reconstruction depuis zéro passe par `schema.sql`. ⚠️ Le dump ne
  couvre pas le schéma `storage` : le bucket `procedure-documents` et ses 4 policies
  `storage.objects` ne vivent que dans la migration `procedure_documents_bucket_and_rls`.
  ⚠️ Le dump date du 2026-08-12 : les trois migrations du 2026-08-23 (héritage SMTP) n'y sont
  pas encore — elles ne vivent que dans `supabase/migrations/`. À régénérer au prochain
  démarrage de Docker Desktop.
- **Types TypeScript** : à régénérer après **toute** migration (`generate_typescript_types` MCP,
  ou CLI équivalente) dans `src/types/database.types.ts`. Ce fichier **ne s'édite jamais à la
  main**. Dernière régénération : 2026-08-23 (héritage SMTP : `smtp_settings.inherit_parent`,
  RPC `resolve_smtp_settings` / `parent_smtp_settings`). Avant elle, 2026-08-12 (a rattrapé `api_keys.organization_id`
  nullable, introduit par la clé plateforme du 2026-07-17).
- **Advisors** : lancer `get_advisors` (sécurité et performance) après tout changement de schéma
  — c'est ainsi qu'ont été détectées, par exemple, les fonctions trigger `SECURITY DEFINER`
  appelables via `/rest/v1/rpc/…` (`EXECUTE` révoqué depuis, cf. [data-model.md](./data-model.md)).

### Tâches planifiées (`pg_cron`)

⚠️ **Le Socle n'avait AUCUNE tâche planifiée avant le 2026-08-29** ; `pg_cron` a été installé
avec le guichet IA. Une exploitation qui l'ignore ne le découvrira pas toute seule : **un cron en
échec est parfaitement silencieux**. Rien n'alerte, rien ne remonte dans les journaux
d'application — il faut aller lire `cron.job_run_details`.

| Job | Fréquence | Rôle |
|---|---|---|
| `release-stale-ai-reservations` | toutes les 5 min | **Deux gestes.** (1) Libère les réservations de jetons orphelines — un appel dont le règlement n'est jamais arrivé (processus tué, réseau coupé). (2) Purge les fenêtres du garde-fou de débit de plus d'une heure. |

Sans lui, une réservation orpheline mord définitivement sur le plafond du mois : la collectivité
paierait un appel qui n'a jamais eu lieu, et personne ne saurait pourquoi son crédit fond.

```sql
-- Les 20 dernières exécutions, et leur statut.
select j.jobname, d.status, d.start_time, d.return_message
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 order by d.start_time desc limit 20;
```

## Stockage

Bucket privé **`procedure-documents`** (documents de la base de connaissances des démarches) :
**25 Mio maximum par fichier**. Bucket privé, donc aucun accès direct — consultation uniquement
par **URL signée temporaire** (`documents/signed-url` de `public-api`, ou `createSignedDocumentUrl`
côté app). Convention de chemin et RLS détaillés dans [data-model.md](./data-model.md).

## Fronts (Cloudflare Workers)

Le front du Socle (Worker `socle`, `socle.edilumen.fr`) et le portail Nora (Worker `nora`, joker
`*.edilumen.fr/*`) sont des Workers **sans code** qui servent `dist/`, sur le compte Cloudflare
`9f6ab1722a04e6e1385445ee1cbb0261`. Ils se reconstruisent **au push sur `main`** (~2 min).

⚠️ **Le push ne suffit pas toujours** : le 2026-09-24, les pushs de Socle et de Nora n'ont
déclenché **aucun** build, et plus tôt le même jour un build avait échoué en publiant un bundle
incomplet (version `12635b90`, **à ne jamais repromouvoir**). Après un push, vérifier que le
bundle en ligne a changé :

```bash
js=$(curl -s https://socle.edilumen.fr/ | grep -o 'assets/index-[^"]*\.js' | head -1)
curl -s "https://socle.edilumen.fr/$js" | grep -c "<un texte neuf de la feature>"
```

**Publier l'interface à la main** (depuis le dépôt concerné, poste authentifié par wrangler) :

1. `npm run build` — les variables `VITE_*` sont inlinées **au build** : le `.env.local` doit
   pointer sur la production (Nora : `VITE_PORTAL_API_URL` = `portal-api` de
   `xbullkayqdzqiyrrwbqx`).
2. **Comparer au bundle en ligne** avant de publier : taille voisine (le bundle Socle fait
   ~1,2 Mo, Nora ~450 Ko) et mêmes URL (projet Supabase, géocodage, tuiles). Un écart de taille
   franc = build incomplet ou variables manquantes — ne pas publier.
3. `CLOUDFLARE_ACCOUNT_ID=9f6ab1722a04e6e1385445ee1cbb0261 npx wrangler deploy` — l'identifiant
   est obligatoire, wrangler voit deux comptes.
4. Revérifier le bundle en ligne, et que les autres sous-domaines (`iris`, `socle`, `clara`)
   répondent toujours : la route joker de Nora les capterait sans leurs exclusions de zone.

`npx wrangler deployments list --name <socle|nora>` montre ce qui est en ligne ; un rollback
passe par `npx wrangler rollback`.

## CI & qualité

- **Hook husky pre-commit** : rejoue `npm run lint` (`tsc -b`, pas d'ESLint) et `npm test`
  (`vitest run`) avant chaque commit.
- **GitHub Actions** (`.github/workflows/ci.yml`) : mêmes commandes, sous **Node 24**, à chaque
  push sur `main` et chaque pull request.
- **Lockfile** : généré par **npm 11** (Node 24). npm 10 le juge désynchronisé et `npm ci` échoue
  — utiliser Node 24 en local comme en CI.
- ⚠️ **Contrainte de version** : ne pas redescendre `vite` en dessous de `6` — `vitest 4` l'exige
  en peer dependency. C'est ce qui avait cassé la CI une semaine en juillet 2026.

## Voir aussi

- [architecture.md](./architecture.md) — frontières système et décisions.
- [data-model.md](./data-model.md) — schéma, RLS, RPC, storage en détail.
- [integration.md](./integration.md) — ce que Socle promet aux consommateurs de ses APIs.
- [roadmap.md](./roadmap.md) — évolutions envisagées.
