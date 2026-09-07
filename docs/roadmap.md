# Roadmap

> **Public** : tous (devs Socle, équipes consommatrices) · **Question traitée** : quelles
> évolutions sont envisagées, et lesquelles ont déjà été livrées ? · **Dernière mise à jour** :
> 2026-09-06

Liste d'**intentions**, pas d'engagements — sauf mention explicite d'une date de livraison.
Née du chantier « Clara délègue ses usagers au Socle » (2026-07-16), enrichie depuis. Pour ce qui
existe réellement aujourd'hui : [architecture.md](./architecture.md),
[data-model.md](./data-model.md), et les OpenAPI (`/api-doc`, `/api-doc-usagers`).

## Référentiel usagers (`contacts-api`)

### Livré

- **Filtre `email`** (égalité exacte insensible à la casse) sur `GET /v1/contacts` — 2026-07-16.
- **Recherche par téléphone** (filtre `phone`, normalisé, mobile + fixe) et **rapprochement
  d'identités** (`POST /v1/contacts/match` : email, téléphone, SIRET, noms exacts/similaires via
  pg_trgm, date de naissance en renfort ; candidats scorés avec `reasons`) — 2026-07-17.
  **Adopté par Clara le jour même** : son scoring local ne fait plus que construire le payload
  de `/match`.
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
- **Exposition de la charte graphique par `public-api`** : **livré le 2026-08-30** —
  `GET /v1/organizations/{id}/branding` sert la charte **résolue** (héritage appliqué)
  avec `source_organization_id`, scope `read`, contrat 1.5.0. Les colonnes
  brutes restent volontairement **hors** de `OrganizationDto` : une sous-organisation
  qui hérite les a nulles, et le consommateur peindrait du vide au lieu de la charte de sa
  collectivité.
- **Publication du guide d'intégration hors du repo** : `docs/integration.md` est aujourd'hui
  interne au repo Socle ; à publier ailleurs (portail, section in-app) si les équipes
  Ariane/Clara/Iris n'y ont pas accès.

## Catalogue de documents

### Livré

- **Exposition par `public-api`** (contrat 1.6.0) : catalogue `GET /v1/document-templates`
  (+ `/{id}`, filtre `type`), téléchargement par URL signée, et sélection **résolue** dans
  `Procedure.documents` — 2026-09-01.
- **Rattachement aux démarches** : bloc « Documents et courriers » de l'étape Communication, avec
  restriction de visibilité **par document** selon l'issue de la demande — 2026-09-01.
- **Modèle de données, bucket privé et UI Socle** (`/documents` côté admin, section « Documents »
  d'`OrgSettingsPage` côté superadmin) : dépôt de modèles `.doc`/`.docx`/`.odt` par organisation
  principale, qualifiés interne/externe/courrier, et **catalogue des variables** consultable depuis
  la liste — 2026-09-01.

### Envisagé

- **Catalogue des variables exposé par l'API** : `documentVariables.ts` vit côté front ; un
  consommateur qui voudrait valider un modèle avant fusion n'a pas la liste des jetons reconnus.
- **Sources de données des variables** : la plupart des variables publiées n'ont **pas** de source
  dans le Socle — les composantes d'adresse (numéro, BTQ, voie, complément, appartement, bâtiment)
  manquent à `contacts` (voir « Adresse structurée » ci-dessus), et toute la famille `demande.*`
  vit dans Ariane/Clara. Le catalogue est un **contrat de nommage** ; c'est l'aval qui fusionne.
  **`organisme.*` fait exception** : coordonnées et charte graphique sont déjà servies par le Socle
  (`GET /v1/organizations/{id}` et `…/branding`), donc immédiatement valorisables.
- **Contrôle des variables employées** dans un fichier déposé (extraction des jetons `{{…}}`,
  signalement des inconnus). Écarté : Word découpe volontiers une variable en plusieurs fragments
  XML — une détection naïve signalerait des variables absentes qui sont bien là — et `.doc`
  (binaire, non zippé) resterait hors de portée.

## Portail usagers (Nora) & site de démarches

Le portail usagers est un dépôt à part (`Notch-pm/Nora`, README en tête) ; sa feuille de route
vit ici parce que presque chaque étape commence par une capacité du Socle (une table, une route
d'API, un écran de paramétrage). Ordre de bataille tel qu'arrêté le 2026-09-05 — chaque étape
suppose la précédente.

### Livré

- **2026-09-05 — Résolution de tenant par domaine.** `organization_domains` (unique sur toute la
  plateforme), écran « Domaines du portail » (admin et superadmin), `GET /v1/portal/tenant`,
  `GET /v1/portal/procedures` (contrat 1.7.0). Nora : instance unique sans base de données,
  `portal-api` (edge function) qui seule détient la clé du Socle, développement local par
  `<label>.localhost`.
- **2026-09-05 — Éditeur du site de démarches** (« interface typée CMS ») dans le Socle :
  `portal_pages` (`draft` autosauvegardé / `published` explicite — sauvegarder n'est pas
  publier), schéma possédé versionné, palette / canevas / inspecteur, glisser-déposer avec ombre
  de destination, zoom, aperçu par appareil, retrait de bloc, catalogue épinglé avec sa visibilité
  portail. Blocs : recherche, grille de démarches, espace usager (décoratif), bandeau texte,
  contact et horaires (preset), pied de page (pleine largeur, fond, 1 à 3 colonnes).
- **2026-09-05 — Rendu au portail** : `GET /v1/portal/page` (1.8.0, pied de page en 1.9.0),
  composition publiée rendue par Nora avec recherche réelle sur le catalogue, charte graphique de
  la collectivité injectée (`/v1/organizations/{id}/branding`, décorative : jamais bloquante).
- **2026-09-06 — Les démarches réelles : qui propose quoi.** Le catalogue du portail applique
  l'**activation par organisation** sur tout l'arbre du tenant (`publishedCatalogue`, contrat
  1.10.0) : une démarche activée par une seule commune apparaît sur le portail de
  l'agglomération, une démarche que personne n'active n'est pas servie. Chaque démarche porte ses
  organismes ; Nora et le canevas de l'éditeur les affichent sur la carte et filtrent par
  organisme ; badge « Non activée » dans la liste d'épinglage.
- **2026-09-06 — Les langues, et les libellés traduits.** L'organisation principale active les
  langues dans lesquelles elle s'adresse à ses usagers (catalogue figé dans le code : langues
  mondiales + langues régionales de France, codes BCP 47) ; les libellés des **démarches** et des
  **catégories** se traduisent dans chacune. `enabled_languages` sur la racine,
  `translations` sur `procedures` et `categories`, `resolve_org_languages` pour la remontée,
  contrat 1.11.0 (`Tenant.languages`, `translations` sur `Category` et `PortalProcedure`).
- **2026-09-06 — Les démarches « pour de vrai » : une page, un formulaire, une demande.** Le
  portail sert désormais une démarche au lieu de la lister : `GET /v1/portal/procedures/{id}`
  (contrat **1.12.0**) ajoute la catégorie et les deux schémas de SAISIE (`form_schema`,
  `requester_config`) — même `publishedCatalogue`, donc 404 et aucune lecture du formulaire pour
  une démarche non publiée. Nora en fait deux écrans (présentation, puis formulaire), rend le
  schéma en miroir de `FormPreview`, et **dépose la demande dans Iris** par son API d'ingestion
  (source enregistrée, clé côté serveur du portail), avec l'accusé et sa référence. Les clés de
  `requester_config` (`courriel`, `nom_usuel`, `siret`…) sont celles qu'Iris rapproche du
  référentiel : aucune table de correspondance nulle part.

### Envisagé, dans l'ordre

1. **Multilingue.** En cours. Fait : les langues activées par la collectivité et les **libellés**
   traduits des démarches et des catégories (2026-09-06), leur **descriptif court** (2026-09-07,
   contrat 1.13.0), et **le choix de la langue par l'usager** au portail (2026-09-07) : sélecteur
   bâti sur `Tenant.languages`, langue portée par l'URL (`/en/…`, le français sans préfixe —
   c'est le pivot, pas une traduction) et mémorisée, résolue **côté `portal-api`** qui rend un
   modèle déjà localisé. Reste à faire : les **textes des sections de la page composée** — ils
   se traduisent dans l'éditeur, la traduction vivant **sur la section** (`translations`, même
   forme que `procedures.translations`) et non dans une couche par langue au niveau de la page,
   pour qu'elle voyage avec son bloc au glisser-déposer ; ⚠️ le schéma **reste en version 1**,
   l'ajout étant purement additif (écrire un `version: 2` que le parse actuel refuse ferait
   retomber la page entière sur `defaultPortalPage()`) —, les **~100 chaînes propres au portail**
   (dictionnaire statique à la manière d'Ariane, jeu de langues couvertes déclaré et repli
   français **par clé**), et le **descriptif usager** (`user_description`), qui rejoindra
   `translations` en clé voisine sans reprise. Enfin, les langues de France sans code ISO (gallo,
   poitevin-saintongeais, francique lorrain) attendent une convention de nommage — voir l'en-tête
   de `src/features/languages/languages.ts`.
2. **Les autres templates.** L'onglet « Thème » (grisé) : gabarits de page et variantes de mise en
   page au-delà de la composition libre ; d'autres pages que l'accueil (`portal_pages.slug` est
   prêt : « Contact », « Mentions légales », « Accessibilité » — obligatoires pour un site
   public) ; le bloc « Actualités » (grisé) quand une source d'actualités existera au Socle.
3. **Démarches hors compte.** La demande part déjà (2026-09-06) ; il lui manque son après :
   confirmation par courriel et **lien de suivi signé** à durée limitée, sans mot de passe. Il
   faut pour cela que le **statut d'une demande soit consultable** depuis le portail — Iris le
   sert sur `GET /v1/requests/{id}` avec le scope `requests:read`, à exposer sous une route du
   portail qui ne révèle rien sans le lien signé. C'est le parcours qui fait vivre le portail dès
   le premier jour.
4. **Démarches avec compte.** L'espace usager derrière le bloc « Espace usager » : mes demandes,
   leur état, mes informations. Authentification portée par Nora (projet Supabase du portail) et
   **rattachée au référentiel usagers du Socle** (`contacts`, via `contacts-api`) — le compte
   portail est une clé externe du contact (`contact_external_references`, source `portail_citoyen`,
   déjà prévue), pas une seconde fiche.
5. **Création de compte.** Inscription par courriel avec validation, réinitialisation de mot de
   passe, données minimales (RGPD : finalité, durée, droit d'accès et d'effacement à documenter),
   rapprochement d'une demande hors compte faite avec le même courriel.
6. **Les échanges.** Fil de messages entre l'usager et l'agent sur une demande (demande de
   complément, réponse, notification par courriel via le SMTP hérité de la collectivité). Le fil
   vit avec la demande (Iris) ; le portail en est une vue.
7. **Les pièces jointes.** Le formulaire du portail AFFICHE déjà les pièces attendues (champs
   `attachment` du `form_schema`), désactivées et jamais bloquantes — le worker de copie d'Iris
   n'étant pas actif, une URL signée expirerait avant d'être lue. Reste le dépôt réel des pièces
   demandées par la démarche (`document_types`, déjà paramétrées par démarche) : formats et tailles bornés, stockage privé, analyse antivirus à
   cadrer, remplacement d'une pièce refusée, et le même mécanisme pour les pièces jointes aux
   échanges.
8. **FranceConnect (?)** Identification par FranceConnect / FranceConnect+ pour les démarches qui
   exigent une identité vérifiée. Question ouverte : habilitation à obtenir par la collectivité
   ou par l'éditeur, périmètre des données restituées, cohabitation avec les comptes locaux.
   À instruire avant de coder.

Transverse, à ne pas perdre en route : **accessibilité RGAA** et mentions obligatoires d'un site
public, **domaines réels** (retirer `PORTAL_DEV_DOMAIN_SUFFIX` de la fonction déployée dès le
premier), **lien « Prévisualiser » vers le vrai portail** depuis l'éditeur (aujourd'hui l'aperçu
est le canevas sans son chrome), sortie de l'éditeur du shell de l'app, et les points d'ergonomie
notés dans `architecture.md` § 7.

## Frontend Socle

- **Sélecteur global d'organisation courante** (pour un utilisateur membre de plusieurs
  organisations), plutôt que le choix implicite actuel.
- **UI de consultation des contacts dans Socle** : le référentiel des usagers n'a aujourd'hui
  aucun écran dédié côté Socle, uniquement `contacts-api`.
- **Primitives du Design System manquantes** dans `src/components/ui/` : Select, Toast, Skeleton,
  entre autres — à ajouter au fil des besoins plutôt qu'en une fois.
