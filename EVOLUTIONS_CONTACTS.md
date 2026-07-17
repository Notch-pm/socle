# Évolutions souhaitées de l'API contacts (retours de l'intégration Clara)

Liste tenue à l'occasion du chantier « Clara délègue ses usagers au Socle »
(2026-07-16). Le filtre `email` (égalité exacte insensible à la casse) a été
ajouté à `GET /v1/contacts` dans ce chantier ; le reste est à prioriser.

## Recherche / lecture

- **Recherche par téléphone** et **rapprochement d'identités** : livrés le
  2026-07-17 — filtre `phone` (normalisé, mobile + fixe) sur `GET /v1/contacts`
  et endpoint `POST /v1/contacts/match` (email, téléphone, SIRET, noms exacts et
  similaires — pg_trgm/unaccent —, date de naissance en renfort ; candidats
  scorés avec `reasons`). Voir la feature « API usagers » de CLAUDE.md. Clara
  peut remplacer son scoring local (`src/lib/contact-duplicates.ts`) par un
  appel unique à `/match`. Un filtre `siret` dédié sur la liste reste possible
  si un consommateur en a besoin (le SIRET est déjà interrogeable via `/match`).
- **Pagination avec total** (`X-Total-Count` ou enveloppe `{items, total}`) et/ou
  curseur — l'annuaire Clara pagine à l'aveugle (bouton « Suivant » tant que la
  page est pleine).
- **Lecture par lot** (`GET /v1/contacts?ids=…`) pour afficher les fiches de
  plusieurs participants sans N appels.

## Modèle

- **Quartiers + géocodage** : livrés le 2026-07-17 (DB + UI Socle + API — feature
  « Quartiers » de CLAUDE.md) : quartiers via `GET /v1/quartiers` (public-api),
  géocodage BAN au create/patch, `quartier_id` dans la fiche et en filtre
  (contacts-api). Restent : consommation Clara, et **stats par quartier** non
  exposées par l'API (RPC `stats_contacts_by_quartier` disponible).
- **État civil étendu** (ex-« fichier domiciliaire » de Clara) : date de décès,
  situation familiale, dates de mariage/PACS, dates d'arrivée/départ dans la
  commune, nationalité — supprimés de Clara sans équivalent Socle à ce jour.
- **Adresse structurée** (numéro, btq, bâtiment, appartement, complément) en
  plus des deux lignes à plat, si le géocodage fiable le requiert.

## Robustesse / intégration

- **Webhooks de modification** (contact créé/modifié/archivé) pour permettre aux
  applications consommatrices d'invalider leurs caches.
- **Création « personne » sans civilité ?** À trancher : la civilité obligatoire
  empêche toute auto-création de contact depuis un email entrant (Clara a choisi
  l'auto-rapprochement seul, création manuelle par l'agent). Alternative : la
  rendre optionnelle avec complétude suivie, plutôt que des valeurs devinées.
