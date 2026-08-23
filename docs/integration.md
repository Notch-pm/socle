# Intégration avec Socle

> **Public** : équipes consommatrices (Ariane, Clara, Iris, partenaires) · **Question traitée** :
> comment consommer les API de Socle correctement, sans rien casser lors d'une évolution ? ·
> **Dernière mise à jour** : 2026-08-12

Socle est le référentiel central de la gamme : organisations, démarches, types de pièce
justificative, quartiers et usagers. Il expose deux API REST **versionnées** (`/v1`), en HTTPS,
authentifiées par clé :

| API | Rôle | URL de base |
|---|---|---|
| `public-api` | Lecture seule du référentiel (organisations, catégories, démarches, types de PJ, quartiers, URL signées de documents) | `{SUPABASE_URL}/functions/v1/public-api/…` |
| `contacts-api` | Lecture/écriture des **usagers** — **aucune suppression** (`DELETE` → 405) | `{SUPABASE_URL}/functions/v1/contacts-api/…` |

`{SUPABASE_URL}` = URL du projet Supabase de Socle.

⚠️ **Ce document ne liste pas les endpoints, paramètres ou schémas de réponse** — c'est la
propriété exclusive des OpenAPI publiés par chaque fonction, consultables en HTML (Redoc) sur les
deux routes **publiques** de l'app Socle :

- `/api-doc` — référentiel (`public-api`)
- `/api-doc-usagers` — usagers (`contacts-api`)

## Obtenir une clé

Une clé est générée par un **super admin Socle**, dans la section « API publique » de la page de
paramétrage d'une organisation racine. Le secret (`sk_live_…`) s'affiche **une seule fois** à la
création — Socle ne le stocke jamais en clair (haché SHA-256 en base). À conserver côté
consommateur dès l'affichage. Une clé est révocable à tout moment et peut porter une date
d'expiration optionnelle.

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

## Modèle mental des périmètres

Une clé est **liée à une organisation racine**, ou **plateforme** (aucune organisation associée).
Le périmètre servi diffère selon l'API, car les deux référentiels n'ont pas la même granularité
(les organisations forment un arbre, les usagers sont rattachés à une seule racine) :

| Type de clé | `public-api` | `contacts-api` |
|---|---|---|
| **Liée** à une organisation racine | La racine **et tout son sous-arbre** | La racine **seule** (les usagers y sont directement rattachés) |
| **Plateforme** (`organization_id` NULL) | **Toutes** les organisations | Exige l'en-tête **`X-Organization-Id`** à chaque appel (id d'une organisation quelconque, résolu jusqu'à sa racine) |

Deux conséquences concrètes de la clé plateforme :

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

- [ ] Clé obtenue auprès d'un super admin Socle, avec le bon scope (`read`, `contacts`, `smtp`)
- [ ] Secret stocké côté serveur uniquement, jamais exposé à un client public
- [ ] En-tête `Authorization: Bearer <clé>` sur chaque appel
- [ ] Clé plateforme sur `contacts-api` : en-tête `X-Organization-Id` envoyé systématiquement
- [ ] Schémas des endpoints relus sur `/api-doc` / `/api-doc-usagers` avant intégration
- [ ] Champs de réponse inconnus tolérés (pas de désérialisation stricte qui casserait sur ajout)
- [ ] `internal_notes` jamais retransmise à un usager final
- [ ] 404 traité comme « rien à afficher », pas comme une erreur technique à remonter
- [ ] `api-changelog.md` surveillé pour les évolutions

## Erreurs types

- **401** — clé absente, révoquée ou expirée.
- **403** — scope manquant (`contacts` requis sur `contacts-api`).
- **400** — en-tête `X-Organization-Id` manquant ou invalide (clé plateforme, `contacts-api`).
- **404** — ressource hors du périmètre de la clé, ou inexistante.
- **409** — conflit d'unicité (SIRET déjà utilisé, référence externe déjà prise).

## Voir aussi

- [api-changelog.md](./api-changelog.md) — journal daté des évolutions de contrat
- [architecture.md](./architecture.md) — frontières et modèle de sécurité de Socle
- [data-model.md](./data-model.md) — tables, contraintes et RLS derrière ces API
- [../README.md](../README.md) — porte d'entrée du projet
