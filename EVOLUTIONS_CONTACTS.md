# Évolutions souhaitées de l'API contacts (retours de l'intégration Clara)

Liste tenue à l'occasion du chantier « Clara délègue ses usagers au Socle »
(2026-07-16). Le filtre `email` (égalité exacte insensible à la casse) a été
ajouté à `GET /v1/contacts` dans ce chantier ; le reste est à prioriser.

## Recherche / lecture

- **Recherche par téléphone** (mobile ou fixe, normalisation des espaces/points)
  et **par SIRET** — aujourd'hui seuls `display_name` (search) et `email` sont
  interrogeables ; le rapprochement d'un expéditeur qui n'écrit pas depuis son
  email connu reste manuel.
- **Pagination avec total** (`X-Total-Count` ou enveloppe `{items, total}`) et/ou
  curseur — l'annuaire Clara pagine à l'aveugle (bouton « Suivant » tant que la
  page est pleine).
- **Lecture par lot** (`GET /v1/contacts?ids=…`) pour afficher les fiches de
  plusieurs participants sans N appels.

## Modèle

- **Quartiers + géocodage** : traité comme phase 2 dédiée — voir
  `references/clara-quartiers/README.md` (lat/lon sur contacts, table quartiers,
  rattachement automatique, filtre et stats par quartier, UI d'import GeoJSON).
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
