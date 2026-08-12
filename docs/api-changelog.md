# Journal des évolutions des API publiques

> **Public** : équipes consommatrices (Ariane, Clara, Iris, partenaires) · **Question traitée** :
> quand un contrat d'API a-t-il changé, et comment ? · **Dernière mise à jour** : 2026-08-12

Journal **append-only** : chaque évolution de la surface de contrat des deux API publiques
(`public-api`, `contacts-api`) — endpoint, paramètre, champ de réponse, comportement
d'authentification — ajoute une entrée datée en tête de liste. Une entrée n'est jamais réécrite ;
une correction s'ajoute sous une nouvelle date. Politique de compatibilité et obligations
consommateur : [integration.md](./integration.md#politique-de-compatibilité-v1).

Format d'une entrée : `## AAAA-MM-JJ — <api> — ajout|correctif|rupture`

---

## 2026-08-12 — public-api — correctif

Le scope **`read`** est désormais **vérifié** : une clé qui ne le porte pas reçoit `403
forbidden` sur tout endpoint authentifié de `public-api` — comportement aligné sur le contrat
documenté (`contacts-api` vérifiait déjà son scope `contacts`). Audit préalable : toutes les
clés actives portaient `read`, aucune intégration existante n'est impactée.

## 2026-08-12 — public-api & contacts-api — correctif

Documentation : l'en-tête `X-Organization-Id` (`contacts-api`, clé plateforme) et le paramètre
`organization_id` de `GET /v1/quartiers?geometry=true` (`public-api`, clé plateforme) sont ajoutés
aux OpenAPI publiés. Les deux existaient déjà en comportement depuis le 2026-07-17 ; seule leur
documentation était manquante. **Aucun changement de comportement.**

## 2026-07-18 — contacts-api — ajout

Objet `quartier` (`{ id, name, color }`) résolu et ajouté à la fiche contact
(`GET /v1/contacts`, `GET /v1/contacts/{id}`, `POST /v1/contacts/match`), en complément du champ
`quartier_id` déjà présent. Évite un second appel pour afficher le libellé du quartier. Champ
additif — non-ruptif.

## 2026-07-17 — public-api & contacts-api — ajout

- **Clé API plateforme** (`organization_id` NULL) : périmètre global sur `public-api` ; sur
  `contacts-api`, en-tête `X-Organization-Id` requis à chaque appel.
- `contacts-api` : `POST /v1/contacts/match` (rapprochement d'identités) ; filtres `phone` et
  `quartier_id` sur `GET /v1/contacts` ; géocodage automatique (BAN) à la création/modification
  d'une adresse.
- `public-api` : `GET /v1/quartiers` (option `geometry=true` pour les polygones GeoJSON).

## 2026-07-16 — contacts-api — ajout

Première version de l'API usagers : `GET`/`POST`/`PATCH` sur `/v1/contacts` (pas de `DELETE`),
`archive`/`restore`, relations entre contacts, catalogue de rôles (`GET /v1/contact-roles`),
filtre `email` sur `GET /v1/contacts`.

## 2026-07-11 — public-api — ajout

Première version de l'API référentiel : organisations (dont `tree=true`), catégories, démarches
(filtres `category_id`, `type`, `enabled_for`), types de pièce justificative, URL signée de
documents.

## Voir aussi

- [integration.md](./integration.md) — comment consommer ces API
- [../README.md](../README.md) — porte d'entrée du projet
