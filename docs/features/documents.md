# Feature : catalogue de documents (`document_templates`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Modèles de documents et de courriers d'une collectivité — accusés de réception, notifications,
fiches internes — déposés une fois et porteurs de **variables** (`{{usager.nom}}`). **Multi-tenant
strict** comme les démarches : rattachés à une **organisation principale (racine)**, trigger
`enforce_document_template_root_org`. ⚠️ Ne pas confondre avec `document_types` (les **pièces
demandées à l'usager**) ni avec le bucket `procedure-documents` (les **documents d'aide à
l'agent**) : ce sont des **gabarits**, d'où le nom `document_templates` alors que l'UI dit
« Documents ».

⚠️ **Le Socle enregistre et publie, il ne fusionne rien** — même parti que la charte graphique et
l'étape « Publication ». Il n'inspecte pas le contenu des fichiers (Word découpe volontiers
`{{usager.nom}}` en plusieurs fragments XML : une détection naïve signalerait des variables
absentes qui sont bien là), et ne sait pas valoriser la plupart des variables qu'il publie.

- Champs : `name` (**obligatoire**, **unique par organisation, insensible à la casse** via l'index
  `document_templates_org_name_unique`), `description` (facultatif), `type`
  (`interne`/`externe`/`courrier`, CHECK en base — même mot que `procedures.type`, plus
  `courrier`), `file_path` + `file_name`, `created_at`/`updated_at` (trigger partagé
  `set_updated_at`).
- RLS `document_templates` (calqué sur `document_types`) : lecture `has_org_access(organization_id)`
  · écriture (ALL) `is_org_admin(organization_id)`. Unicité vérifiée côté client (feedback
  immédiat) **et** garantie en base (repli sur l'erreur Postgres `23505`).
- **Stockage : bucket privé `document-templates`** (25 Mio/fichier), formats `.doc`/`.docx`/`.odt`.
  Convention de chemin **`{organization_id}/{uid}-{fichier}`** — pas de segment de document : le
  fichier est déposé **avant** que la ligne existe, le `uid` (`crypto.randomUUID()`) suffit à
  écarter les collisions. RLS `storage.objects` scopé `bucket_id` : lecture `has_org_access`,
  écriture `is_org_admin` sur `((storage.foldername(name))[1])::uuid` — motif
  `procedure-documents`. Consultation par **URL signée temporaire**.
- ⚠️ **Ordre des écritures**, à ne pas inverser : à la **création**, le fichier part avant la ligne
  (abandon de la modale ⇒ objet orphelin, assumé ; un échec de l'insert **compense** en retirant le
  fichier) ; au **remplacement**, l'ancien objet n'est retiré qu'**après** succès de l'update (sans
  quoi un échec laisserait un document introuvable) ; à la **suppression**, la ligne part d'abord
  (le RLS peut refuser), le fichier ensuite en best-effort.
- **Catalogue de variables** (`documentVariables.ts`) : figé dans le code — c'est un **contrat de
  nommage**, pas une donnée client. Syntaxe `{{domaine.cle}}` (moteurs de fusion courants :
  docxtemplater, carbone.io). **Trois domaines** : **`usager.*`** (16 variables — identité, adresse
  complète *et* ses composantes, coordonnées, quartier), **`demande.*`** (13 variables — démarche,
  suivi, dates, état, agent instructeur) et **`organisme.*`** (8 variables — nom, adresse,
  téléphone, courriel, deux logos, deux couleurs). ⚠️ La liste des pièces est une **boucle**
  (`{{#demande.pieces}}{{libelle}} : {{statut}}{{/demande.pieces}}`), pas une variable plate : elle
  a autant de lignes que le dossier compte de pièces.
  ⚠️ **La plupart de ces variables n'ont pas de source dans le Socle** : les composantes d'adresse
  manquent à `contacts` (roadmap), et toute la famille `demande.*` vit dans Ariane/Clara. Le
  catalogue dit comment **nommer**, pas ce que le Socle sait remplir.
  **`organisme.*` est la seule exception, et elle est entière** : les quatre coordonnées sont des
  colonnes d'`organizations`, la charte vient de `resolve_branding` / `GET
  /v1/organizations/{id}/branding`. ⚠️ La charte s'entend **résolue** — une sous-organisation qui
  hérite a ses colonnes de charte **nulles**, un consommateur qui lirait `organizations` en direct
  peindrait du vide (même mise en garde qu'au changelog du 2026-08-30). ⚠️ Les logos sont des
  **URL d'image** et les couleurs des `#rrggbb` : un moteur de fusion doit savoir *insérer une
  image*, sinon le courrier affiche une adresse web à la place du logo — d'où les `hint` du
  catalogue, **testés**.
- **Deux points d'entrée**, tous deux via le composant partagé `DocumentTemplatesManager` (liste +
  CRUD), motif `document_types` :
  - **Admin** : écran **`/documents`** dans l'app par organisation — mode « toutes mes racines », le
    dialogue propose un sélecteur d'organisation (masqué s'il n'y en a qu'une).
  - **Superadmin** : section « Documents » d'`OrgSettingsPage` (`?section=documents`, racine
    uniquement) — mode **org fixée** (`fixedOrganizationId`).
  Colonnes de la liste : **libellé, nom fichier, type**. Un bouton **« Variables disponibles »**
  ouvre `VariablesDialog` (titre + jeton + copie par variable) — au-dessus de la liste, là où
  l'agent en a besoin au moment de préparer son fichier.
- **Exposé par `public-api`** depuis le 2026-09-01 (contrat 1.6.0) : catalogue
  `GET /v1/document-templates` (+ `/{id}`, filtre `type`), téléchargement par
  `GET /v1/document-templates/{id}/signed-url` (URL signée 5 min ; ⚠️ le `file_path` n'est **jamais**
  exposé — la garde de périmètre porte sur la ligne, pas sur une chaîne fournie par l'appelant), et
  sélection **résolue** dans `Procedure.documents`. ⚠️ Ne pas confondre avec
  `GET /v1/documents/signed-url`, qui sert la base de connaissances (bucket `procedure-documents`)
  — c'est d'ailleurs pourquoi l'endpoint s'appelle `document-templates` et non `documents`.
- **Rattachement aux démarches** : fait, par le bloc `documents` de l'étape « Publication » (voir la
  feature « paramétrage des démarches »).
- Code : `src/features/documents/` — `documentVariables.ts` et `documentTemplates.ts` (purs,
  **testés**), `useDocumentTemplates.ts` (CRUD + upload/suppression/URL signée),
  `DocumentTemplatesManager`, `DocumentTemplateFormDialog`, `VariablesDialog` (testé),
  `DocumentsPage` (fin conteneur). Helpers de fichier **partagés** avec les démarches dans
  `src/lib/fileStorage.ts` (`fileExtension`, `sanitizeFileName`, `isFormatAllowed`,
  `acceptAttribute`, `validateFile`) — `procedureStorage.ts` les réexporte.
- Migration : `document_templates`.
