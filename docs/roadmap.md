# Roadmap

> **Public** : tous (devs Socle, équipes consommatrices) · **Question traitée** : quelles
> évolutions sont envisagées, et lesquelles ont déjà été livrées ? · **Dernière mise à jour** :
> 2026-09-18

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

- **Retirer `consent_email` et `consent_sms`** — ⚠️ **rupture de contrat, bloquée par Clara.**
  Les deux colonnes sont marquées OBSOLÈTES depuis le 2026-09-13 : ce qu'on demande à l'usager,
  ce sont désormais les consentements RGPD (`consent_traitement`, `consent_partage`, historique
  `contact_consents`). Elles n'ont pas été supprimées parce que **Clara les écrit et les affiche
  encore** (`src/pages/Contacts.tsx` : formulaire, et « Accepte les mails : oui / non » sur la
  fiche ; `src/services/socleContactService.ts` les type en entrée comme en sortie). Les retirer
  aujourd'hui casserait sa fiche contact.
  - **Ordre à tenir** : (1) Clara bascule son bloc « consentements » sur les nouveaux champs —
    en lecture seule, comme Iris, le recueil se faisant au dépôt ; (2) une migration Socle
    supprime les deux colonnes, le DTO et le schéma OpenAPI ; (3) une entrée **`rupture`** est
    ajoutée à [api-changelog.md](./api-changelog.md) et la majeure du contrat `contacts-api`
    passe à **2.0.0**.
  - **À ne pas confondre avec une simple suppression de colonnes** : `consent_email` porte une
    sémantique que rien ne reprend — « accepte de recevoir des courriels ». Le consentement
    `partage` ne dit pas la même chose. Si des collectivités s'en servent réellement pour
    filtrer des envois, il faut d'abord savoir quoi en faire (le migrer vers
    `preferred_channel` ? vers un consentement `communication` du nouveau catalogue ?) —
    sinon la « rupture » perdra une donnée métier au lieu de nettoyer un doublon.
  - Consommateurs à prévenir : Clara, Iris (qui ne les lit pas — sa whitelist `socle-proxy` les
    écarte explicitement), Nora.

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
- **Rattachement aux démarches** : bloc « Documents et courriers » de l'étape « Publication »
  (« Communication » jusqu'au 2026-09-18), avec
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
- **2026-09-08 — Les services internes : instruire sans apparaître.** Une collectivité marque une
  sous-organisation « service interne » (`organizations.is_internal_service`) : elle instruit, mais
  le portail la présente sous le nom de son **porteur** — le premier ancêtre qui n'en est pas un.
  Un usager s'adresse à sa mairie, pas à son service d'état civil. Contrat **1.16.0** :
  `handling_organization_id` sur chaque organisme (l'identifiant du service instructeur, **jamais
  son nom**), de quoi router la demande en aval ; `is_internal_service` sur `Organization`. Le
  Socle refuse qu'une même démarche soit activée par deux organisations d'un même porteur — sans
  quoi une demande déposée au nom de la mairie n'aurait pas de destinataire déterminé.
- **2026-09-08 — Le thème du site : chaque collectivité règle l'apparence de son portail.**
  L'onglet « Thème » de l'éditeur (jusque-là grisé) ouvre sur quatre préréglages, la typographie
  (catalogue de 4 polices figé dans le code — contrat de nommage, motif `languages.ts`), les
  formes et la densité, l'en-tête (fond, logo, menu, bouton de compte, en-tête fixe) et
  l'accessibilité (contraste renforcé, assombrissement de la couleur principale, déclaration
  RGAA), plus un **contrôle des contrastes** qui mesure la charte RÉELLE de la collectivité et ne
  propose son correctif que quand il corrige vraiment. `portal_themes` (`draft` / `published`,
  même discipline que `portal_pages` ; les deux se publient **d'un seul geste**), contrat
  **1.17.0** (`Tenant.theme`). ⚠️ Le thème ne porte **aucune couleur** : elles restent dans la
  charte graphique. Le canevas de l'éditeur applique désormais le thème ET la charte — il montre
  la page telle qu'elle sera, plus une maquette aux couleurs de la gamme.
  **Nora l'applique le jour même** : `Tenant.theme` lu à la frontière, un seul objet de style sur
  la racine de la page, et tout le portail — accueil composé, liste de repli, présentation d'une
  démarche, formulaire — passé aux variables CSS. Les trois polices sont **auto-hébergées**
  (`public/fonts/`, OFL 1.1) : pas de Google Fonts sur le site d'une collectivité, et une seule
  famille chargée par visite (≈ 35 Ko). La **déclaration d'accessibilité** s'affiche au pied de
  toutes les pages. ⚠️ Marianne a quitté le catalogue au passage : sa licence n'autorise pas la
  redistribution qu'un portail public suppose — remplacée par **Rubik**.
- **2026-09-06 — Les démarches « pour de vrai » : une page, un formulaire, une demande.** Le
  portail sert désormais une démarche au lieu de la lister : `GET /v1/portal/procedures/{id}`
  (contrat **1.12.0**) ajoute la catégorie et les deux schémas de SAISIE (`form_schema`,
  `requester_config`) — même `publishedCatalogue`, donc 404 et aucune lecture du formulaire pour
  une démarche non publiée. Nora en fait deux écrans (présentation, puis formulaire), rend le
  schéma en miroir de `FormPreview`, et **dépose la demande dans Iris** par son API d'ingestion
  (source enregistrée, clé côté serveur du portail), avec l'accusé et sa référence. Les clés de
  `requester_config` (`courriel`, `nom_usuel`, `siret`…) sont celles qu'Iris rapproche du
  référentiel : aucune table de correspondance nulle part.

- **2026-09-12 — La fréquentation du site, mesurée sans cookie.** L'accueil de l'app par
  organisation cesse d'être un écran d'attente : chiffres du référentiel (démarches, usagers,
  démarches activées par organisme) et **fréquentation du portail** — visites, pages vues,
  demandes déposées et taux, pages les plus vues, langues, appareils, sur 7 jours / 30 jours /
  1 an. Quatrième edge function `audience-api` (scope **`audience`**, contrat 1.0.0, **écriture
  seule**), tables de compteurs `portal_audience_pages` / `portal_audience_breakdown` sans aucune
  policy, deux RPC de lecture gardées. Nora envoie un beacon `text/plain` (donc **un seul appel
  par page vue**, sans `OPTIONS`) et signale le dépôt après l'acceptation par Iris.
  ⚠️ **Aucun bandeau de consentement, parce qu'aucune donnée personnelle n'est collectée** : rien
  n'écrit sur le poste du visiteur, et ni l'adresse IP (hachée en mémoire chez Nora, pour le seul
  frein anti-abus), ni le User-Agent (réduit à un mot parmi trois), ni le référent (réduit à un
  oui/non par le navigateur) n'atteignent le Socle. Un test SQL fige la liste exacte des colonnes.
  ⚠️ Une **visite** est une **arrivée** sur le site, pas un visiteur unique — sans identifiant, la
  seconde notion n'a pas de sens. La **provenance** a été écartée du périmètre.

- **2026-09-12 — Une page par organisme, et le menu « Ma ville ».**
  `laurentville.edilumen.fr/<slug>` sert les démarches d'UN organisme, à SA charte (le thème reste
  celui de la collectivité : le thème dit comment peindre, la charte avec quoi). L'usager reste sous
  le préfixe jusqu'au dépôt. Contrats **1.22.0** (`slug`) puis **1.23.0** (`logo_url`) sur
  `PortalOrganizationRef` ; migration `organization_slug_url` (le slug devient une adresse
  publique : `[a-z0-9-]`, **4 caractères au moins**, mots réservés du portail exclus).
  ⚠️ **Qui a une page se déduit du catalogue**, sans réglage : un organisme est atteignable tant
  qu'il propose au moins une démarche publiée. La racine est écartée (sa page est l'accueil), et un
  **service interne** n'apparaît jamais — c'est son porteur qui est nommé, et son adresse qui sort.
  ⚠️ **La longueur minimale du slug est une décision de contrat** : le portail décide sur la seule
  forme du premier segment d'une adresse s'il lit une langue (`/en`) ou un organisme, sans rien
  demander au serveur. Un slug de trois caractères rendrait la page inatteignable, en silence.
  ⚠️ **`logo_url` sort BRUT**, héritage non résolu — seul endroit du contrat dans ce cas : dans une
  liste de communes, un logo hérité donnerait la même image à chaque ligne.
  ⚠️ La **marque de l'en-tête reste celle de la collectivité** (nom + logo) : le bandeau du haut dit
  sur quel site on est, le bloc dessous quelle mairie on visite.
  **Restent ouverts** : (1) la **page de repli** (collectivité qui n'a rien composé) n'a aucun
  en-tête — donc ni langue, ni compte, ni « Ma ville » ; (2) les pages d'organisme **ne sont pas
  comptées** dans l'audience (voir point 0).
- **2026-09-12 — Le voile de l'image de fond est retiré** (décision produit). La photo se voit telle
  qu'elle a été choisie.
  ⚠️ **Ce voile était une garantie, pas un effet** : il laissait l'encre du portail à 5,7 : 1 sur le
  pire fond possible, au-dessus du seuil AA, quelle que soit l'image. Il n'y a **plus aucune
  garantie** : sur un gris moyen, l'encre pleine tombe à 4,1 : 1 — mesuré et épinglé par un test des
  deux côtés. Filet restant : sous-titre à l'encre pleine, puces en blanc plein.
  **Reste ouvert** : un voile **sous le texte seul**, qui rendrait la photo intacte et le contraste
  avec. C'est un petit lot.

### Envisagé, dans l'ordre

0. **Suites possibles de la mesure d'audience** — aucune n'est engagée : la **provenance**
   (écartée au premier tour : elle demanderait de transmettre le référent, donc de défaire la
   promesse qui dispense du consentement) ; un **filtre par site** quand une collectivité en tient
   plusieurs (le domaine est déjà dans les compteurs, seul l'écran manque) ; une **vue super
   admin** inter-clients, sur le modèle de `/superadmin/ia` ; l'**export** de la période.
   S'y ajoute depuis le 2026-09-12 : **compter les pages d'organisme**. `page` n'a que trois valeurs
   (`accueil`, `demarche`, `formulaire`) et la contrainte SQL les fige — en ajouter une quatrième
   demande une migration coordonnée, et une **dimension organisme** dans les répartitions pour que
   le chiffre serve à quelque chose. ⚠️ Les vues de démarche et de formulaire atteintes PAR une page
   d'organisme sont, elles, déjà comptées : c'était le piège du lot, et un test l'épingle chez
   Nora.

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
   français **par clé**), et le **descriptif usager** (`user_description`) : il est **saisi
   depuis le 2026-09-18** (étape « Communication usager », en Markdown), il reste à le traduire
   — il rejoindra `translations` en clé voisine, sans reprise, et son `TranslationFields` vivra
   dans cette étape avec `fields = ["user_description"]` seulement (un écran n'efface que les
   champs qu'il affiche). ⚠️ Les autres textes de cette étape — note de public, pièces
   annoncées, FAQ usager — vivent dans un **JSONB** (`user_communication`) et non dans des
   colonnes : ils ne peuvent pas rejoindre `translations` tel quel, et demandent leur propre
   décision (une clé `translations` par entrée, comme les sections du portail ?). Rien n'est
   engagé. Enfin, les langues de France sans code ISO (gallo,
   poitevin-saintongeais, francique lorrain) attendent une convention de nommage — voir l'en-tête
   de `src/features/languages/languages.ts`.
2. **Les autres templates.** Gabarits de page et variantes de mise en page au-delà de la
   composition libre ; d'autres pages que l'accueil (`portal_pages.slug` est prêt : « Contact »,
   « Mentions légales », « Accessibilité » — obligatoires pour un site public) ; le bloc
   « Actualités » (grisé) quand une source d'actualités existera au Socle ; la vue « Contenus »
   (grisée) qui va avec.
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
   déjà prévue), pas une seconde fiche. **Le paramétrage est prêt depuis le 2026-09-10** :
   `procedures.access_mode` dit, démarche par démarche, si le dépôt exige un usager connecté, et il
   est servi en contrat 1.19.0 sur `Procedure` et `PortalProcedure`. Reste à le **lire** — annoncer
   la restriction sur la carte et sur la page de la démarche, puis bloquer le dépôt. ⚠️ Sans jamais
   retirer la démarche du catalogue : c'est là que l'usager apprend qu'il doit se connecter.
5. **Création de compte.** Inscription par courriel avec validation, réinitialisation de mot de
   passe, données minimales (RGPD : finalité, durée, droit d'accès et d'effacement à documenter),
   rapprochement d'une demande hors compte faite avec le même courriel.
6. **Les échanges.** Fil de messages entre l'usager et l'agent sur une demande (demande de
   complément, réponse, notification par courriel via le SMTP hérité de la collectivité). Le fil
   vit avec la demande (Iris) ; le portail en est une vue.
7. **Les pièces jointes — livrées le 2026-09-08** (Iris + Nora, contrat d'ingestion Iris
   2.0.0). Le fichier part dès sa sélection au portail (`portal-api /v1/demandes/pieces`) vers
   Iris (`POST /v1/uploads`), qui vérifie le **contenu réel** (signature binaire contre une liste
   fermée : PDF, images, HEIC, Word/Excel/OpenDocument — jamais SVG, HTML ni Office à macros),
   borne la taille (10 Mo au portail), calcule l'empreinte et garde le fichier en attente de la
   demande ; Nora ne stocke rien. Pas d'antivirus (décision PO : la liste fermée est la défense).
   Le remplacement d'une pièce refusée existe côté Iris (instruction) ; **côté portail, il attend
   les échanges (6)**, comme les pièces jointes aux échanges.
   ⚠️ **Question ouverte, POUR LE SOCLE (2026-09-08)** : Iris refuse une demande dont la
   démarche n'est pas activée pour l'organisme transmis (`organization_procedures`, opt-in
   strict — garde `t18`). Or le portail ne transmet un organisme que si l'usager l'a choisi, donc
   seulement quand la démarche publiée en **liste plusieurs** ; sans organisme, Iris retient la
   **racine** de la collectivité. Une démarche activée pour une seule commune mais publiée sans
   organisme (ou avec une liste qui ne reflète pas ses activations) part donc vers la racine et
   se fait refuser — constaté au premier essai réel. À trancher : la liste `organizations` que
   `public-api` publie avec une démarche doit être exactement **celle des organismes qui
   l'activent** (le portail présélectionnant l'unique organisme), ou bien l'activation à la racine
   devient implicite quand une seule commune active. La première lecture est la plus cohérente
   avec l'opt-in strict.
8. **FranceConnect (?)** Identification par FranceConnect / FranceConnect+ pour les démarches qui
   exigent une identité vérifiée. Question ouverte : habilitation à obtenir par la collectivité
   ou par l'éditeur, périmètre des données restituées, cohabitation avec les comptes locaux.
   À instruire avant de coder.

### Accessibilité RGAA — le relevé du 2026-09-15

Estimation : **partiellement conforme**, ~70 % en générique et ~75 % mesuré sur
`sna27.edilumen.fr` en production. Au seuil de l'arrêté (100 % = totalement conforme, ≥ 50 % =
partiellement), le portail est donc **partiellement conforme** — mais aucune collectivité ne peut
le déclarer tant que la déclaration elle-même n'existe pas (voir « Côté Socle » plus bas).

⚠️ **Ce n'est pas un audit** : relevé par lecture du code et mesure dans le DOM des trois écrans
(accueil, présentation d'une démarche, formulaire, en français et en anglais). Pas d'échantillon
de pages arrêté, pas de test au lecteur d'écran, pas de vérification à 320 px. Un audit
d'accréditation reste à commander — ce relevé sert à ne pas le découvrir le jour où il arrive.

**Ce qui tient déjà** (à ne pas défaire) : étiquettes, aide et erreur reliées par
`aria-describedby`, `aria-invalid`, obligation dite en toutes lettres, groupes `radiogroup` /
`group` étiquetés, `lang` et `dir` posés dynamiquement, images décoratives en `alt=""`, SVG en
`aria-hidden`, panneau « Ma ville » refermé par Échap avec retour du focus, `prefers-reduced-motion`.

#### Côté Nora — un lot « à faire une fois »

✅ **Points 1 à 10 livrés le 2026-09-18**, vérifiés sur un build de production (`laurentville`,
accueil, présentation, formulaire envoyé à vide). Ce qui a changé, pour ne pas le défaire :

- chaque écran a la même structure : racine `<div>` (elle porte le style du thème), lien
  d'évitement (`SkipLink`), `<header>`, `<main id="contenu" tabIndex={-1}>`, puis un `<footer>`
  de premier niveau **seulement s'il a quelque chose à porter** ;
- sur l'accueil composé, le `h1` est le **nom de la collectivité**, dans l'en-tête, à rendu
  identique (décision de Laurent : jamais un bloc personnalisable). Les pages d'organisme et le
  catalogue de repli ont reçu un `h2` invisible au-dessus des cartes (`h3`), qui sautaient un
  niveau ;
- un titre d'onglet par écran, traduit (`i18n/pageTitle.ts`), préfixé du nombre d'erreurs
  après un envoi refusé ;
- l'erreur est reliée à son contrôle sur les groupes **et sur le dépôt de fichier** : même
  défaut, trouvé au contrôle dans Chrome ;
- le contour des champs a sa propre variable, `--pt-field-border` : 3,56:1, et 4,44:1 en
  contraste renforcé. `--pt-border` reste aux cartes et aux séparateurs, qui sont décoratifs.

Restent ouverts : 11 à 14. Les deux chaînes françaises en dur du formulaire (« Choisissez… »)
ont été corrigées au passage : c'était un défaut 8.7 sur une page servie en anglais.

Dans l'ordre du rapport qualité/prix, tout se tient en une passe :

1. **Le lien d'évitement** (12.7) — absent de toutes les pages ; le premier tabulable est le logo.
2. **Un `h1` sur l'accueil composé** (9.1) — 29 titres sur `sna27`, aucun `h1` : la page commence
   en `h2`. ⚠️ C'est une décision de composition avant d'être du code : le `h1` est-il le titre du
   bloc « recherche », ou le nom de la collectivité ? Les pages de démarche, elles, ont le leur.
3. **Sortir `header` et `footer` de `main`** (9.2, 12.6) — mesuré : `header DANS MAIN`,
   `nav DANS HEADER>MAIN`, `footer DANS MAIN`. Les repères `banner` et `contentinfo` n'existent
   donc pas. `HomeComposition.tsx` et `DemarcheShell.tsx`.
4. **Un titre de page par écran** (8.6) — `document.title` vaut « Démarches en ligne » sur les
   trois écrans, et **reste en français sur une page servie en `lang="en"`**.
5. **La prise de focus du champ de recherche** (10.7) — mesuré : `outline: rgba(0,0,0,0) 2px` et
   `box-shadow` à zéro. Les classes `focus:outline-none focus:ring-0` sur l'input, la bordure
   visible étant portée par le conteneur (`RechercheSection.tsx`, `OrganismePage.tsx`). Même
   angle mort sur les contrôles en `sr-only` (pilules « Je suis… », dépôt de fichier).
6. **L'erreur d'un groupe n'est reliée à rien** (11.10) — le défaut le plus dur, vérifié en
   production : envoi à vide → « 5 informations doivent être corrigées » ; quatre champs portent
   `aria-invalid` + `aria-describedby`, le cinquième (une case à cocher, rendue en `role="group"`)
   affiche son message `champ-…-erreur` sans qu'aucun attribut n'y renvoie. Un lecteur d'écran
   annonce cinq erreurs et n'en laisse trouver que quatre. `FormFields.tsx` : les groupes
   reçoivent `aria-labelledby` mais pas le reste de `shared`.
7. **`fieldset` / `legend` sur « Vos informations »** (11.6) — zéro `fieldset` dans tout le portail.
8. **`autocomplete` sur les champs d'identité** (11.13) — seul `courriel` en porte un ; nom de
   naissance, nom usuel, prénoms, adresse, portable, fixe, civilité n'ont rien.
9. **Le focus au résumé d'erreurs** — `ErrorSummary` porte déjà `tabIndex={-1}`, personne ne l'y
   met : après un envoi refusé, le focus reste sur le bouton.
10. **Le contraste des bordures de champ** (3.3) — `--pt-border: #e4e7e6` sur blanc = **1,24:1**,
    il en faut 3. Figé dans `index.css`, donc indépendant de la charte : il vaut pour tout le monde.
11. **Deux systèmes de navigation par page** (12.1) — la nav de l'en-tête est décorative et la
    recherche n'existe que sur l'accueil : une page de démarche n'en offre aucun. Se règle avec les
    autres templates (2) plutôt qu'à part.
12. **Les messages de statut** (7.5) — recherche et filtres refont la grille sans région live ; le
    « rien trouvé » apparaît en silence.
13. **Le sélecteur de langue navigue au `onChange`** (7.4) — changement de contexte à la saisie.
14. **Le miroir RTL de la mise en page** — connu, noté dans le README de Nora : `dir="rtl"` corrige
    le texte et la saisie, pas le placement (utilitaires Tailwind physiques).

✅ *Corrigé le 2026-09-18, des deux côtés à la fois.* `readableInk` ne vise plus de seuil : il
prend **celle des deux encres qui contraste le plus** (le blanc à égalité), ce qui vaut aussi pour
l'encre du contraste renforcé. Le point de bascule effectif avec l'encre ordinaire est ≈ 0,21, et
non 0,183 : entre les deux, le blanc reste le meilleur choix, même sous 4,5. Le doublon de
`composition.ts` (Nora) n'existe plus. Le constat d'origine :

⚠️ **LE SEUIL DE LUMINANCE EST FAUX, ET IL DÉCIDE DE LA LISIBILITÉ D'UN EN-TÊTE COLORÉ.**
`isDarkColor` bascule en texte blanc sous **0,4** — `Nora/src/features/portal/themeStyle.ts`,
dupliqué dans `composition.ts` pour le pied de page. Le vrai point de bascule pour 4,5:1 est
**0,183**. Un orange `#e07b39` ou un turquoise `#00a3a3` reçoit donc du blanc (2,97 et 3,10) là où
l'encre sombre passerait (5,44 et 5,21). À corriger des deux côtés à la fois : `themeStyle.ts` est
un miroir volontaire de son homologue du Socle, et l'aperçu de l'éditeur ment sinon.

✅ *Le vert par défaut a été foncé le 2026-09-18* (décision de Laurent) : `#089b59` → **`#07854c`**,
soit 4,70:1 en texte comme en bouton, le plus petit pas qui passe. L'ancien ne passait avec
aucune encre (3,59 en blanc, 4,498 en encre sombre). Le sélecteur de couleur de la charte proposait
lui aussi l'ancien vert (`DEFAULT_COLOR_PICKER`) : il propose maintenant le nouveau. Le constat
d'origine :

⚠️ **LA CONFORMITÉ D'UNE COLLECTIVITÉ DÉPEND DE LA COULEUR QU'ELLE A SAISIE.** SNA27 passe les
contrastes de texte par sa charte (`#3b7788` : blanc dessus à 5,02 ; 117 éléments de texte mesurés
sur l'accueil, **aucun échec**). Le vert par défaut de la gamme (`#089b59`) donne, lui, **3,59** en
texte comme en fond de bouton : une collectivité **sans charte publiée est servie hors conformité
par défaut**. C'est le point qui empêche d'annoncer un niveau au catalogue.

#### Côté Socle

- **Les pages obligatoires** — « Accessibilité », « Mentions légales », « Contact » : déjà dans
  « Les autres templates » (2). Tant qu'elles n'existent pas, la déclaration n'est qu'une phrase au
  pied de page, alors que l'article 47 demande **une page**, une **mention d'état** et un **schéma
  pluriannuel**.
- **Rien n'oblige la collectivité à remplir sa déclaration.** `accessibility.declaration` vide =
  rien d'affiché, par décision (le portail n'invente pas une déclaration que personne n'a faite).
  Conséquence observée : **`sna27.edilumen.fr` est en ligne sans aucune mention d'accessibilité**,
  ni mentions légales, ni politique de confidentialité, ni page contact. À traiter comme un
  prérequis de mise en ligne d'un domaine, pas comme un réglage facultatif.
- ✅ *2026-09-18* : le contrôle des contrastes **compare le rapport brut** au seuil. Il arrondissait
  avant de comparer, et affichait 4,498 comme « 4,5 : 1, conforme ». Il tronque désormais le
  chiffre affiché. Il gagne aussi une ligne « Contour des champs de saisie » (3:1, non
  décorative).
- **Le contrôle des contrastes de l'éditeur** (2026-09-08) mesure la charte réelle et propose son
  correctif. Il pourrait **avertir** quand la charte met la collectivité hors conformité — et
  couvrir aussi le choix encre claire / encre sombre, qui lui échappe aujourd'hui.

Transverse, à ne pas perdre en route : **accessibilité RGAA** (relevé ci-dessus) et mentions
obligatoires d'un site public, **domaines réels** (retirer `PORTAL_DEV_DOMAIN_SUFFIX` de la
fonction déployée dès le premier), **lien « Prévisualiser » vers le vrai portail** depuis
l'éditeur (aujourd'hui l'aperçu
est le canevas sans son chrome), sortie de l'éditeur du shell de l'app, et les points d'ergonomie
notés dans `architecture.md` § 7.

## Frontend Socle

- **Sélecteur global d'organisation courante** (pour un utilisateur membre de plusieurs
  organisations), plutôt que le choix implicite actuel.
- **UI de consultation des contacts dans Socle** : le référentiel des usagers n'a aujourd'hui
  aucun écran dédié côté Socle, uniquement `contacts-api`.
- **Primitives du Design System manquantes** dans `src/components/ui/` : Select, Toast, Skeleton,
  entre autres — à ajouter au fil des besoins plutôt qu'en une fois.
