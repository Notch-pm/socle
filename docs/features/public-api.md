# Feature : API publique (lecture seule) — `public-api`

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

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
  la page **`/superadmin/applications`** (`ApplicationsPage`, une liste par application ; carte de
  comptage sur le tableau de bord). ⚠️ Depuis le 2026-09-08 une clé plateforme est **rattachée à une
  application** et ne voit que les collectivités **abonnées** — voir feature « Applications et
  abonnements » ; « périmètre = toutes les organisations » n'existe plus que pour le Socle lui-même.
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
  héritage résolu — logos, favicon et couleurs ; scope `read`), `organizations/{id}/agent-guidance`
  (**recommandations aux agents** de la racine, 2026-09-19 — interne, jamais au portail ; scope
  `read`, rien d'écrit = 200 `configured: false`), `organizations/{id}/smtp` (**serveur
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
  **Où on la trouve** : pied du rail de l'app (`Sidebar`) et groupe « Documentation des API » du
  menu superadmin (`SuperAdminSidebar`), tous deux nourris par le catalogue
  `src/features/public-api-docs/apiDocLinks.ts` (**nouvel onglet**, annoncé dans l'intitulé) —
  plus les liens de la section « API publique » d'`OrgSettingsPage`.
- **Gestion des clés (super admin)** : section **« API publique »** de `OrgSettingsPage`
  (**racine uniquement**), à côté de SMTP / catalogue / types de PJ, et page **« Applications »**
  (`/superadmin/applications`, `ApiKeysList` montée une fois par application). Les deux partagent `ApiKeysList` (liste + révocation via
  `AlertDialog`) + `ApiKeyFormDialog` (**génération + hachage navigateur** via `apiKeys.ts`, secret
  **affiché une seule fois**) + `useApiKeys.ts` (`useApiKeys`/`useCreateApiKey`/`useRevokeApiKey`,
  paramétrés par un `ApiKeyOwner` = id de racine **ou `null` = plateforme** (`organization_id IS
  NULL`) ; la liste **ne sélectionne pas** `key_hash`). En mode plateforme, le dialogue affiche un
  avertissement « périmètre global » et exige une **case d'assentiment** avant de créer (testé,
  `ApiKeyFormDialog.test.tsx`). `created_by` = `profile.id`.
- Logique pure **testée** : `_shared/{serializers,scope,errors,openapi}.ts`,
  `superadmin/organizations/apiKeys.ts` (génération/hachage, `apiKeyStatus`, `countActiveApiKeys`).
