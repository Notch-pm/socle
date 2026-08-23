# Brief d'intégration Socle — agents des applications consommatrices

> **Public** : agents Claude (et devs) des repos **Clara**, **Ariane**, **Iris** ·
> **Nature** : instantané daté du **2026-08-12**, non maintenu — les références vivantes sont
> les OpenAPI publiés et `docs/integration.md` du repo Socle · **Contact** : super admin Socle.

## L'essentiel en quatre points

1. **Socle est la source de vérité** de la gamme Edilumen pour : organisations (hiérarchie),
   démarches (catalogue + activation), catégories, types de pièce justificative, quartiers
   (découpage territorial) et **référentiel des usagers**. Les applications consommatrices ne
   redéfinissent pas ces données : elles les consomment par API.
2. **Aucune migration de base de données n'est à faire côté consommateur.** Le référentiel vit
   dans Socle ; le travail côté Clara/Ariane/Iris est de l'**intégration API** — et, le cas
   échéant, la **décommission des copies locales** (tables, écrans, logique dupliquée).
3. **Deux APIs REST versionnées** (`/v1`), authentifiées par clé (`Authorization: Bearer sk_live_…`),
   serveur-à-serveur uniquement (jamais de clé dans un navigateur) :
   - `public-api` — référentiel, **lecture seule** — scope **`read`** requis ;
   - `contacts-api` — usagers, **lecture/écriture, aucune suppression** — scope **`contacts`** requis.
4. **La documentation de référence des endpoints est l'OpenAPI**, pas ce brief :
   - `https://qhrokbkyxgcvkbpmbmna.supabase.co/functions/v1/public-api/openapi.json`
   - `https://qhrokbkyxgcvkbpmbmna.supabase.co/functions/v1/contacts-api/openapi.json`
   - Rendu lisible (Redoc) : routes publiques `/api-doc` et `/api-doc-usagers` de l'app Socle.

## Changement de comportement du 2026-08-12 (le seul)

Le scope **`read` est désormais vérifié** par `public-api` : une clé qui ne le porte pas reçoit
`403`. Les clés actives ont été auditées avant déploiement — **aucune intégration existante
n'est impactée** (la clé plateforme de Clara porte `read` + `contacts`). Tout le reste du
contrat v1 est inchangé ; les OpenAPI ont aussi été complétés le même jour (en-tête
`X-Organization-Id`, paramètre `organization_id` des géométries de quartiers) sans changement
de comportement.

## Règles de contrat à respecter dans le code consommateur

- **Périmètres** : une clé **liée** à une organisation racine sert son sous-arbre (`public-api`)
  ou la racine seule (`contacts-api`). Une clé **plateforme** (sans organisation) exige l'en-tête
  **`X-Organization-Id`** sur chaque appel `contacts-api` (400 sinon ; l'id d'une
  sous-organisation est accepté et résolu vers sa racine), et le paramètre `organization_id`
  pour `GET /v1/quartiers?geometry=true`.
- **Hors périmètre = 404** (l'existence n'est pas révélée) — à traiter comme « rien à afficher »,
  pas comme une erreur technique. Exception connue : `documents/signed-url` répond 403.
- **Tolérer les champs inconnus** dans toutes les réponses : la politique de compatibilité v1
  est additive (nouveaux champs/filtres sans rupture) — une désérialisation stricte cassera.
- **`internal_notes` ne doit JAMAIS être retransmise à un usager final** (portail citoyen ou
  équivalent). L'API est serveur-à-serveur, pensée pour les applications côté agent.
- **Pagination** (`contacts-api`) : `limit`/`offset`, défaut 100, max 500, pas de total à ce
  jour. **`status` absent = tous les statuts** — passez `status=active` explicitement si vous ne
  voulez pas les archivés.
- **`form_schema`** (démarches) : la clé machine d'un champ est **`key`** (pas `id`) ; une pièce
  justificative référence un type via `documentTypeId` (→ `GET /v1/document-types`) ; le bloc
  « Lieu d'intervention » est une section ordinaire (aucun type dédié à détecter).
- **Documents** : les références `{path, name}` ne sont pas des URLs — échanger `path` contre
  une URL signée temporaire (5 min) via `GET /v1/documents/signed-url?path=…`.
- **Erreurs** : enveloppe `{ "error": { "code", "message" } }` (messages en français) ;
  `409` = conflit d'unicité (SIRET, référence externe) ; `405` = méthode non prévue (dont tout
  `DELETE` sur `contacts-api`).
- **Pas de copie maîtresse locale** : cache court + invalidation, jamais de réplication du
  référentiel dans la base du consommateur.

## Nouveautés récentes à exploiter (rappel)

- **2026-07-18** — fiche contact : objet **`quartier` `{id, name, color}`** résolu (plus besoin
  d'un second appel pour le libellé).
- **2026-07-17** — `POST /v1/contacts/match` (rapprochement d'identités, candidats scorés) ;
  filtres `phone` et `quartier_id` sur `GET /v1/contacts` ; `GET /v1/quartiers`
  (+`geometry=true`) ; géocodage BAN automatique côté Socle à l'écriture d'une adresse.
- **2026-07-16** — `contacts-api` v1, y compris les **relations entre contacts** (`relations` /
  `reverse_relations` ; une relation ne cible jamais une personne physique).

---

## Mission par application

### Clara — intégration active, backlog d'adoption

Statut au 2026-08-12 (corrigé le jour même sur retour de l'équipe Clara) : usagers délégués au
Socle ; **clé plateforme active** (`sk_live_cNB_…`, scopes `read` + `contacts`) ;
`X-Organization-Id` en place ; quartier affiché dans la fiche depuis le 2026-07-18.
**Déjà fait côté Clara** — ne pas refaire :

- le **rapprochement de doublons passe par `POST /v1/contacts/match` depuis le 2026-07-17**
  (`src/lib/contact-duplicates.ts` ne fait plus que construire le payload ; soldé dans son
  `docs/technical-debt.md`) ;
- le **module quartiers local est décommissionné depuis le 2026-07-16** (migration
  `20260716200000`) — seul l'affichage (`QuartierBadge`) subsiste, ce qui est le comportement
  attendu.

**Rien à faire suite au durcissement du 12/08.** Tâches restantes recommandées :

1. **Filtre par quartier** dans l'annuaire : paramètre `quartier_id` de `GET /v1/contacts`
   (UUID, ou littéral `null` pour « sans quartier ») — disponible, pas encore branché côté UI.
2. **Stats par quartier** : ne PAS les recalculer localement — l'endpoint public n'existe pas
   encore (la RPC existe côté Socle, exposition à venir, suivie dans la roadmap Socle).
3. **Audit de robustesse** : désérialisation tolérante aux champs inconnus, `status=active`
   explicite là où l'annuaire ne veut pas d'archivés, gestion 401/403/404/409.

### Ariane — intégration à (re)cadrer

Statut au 2026-08-12 : **aucune clé API active** pour Ariane (l'ancienne clé « Clara & Ariane »
a été révoquée le 2026-07-11). Si Ariane consomme des données Socle aujourd'hui, ce n'est pas
par ces APIs.

1. **Obtenir une clé** auprès du super admin Socle : rattachée à la racine concernée, scope
   `read` (+ `contacts` uniquement si Ariane manipule des usagers).
2. **Consommer le référentiel** : organisations (dont `email_sender_override` /
   `email_sender_name`, prévus pour l'expéditeur d'e-mails d'Ariane), catégories, démarches —
   `form_schema`, `requester_config`, `knowledge_base` sont transmis tels quels, leur structure
   est décrite dans le Redoc de `public-api` — types de PJ, quartiers.
3. **Documents de démarches** : passer par `signed-url`, ne jamais stocker d'URL signée (5 min).
4. Respecter la règle « pas de copie maîtresse locale ».

### Iris — onboarding

Peu de contexte d'intégration connu côté Socle à ce jour : parcours d'onboarding générique.

1. Cadrer le besoin (référentiel seul → scope `read` ; usagers → + scope `contacts`, avec la
   règle `internal_notes`).
2. Obtenir la clé auprès du super admin Socle, la stocker côté serveur uniquement.
3. Appliquer les règles de contrat ci-dessus dès le premier appel (champs inconnus tolérés,
   404 = vide, pagination explicite).

---

## Bloc à coller en tête de mission d'un agent consommateur

```
Contexte : cette application consomme le référentiel Socle (gamme Edilumen) par API.
- Doc de référence des endpoints : https://qhrokbkyxgcvkbpmbmna.supabase.co/functions/v1/public-api/openapi.json
  et .../contacts-api/openapi.json (rendu Redoc : routes /api-doc et /api-doc-usagers de l'app Socle).
- Auth : Authorization: Bearer <clé sk_live_…> (serveur-à-serveur ; scope read pour le
  référentiel, contacts pour les usagers). Clé plateforme ⇒ en-tête X-Organization-Id
  obligatoire sur contacts-api.
- Règles : tolérer les champs inconnus (contrat v1 additif) ; 404 = hors périmètre, à traiter
  comme « rien à afficher » ; internal_notes jamais montrée à un usager final ; status absent =
  tous les statuts ; pagination max 500 ; documents via signed-url (validité 5 min) ; aucune
  copie maîtresse locale du référentiel.
- Interdit : écrire dans le référentiel autrement que par contacts-api ; supprimer un usager
  (l'API n'a pas de DELETE : archiver via /archive).
```

## Suivi des évolutions

Toute évolution de contrat est tracée, datée, dans **`docs/api-changelog.md`** du repo Socle
(`github.com/Notch-pm/socle`). Si votre équipe n'a pas accès à ce repo, demandez au super admin
Socle la publication du changelog et du guide d'intégration sur un support accessible.
