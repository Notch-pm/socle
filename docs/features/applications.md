# Feature : applications et abonnements (`applications`, `organization_applications`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

**Une clé par application, bornée par abonnement** (décision PO du 2026-09-08, contrat
public-api 1.18.0 / contacts-api 1.1.0 / ai-api 1.2.0 — rupture pour les clés plateforme, rien
n'étant en production).

- `applications` = le **registre** (`id` de la forme de `consumer`, `name`, `scope` :
  `abonnement` ou `plateforme`). Seed `nora`, `iris`, `clara`, `socle` (plateforme : la clé
  de `translate-labels` sert toute racine). `api_keys.consumer` est une **FK** vers ce registre
  (plus de texte libre : une faute de frappe ne crée plus un consommateur fantôme dans le journal
  IA) ; CHECK `api_keys_platform_requires_consumer` (une clé plateforme vivante porte une
  application ; révoquée, dispensée) ; CHECK `scopes <@ '{read,contacts,smtp,ai,audience,integrations}'`.
- `organization_applications (racine, application)` = l'**abonnement**, coché par le super admin
  dans la section « Applications souscrites » (`ApplicationsSection`). C'est **tout** l'onboarding
  côté clés : aucun secret ne circule. RLS écriture super admin (décision commerciale), lecture
  `has_org_access OR is_admin_of_self_or_ancestor`. ⚠️ La migration a abonné **toutes les racines
  existantes à toutes les applications** : aucune régression le jour du déploiement ; les suivantes
  sont opt-in.
- **Périmètre d'une clé plateforme** = `application_scope_ids(app)` (service role seulement, motif
  `org_subtree_ids`) : les sous-arbres des racines abonnées ; toutes les organisations pour le scope
  `plateforme` ; `{}` pour une application inconnue. `public-api` : `GET /v1/organizations` rend
  exactement les clients de l'application, `/v1/portal/tenant` répond **404** pour une collectivité
  non abonnée (même message qu'un domaine inconnu) ; `contacts-api` / `ai-api` : racine résolue de
  `X-Organization-Id` hors abonnement → **404** ; `audience-api` : `tenant_id` hors périmètre →
  **404** (il vient du CORPS, l'appelant étant un relais multi-collectivités).
- ⚠️ **Une clé plateforme sans application → 403** (« son périmètre ne peut pas être déterminé ») :
  la décision vit dans `_shared/apiKeyAuth.ts` (`evaluateApiKey`, `scopeRequest`), **identique
  dans les quatre fonctions** (test d'identité `apiKeyAuth.test.ts`) — avant, le bloc était copié
  trois fois sans test. Pas de `_shared` de premier niveau : le déploiement MCP ne sait pas
  exprimer `../_shared/`.
- ⚠️ **Ordre de déploiement d'un changement de périmètre** : migration → abonnements et
  rattachement des clés dans l'UI → déploiement des fonctions. Inverser les deux derniers coupe le
  portail. Les clés d'avant le registre se rattachent depuis `/superadmin/applications`
  (« À rattacher », `useAssignApiKeyApplication`).
- UI : `src/features/superadmin/applications/` (`useApplications.ts`, `ApplicationsPage` —
  une `ApiKeysList` par application + « Nouvelle application »), `ApiKeyFormDialog` (sélecteur
  d'application, requis pour une clé plateforme et pour le scope `ai`), `ApiKeysList` affiche les
  **cinq** scopes et l'application. Les clés **liées** (partenaires) ne changent pas.
- Migration `applications_et_abonnements` ; changelog du 2026-09-08. **Hors dépôt** : Iris et
  Clara doivent créer leurs tenants à la synchronisation (leur clé rend exactement leurs clients),
  Nora prendre une clé d'ingestion Iris plateforme.
