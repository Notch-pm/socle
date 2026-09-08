# Intégration avec Socle

> **Public** : équipes consommatrices (Ariane, Clara, Iris, partenaires) · **Question traitée** :
> comment consommer les API de Socle correctement, sans rien casser lors d'une évolution ? ·
> **Dernière mise à jour** : 2026-09-08

Socle est le référentiel central de la gamme : organisations, démarches, types de pièce
justificative, quartiers et usagers. Il expose trois API REST **versionnées** (`/v1`), en HTTPS,
authentifiées par clé :

| API | Rôle | URL de base |
|---|---|---|
| `public-api` | Lecture seule du référentiel (organisations, catégories, démarches, types de PJ, quartiers, URL signées de documents) | `{SUPABASE_URL}/functions/v1/public-api/…` |
| `contacts-api` | Lecture/écriture des **usagers** — **aucune suppression** (`DELETE` → 405) | `{SUPABASE_URL}/functions/v1/contacts-api/…` |
| `ai-api` | **Guichet IA** : le Socle détient la clé du fournisseur LLM, compte les jetons et refuse au-delà du plafond | `{SUPABASE_URL}/functions/v1/ai-api/…` |

`{SUPABASE_URL}` = URL du projet Supabase de Socle.

⚠️ **Ce document ne liste pas les endpoints, paramètres ou schémas de réponse** — c'est la
propriété exclusive des OpenAPI publiés par chaque fonction, consultables en HTML (Redoc) sur les
routes **publiques** de l'app Socle :

- `/api-doc` — référentiel (`public-api`)
- `/api-doc-usagers` — usagers (`contacts-api`)
- `/api-doc-ia` — guichet IA (`ai-api`)

## Obtenir une clé

Deux sortes de clés, générées par un **super admin Socle** :

- **Application de la gamme** (Nora, Iris, Clara…) : **une clé par application**, créée sur
  `/superadmin/applications`, posée une fois dans le projet de l'application. Son périmètre est
  l'ensemble des collectivités **abonnées** à l'application — cochées par le super admin sur la fiche
  de chaque client. À l'arrivée d'un client, l'application n'a rien à recevoir : elle le voit dès
  qu'il est abonné.
- **Partenaire** : une clé **liée à une organisation racine**, créée dans la section « API
  publique » de la page de cette organisation ; périmètre = la racine et sa descendance.

Le secret (`sk_live_…`) s'affiche **une seule fois** à la création — Socle ne le stocke jamais en
clair (haché SHA-256 en base). À conserver côté consommateur dès l'affichage. Une clé est
révocable à tout moment et peut porter une date d'expiration optionnelle.

Utilisation : en-tête `Authorization: Bearer <clé>` sur chaque requête.

```
GET /v1/organizations HTTP/1.1
Host: {SUPABASE_URL}
Authorization: Bearer sk_live_...
```

## Scopes

Une clé porte un ou plusieurs scopes :

| Scope | Donne accès à | État |
|---|---|---|
| `read` | Référentiel (`public-api`) | Vérifié depuis le 2026-08-12 — une clé sans ce scope reçoit **403** sur tout endpoint authentifié de `public-api`. |
| `contacts` | Usagers (`contacts-api`) | Vérifié — une clé sans ce scope reçoit **403** sur tout appel à `contacts-api` (données personnelles). |
| `smtp` | Serveur d'envoi (`GET /v1/organizations/{id}/smtp`) | Vérifié — **seule ressource qui sert un secret** (mot de passe du relais). Le scope `read` ne suffit pas : à demander explicitement. La réponse est le relais **applicable** à l'organisation (le sien, ou celui dont elle hérite) ; `source_organization_id` dit lequel. |
| `ai` | Guichet IA (`ai-api`) | Vérifié depuis le 2026-08-29 — **scope facturé**, réservé aux applications de la gamme, jamais à un partenaire. La clé doit en outre porter une **application imputable** (« Application imputable » à la création) : sans elle, l'appel est refusé, parce qu'une dépense sans imputation ne peut être ni facturée ni expliquée. |

## Modèle mental des périmètres

Une clé est **liée à une organisation racine**, ou **plateforme** (aucune organisation associée,
mais une **application** du registre). Le périmètre servi diffère selon l'API, car les deux
référentiels n'ont pas la même granularité (les organisations forment un arbre, les usagers sont
rattachés à une seule racine) :

| Type de clé | `public-api` | `contacts-api` / `ai-api` |
|---|---|---|
| **Liée** à une organisation racine | La racine **et tout son sous-arbre** | La racine **seule** (les usagers y sont directement rattachés) |
| **Plateforme** (`organization_id` NULL, application `X`) | Les racines **abonnées à X** et leur descendance — depuis le 2026-09-08, plus jamais « toutes » | Exige l'en-tête **`X-Organization-Id`** à chaque appel (id d'une organisation quelconque, résolu jusqu'à sa racine) ; racine **non abonnée à X** → **404** |

Trois conséquences concrètes de la clé plateforme :

- Une clé plateforme **sans application** est refusée (**403**) : sans application, pas de
  périmètre. Une application inconnue du registre ne voit rien.
- `contacts-api` sans `X-Organization-Id` → **400** sur tout endpoint concerné.
- `public-api` : `GET /v1/quartiers?geometry=true` exige alors le paramètre `organization_id`
  (sinon 400) — les géométries n'ont de sens que rapportées à une organisation.

## Garanties d'isolation

Les deux API lisent avec la clé de service (hors RLS), mais reconstruisent le périmètre à chaque
requête à partir de la clé d'authentification — aucune fuite entre organisations. Étanchéité
vérifiée bout en bout (tests automatisés + parcours réels, juillet 2026 — historique dans
[api-changelog.md](./api-changelog.md)).

- **Hors périmètre = 404**, pas 403 : l'existence d'une ressource inaccessible n'est jamais
  révélée.
- **Exception connue** : `GET /v1/documents/signed-url` répond **403** (et non 404) quand le
  chemin demandé sort du périmètre de la clé.

## Format d'erreurs

Toutes les erreurs suivent la même enveloppe, messages en français :

```json
{ "error": { "code": "not_found", "message": "Ressource introuvable." } }
```

| HTTP | `code` | Cas typique |
|---|---|---|
| 400 | `bad_request` | Paramètre manquant ou invalide |
| 401 | `unauthorized` | Clé absente, inconnue, révoquée ou expirée |
| 403 | `forbidden` | Scope manquant, ou chemin hors périmètre sur `signed-url` |
| 404 | `not_found` | Ressource hors périmètre ou inexistante |
| 405 | `method_not_allowed` | Méthode non prévue (ex. `DELETE` sur `contacts-api`) |
| 409 | `conflict` | Conflit d'unicité (SIRET, référence externe déjà prise) |
| 500 | `internal_error` | Erreur serveur — à signaler |

## Ce que le guichet IA voit, et ce qu'il ne garde pas

Depuis le 2026-08-29, une application de la gamme n'appelle plus le fournisseur LLM elle-même :
elle **compose son prompt** et le confie à `ai-api`. Trois conséquences pour un consommateur :

1. **La clé du fournisseur ne vous est jamais distribuée.** Une application compromise ne la
   compromet pas.
2. **Le budget est celui de la COLLECTIVITÉ, pas le vôtre.** Toutes les applications de la gamme
   puisent au même plafond mensuel ; le journal attribue la dépense à la vôtre, le compteur et le
   plafond restent globaux. Un appel émis au nom d'une sous-organisation débite sa racine.
3. **Le Socle voit le prompt ; il ne le garde pas.** Aucune colonne du journal ne peut porter un
   prompt ou une réponse, l'appel fournisseur est isolé dans un module sans accès base ni
   journalisation, et des tests interdisent toute trace du contenu. C'est une promesse
   *vérifiable*, pas une déclaration — mais elle porte sur la **persistance**, pas sur
   l'exposition : le contenu transite bel et bien, comme il transitait déjà vers le fournisseur.

⚠️ **Un garde-fou de CADENCE, distinct du plafond.** Le rythme est borné **par agent
(`actor_id`) et par nature d'appel** — un échange conversationnel suit une cadence humaine, un
lot d'OCR une cadence machine :

| Nature | Par agent | Sans agent identifié |
|---|---|---|
| Conversationnel (`/v1/completions`) | 20 / minute | 120 / minute |
| Lot (`/v1/ocr`) | 60 / minute | 360 / minute |

Les deux natures ont des compteurs **séparés** : un lot de documents ne consomme pas le budget
de questions du même agent. Au-delà, l'appel est refusé par un `429` de code
**`ai_rate_limited`**, avec un en-tête `Retry-After`. Le crédit est
intact : il n'y a rien à demander, seulement à attendre. Le compteur retient les **tentatives**,
refus de plafond compris — un consommateur déjà refusé qui continue d'appeler finit donc freiné.
Prévoyez un recul (*backoff*) qui respecte `Retry-After` plutôt qu'une relance immédiate.

⚠️ **Chaîne de délais, à ne pas inverser** : le fournisseur expire à 55 s, le Socle à 60 s.
Réglez le vôtre **au-dessus** de 60 s. Inversée, votre application abandonne des appels que le
Socle termine et facture — et l'utilisateur, en réessayant, paie deux fois. Il n'y a pas de clé
d'idempotence : elle exigerait de stocker la réponse, ce que le point 3 interdit.

### Deux dépenses, un seul crédit

`POST /v1/completions` fait parler le modèle ; `POST /v1/ocr` lit un document scanné. Elles n'ont
ni la même unité chez le fournisseur (des jetons, des pages) ni la même entrée, mais elles
passent par **la même réservation, le même compteur et le même plafond**. Une collectivité a un
crédit, pas deux — et l'éditeur un total, pas deux à additionner.

**N'appelez `/v1/ocr` que pour ce qui l'exige.** Un PDF avec couche texte, un DOCX, un ODT, un
RTF ou un TXT s'extraient chez vous, sans IA et sans crédit. Réservez le guichet aux PDF scannés
et aux images — c'est-à-dire aux cas où il n'y a rien à extraire autrement.

⚠️ **Le document ne transite pas par le Socle** : vous transmettez une **URL https signée et
courte** que le fournisseur va chercher. Émettez-la juste avant l'appel, avec la durée de vie la
plus courte que votre stockage permette — c'est un droit d'accès qui circule. Le Socle refuse
tout autre schéma, les identifiants dans le lien, et un lien de plus de 4096 caractères.

⚠️ **La réservation part de `page_count_hint`, le règlement retient le texte extrait.** Une page
blanche ne coûte donc presque rien, et sous-déclarer les pages ne fait rien gagner — au-delà de
100 pages annoncées, l'appel est refusé (`payload_too_large`) : scindez le document.

### Quand vous parsez au lieu d'afficher

`response_format: "json"` contraint la sortie à du JSON **syntaxiquement valide**. Deux règles
qui vous concernent :

- **Le mot « json » doit figurer** dans `system` ou dans un message — exigence du mode JSON du
  fournisseur, que le Socle vérifie **avant toute dépense**. Décrivez-y la structure attendue.
- **Valide ne veut pas dire conforme** : aucun schéma n'est imposé au modèle. Revalidez le
  contenu contre vos propres règles, exactement comme vous le feriez d'une saisie utilisateur.
  Le Socle décide du coût ; le sens reste votre affaire.

`tools` et `tool_choice` restent refusés : chaque outil est un second chemin d'accès aux
données, non audité, et ruinerait l'argument « le consommateur compose son contexte, le Socle ne
fait que relayer ».

## Données sensibles

`contacts-api` **expose `internal_notes`** dans chaque fiche contact — délibéré, cette API est
serveur-à-serveur, pensée pour les applications côté agent. **Règle d'or : ne jamais retransmettre
ce champ à un usager final** (portail citoyen ou équivalent). Plus largement, les fiches contact
portent des données personnelles (email, téléphone, adresse, date de naissance) : à manipuler avec
la même prudence côté consommateur qu'en base chez Socle.

## JSON possédés : `form_schema`, `requester_config`, `knowledge_base`

`public-api` transmet ces trois blocs **tels quels** (aucune transformation) ; leurs structures
sont documentées dans les schémas du Redoc de `public-api`, pas ici. Quatre règles utiles pour un
consommateur :

- La **clé machine** d'un champ de formulaire (`form_schema`) est **`key`**, pas `id`.
- Le bloc « Lieu d'intervention » est une **section ordinaire** pré-remplie — aucun type dédié à
  détecter structurellement.
- Un document référencé en `{path, name}` (pièce jointe de démarche, document de base de
  connaissances) n'est **pas une URL** : échangez `path` contre une URL signée temporaire (5 min)
  via `GET /v1/documents/signed-url?path=…`.
- **Tolérez les champs inconnus** dans ces objets — la politique de compatibilité (ci-dessous)
  s'appuie dessus pour évoluer sans rupture.

## Libellés traduits (`translations`) et langues d'une collectivité

Le référentiel est saisi **en français** : `name` porte toujours le libellé français. Une
collectivité peut activer d'autres langues ; les libellés traduits des **démarches** et des
**catégories** arrivent alors dans `translations`, indexés par code de langue (BCP 47).

- **Les langues activées** se lisent sur `GET /v1/portal/tenant` → `languages` (français toujours
  compris et en tête). Le réglage vit sur l'organisation **principale** : la liste est celle de la
  collectivité, héritage **déjà résolu**, même si le domaine visité désigne une sous-organisation.
- ⚠️ **Pas de clé `fr`** dans `translations` : le libellé français est `name`. La chercher, c'est
  ne rien trouver.
- ⚠️ **Une langue absente n'est pas un libellé vide** : repliez sur `name`. Afficher la chaîne
  vide d'une traduction manquante donne une carte de démarche sans titre.
- Une traduction peut exister dans une langue que la collectivité **n'affiche plus** (le réglage
  gouverne l'usage, pas la donnée) : n'affichez que les langues de `languages`.

## Particularités utiles

- **Pagination** (`contacts-api`, `limit`/`offset`) : défaut 100, **max 500**, pas de total à ce
  jour (pas de `X-Total-Count` ni d'enveloppe `{items, total}`).
- **Filtre `status`** absent sur `GET /v1/contacts` = **tous les statuts** (pas de défaut
  `active`) — précisez-le explicitement si vous ne voulez que les contacts actifs.
- **Objet `quartier`** (`{id, name, color}`) résolu directement dans la fiche contact, en
  complément de `quartier_id` — évite un second appel pour afficher un libellé.
- **Rapprochement de doublons** : `POST /v1/contacts/match` (lecture seule malgré le verbe POST,
  l'identité recherchée est trop riche pour une query string). Le `score` renvoyé sert au
  **classement au sein d'une même réponse**, ce n'est pas une probabilité absolue.
- **Géocodage** : Socle géocode automatiquement une adresse (BAN, IGN) côté serveur, en
  best-effort — un échec ne bloque jamais une création ou une modification.

## Politique de compatibilité v1

- **Évolutions additives uniquement** en v1 : nouveau champ optionnel en réponse, nouveau filtre,
  nouvel endpoint — ce sont des évolutions **non-ruptives**.
- **Jamais en v1** : suppression de champ, renommage, restriction du domaine de valeurs
  existant, changement de type. Une rupture de contrat passera par une v2, pas par une
  modification de la v1 en place.
- **Obligation côté consommateur** : ignorer les champs de réponse inconnus, pour absorber les
  ajouts sans rien casser de votre côté.
- Toute évolution de la surface de contrat (endpoint, paramètre, champ, comportement d'auth) est
  tracée dans [api-changelog.md](./api-changelog.md).

## Checklist d'intégration

- [ ] Clé obtenue auprès d'un super admin Socle, avec le bon scope (`read`, `contacts`, `smtp`, `ai`) — une clé **par application**, jamais par client
- [ ] Nouveaux clients découverts par `GET /v1/organizations` (la clé rend exactement les collectivités abonnées) plutôt que provisionnés à la main
- [ ] `ai-api` : délai du consommateur réglé **au-dessus de 60 s** (chaîne 55 < 60 < le vôtre)
- [ ] `ai-api` : `ai_quota_exceeded` et `ai_rate_limited` traités **séparément** (`Retry-After`)
- [ ] `/v1/ocr` : URL signée de courte durée, émise juste avant l'appel — et réservé aux PDF
      scannés et aux images (le reste s'extrait sans crédit)
- [ ] `response_format: "json"` : le mot « json » dans le prompt, et **revalidation** du JSON rendu
- [ ] Secret stocké côté serveur uniquement, jamais exposé à un client public
- [ ] En-tête `Authorization: Bearer <clé>` sur chaque appel
- [ ] Clé plateforme sur `contacts-api` : en-tête `X-Organization-Id` envoyé systématiquement
- [ ] Schémas des endpoints relus sur `/api-doc` / `/api-doc-usagers` / `/api-doc-ia` avant intégration
- [ ] Champs de réponse inconnus tolérés (pas de désérialisation stricte qui casserait sur ajout)
- [ ] `internal_notes` jamais retransmise à un usager final
- [ ] 404 traité comme « rien à afficher », pas comme une erreur technique à remonter
- [ ] `api-changelog.md` surveillé pour les évolutions

## Erreurs types

- **401** — clé absente, révoquée ou expirée.
- **403** — scope manquant (`contacts` requis sur `contacts-api`, `ai` sur `ai-api`), ou clé
  sans application imputable sur `ai-api`.
- **400** — en-tête `X-Organization-Id` manquant ou invalide (clé plateforme, `contacts-api`).
- **400 `payload_too_large`** — une requête qui achèterait un appel démesuré : trop de jetons en
  entrée (`/v1/completions`), plus de 100 pages annoncées (`/v1/ocr`). Le plafond mensuel ne
  borne pas le coût d'UN appel ; ceci si. Le geste attendu est de **scinder**, pas de réessayer.
- **404** — ressource hors du périmètre de la clé, ou inexistante.
- **409** — conflit d'unicité (SIRET déjà utilisé, référence externe déjà prise).
- **429** — deux refus partagent ce statut sur `ai-api`, et le `code` les distingue.
  `ai_quota_exceeded` : plafond mensuel atteint, le message nomme la date de renouvellement —
  **le relayer tel quel** plutôt que la recomposer, sans quoi deux calculs de période finissent
  par diverger et le message ment. `ai_rate_limited` : cadence dépassée, le crédit est intact,
  l'en-tête `Retry-After` donne les secondes à attendre.
- **502** — fournisseur LLM muet (`ai-api`). Son erreur brute n'est jamais relayée.
- **503** — plateforme sans fournisseur configuré (`ai-api`).

## Voir aussi

- [api-changelog.md](./api-changelog.md) — journal daté des évolutions de contrat
- [architecture.md](./architecture.md) — frontières et modèle de sécurité de Socle
- [data-model.md](./data-model.md) — tables, contraintes et RLS derrière ces API
- [../README.md](../README.md) — porte d'entrée du projet
