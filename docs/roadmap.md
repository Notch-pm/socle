# Roadmap

> **Public** : tous (devs Socle, équipes consommatrices) · **Question traitée** : quelles
> évolutions sont envisagées, et lesquelles ont déjà été livrées ? · **Dernière mise à jour** :
> 2026-08-12

Liste d'**intentions**, pas d'engagements — sauf mention explicite d'une date de livraison.
Née du chantier « Clara délègue ses usagers au Socle » (2026-07-16), enrichie depuis. Pour ce qui
existe réellement aujourd'hui : [architecture.md](./architecture.md),
[data-model.md](./data-model.md), et les OpenAPI (`/api-doc`, `/api-doc-usagers`).

## Référentiel usagers (`contacts-api`)

### Livré

- **Filtre `email`** (égalité exacte insensible à la casse) sur `GET /v1/contacts` — 2026-07-16.
- **Recherche par téléphone** (filtre `phone`, normalisé, mobile + fixe) et **rapprochement
  d'identités** (`POST /v1/contacts/match` : email, téléphone, SIRET, noms exacts/similaires via
  pg_trgm, date de naissance en renfort ; candidats scorés avec `reasons`) — 2026-07-17. Un
  consommateur qui maintenait un scoring de doublons local peut le remplacer par un appel unique
  à `/match`.
- **Quartiers et géocodage** — 2026-07-17, complétés 2026-07-18. Détail dans la section
  [Quartiers](#quartiers) ci-dessous.

### Envisagé

- **Pagination avec total** (`X-Total-Count` ou enveloppe `{items, total}`) et/ou curseur — un
  consommateur qui liste tous les contacts pagine aujourd'hui à l'aveugle (page pleine ⇒ page
  suivante).
- **Lecture par lot** (`GET /v1/contacts?ids=…`) pour résoudre plusieurs fiches en un appel plutôt
  que N.
- **État civil étendu** (ex-« fichier domiciliaire ») : date de décès, situation familiale, dates
  de mariage/PACS, dates d'arrivée/départ dans la commune, nationalité — sans équivalent dans le
  modèle Socle actuel.
- **Adresse structurée** (numéro, BTQ, bâtiment, appartement, complément) en plus des deux lignes
  à plat, si la fiabilité du géocodage venait à l'exiger.
- **Webhooks de modification** (contact créé/modifié/archivé), pour permettre aux applications
  consommatrices d'invalider leurs caches sans interroger le référentiel en boucle.
- **Civilité optionnelle** : à trancher. Elle est aujourd'hui obligatoire pour tout contact
  `personne`, ce qui empêche l'auto-création d'un contact depuis un simple email entrant.
  Alternative envisagée : la rendre optionnelle avec un suivi de complétude, plutôt que des
  valeurs devinées.
- **Filtre `siret` dédié** sur `GET /v1/contacts` : reste possible si un consommateur en a besoin
  (le SIRET est déjà interrogeable via `/match`).

## Quartiers

### Livré

- Modèle de données, UI Socle (carte Leaflet, import GeoJSON, stats, recalcul) et exposition
  catalogue via `public-api` (`GET /v1/quartiers`), géocodage BAN et rattachement automatique via
  `contacts-api` — 2026-07-17.
- Objet **`quartier`** résolu (`{id, name, color}`) embarqué dans la fiche contact de
  `contacts-api`, évitant un second appel pour traduire l'UUID en libellé ; import GeoJSON en
  **mode remplacement** (le fichier importé fait foi) — 2026-07-18.

### Envisagé

- **Consommation côté Clara** : filtre par quartier dans son UI (le paramètre `quartier_id` est
  déjà disponible sur `GET /v1/contacts`).
- **Stats par quartier** non encore exposées par l'API — la RPC `stats_contacts_by_quartier`
  existe côté base et alimente déjà l'UI Socle ; reste à l'exposer via un endpoint public.
- **Backfill de géocodage** des contacts créés avant l'introduction du géocodage automatique
  (adresse renseignée mais `address_lat`/`address_lon` restés nuls).

## APIs / plateforme

- **Vérification des scopes dans `public-api`** : **livré le 2026-08-12** — le scope `read` est
  vérifié (403 sinon), après audit des clés existantes (aucune intégration impactée).
- **`GET /v1/organization-procedures`** : le sérialiseur (`serializeOrganizationProcedure`,
  `OrganizationProcedureDto`) existe déjà dans `public-api` mais n'est branché sur aucun
  endpoint — à ne pas annoncer aux consommateurs tant qu'il n'est pas exposé.
- **Publication du guide d'intégration hors du repo** : `docs/integration.md` est aujourd'hui
  interne au repo Socle ; à publier ailleurs (portail, section in-app) si les équipes
  Ariane/Clara/Iris n'y ont pas accès.

## Frontend Socle

- **Sélecteur global d'organisation courante** (pour un utilisateur membre de plusieurs
  organisations), plutôt que le choix implicite actuel.
- **UI de consultation des contacts dans Socle** : le référentiel des usagers n'a aujourd'hui
  aucun écran dédié côté Socle, uniquement `contacts-api`.
- **Primitives du Design System manquantes** dans `src/components/ui/` : Select, Toast, Skeleton,
  entre autres — à ajouter au fil des besoins plutôt qu'en une fois.
