# Feature : paramétrage des démarches (`procedures`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Catalogue des démarches, **multi-tenant strict** : une démarche est rattachée à une
**organisation principale (racine, `parent_id IS NULL`)** — imposé par le trigger DB
`enforce_procedure_root_org`. L'**activation par organisation** (via `organization_procedures`)
est fonctionnelle (voir feature « Édition d'organisation » ci-dessous). Paramétrage par **admin**
(sa principale) et **superadmin** (toutes).

- **Formulaire = stepper horizontal à 6 étapes** (`src/features/procedures/steps.ts`) : Descriptif,
  Informations demandeur, Formulaire, **Communication usager**, **Publication**, Base de
  connaissances. **Les 6 sont fonctionnelles** (Communication usager depuis le 2026-09-18),
  chacune persistée dans sa propre colonne de `procedures`.
  ⚠️ **LA CLÉ SUIT LA COLONNE, LE LIBELLÉ SUIT L'AGENT**, et deux d'entre eux ne coïncident plus
  depuis le 2026-09-18 : l'ancienne étape « Communication » s'appelle désormais
  **« Publication »** à l'écran (c'est elle qui règle où et quand la démarche est proposée),
  mais sa clé, son fichier et sa colonne restent `communication` / `CommunicationStep.tsx` /
  `communication_config`. Renommer la clé aurait fait perdre le fil vers la colonne ; garder
  l'ancien libellé aurait mis deux « Communication » côte à côte dans le stepper, alors que les
  deux notions ne se recouvrent en rien. D'où la table de correspondance :

  | Étape (écran) | Clé | Colonne(s) |
  |---|---|---|
  | Descriptif | `descriptif` | colonnes plates + `translations` |
  | Informations demandeur | `demandeur` | `requester_config` |
  | Formulaire | `formulaire` | `form_schema` |
  | **Communication usager** | `usager` | **`user_communication`** + `user_description` (+ `translations.user_description`) |
  | **Publication** | `communication` | `communication_config` |
  | Base de connaissances | `connaissances` | `knowledge_base` |
 Chaque étape a un `<form id>` soumis depuis le pied de `ProcedureEditor`
  (`currentFormId`) et persiste via `useUpdateProcedure`. Le pied propose **deux boutons** :
  « Enregistrer » (reste sur l'étape, confirmation « Enregistré ✓ » éphémère) et « Enregistrer et
  continuer » (avance) — dernière étape : « Enregistrer » seul. L'étape courante est **reflétée dans
  `?step=`** (`onStepChange` → `setSearchParams` en `replace`) : position restaurée après rechargement.
- **Cycle de vie = `procedures.status`** (`brouillon` | `production`, défaut **brouillon**, CHECK
  en base). Commutateur **« Production »** par ligne dans la liste des démarches (composant partagé
  `ProceduresListPanel` → écran admin `/demarches` **et** section catalogue du superadmin) ; tag
  **« Brouillon »** dans la liste et dans l'en-tête de l'éditeur. **Au bout du stepper**, un
  enregistrement sur la dernière étape propose la mise en production par une modale — le moment où
  la question se pose d'elle-même. Le geste est **réversible** dans les deux sens.
  ⚠️ Ne pas confondre avec les deux autres notions qui s'y cumulent : `organization_procedures.
  is_enabled` (quelles organisations la proposent) et `communication_config.visibility` (où et
  quand). `status` dit si le **paramétrage est fini** ; une démarche en brouillon n'est proposée
  nulle part, quelles que soient les deux autres. Une quatrième s'y ajoute sans s'y substituer :
  `organizations.is_internal_service` ne dit pas SI la démarche est proposée, mais **sous quel nom**
  — celui du porteur — et il borne l'activation (un seul instructeur par porteur). ⚠️ Les démarches **antérieures au 2026-08-30 sont
  toutes en brouillon** (la notion n'existait pas — rien n'a été affirmé à leur place) : un
  consommateur qui filtre sur `production` n'obtient rien tant que le catalogue n'a pas été basculé.
  Logique pure `procedureStatus.ts` (testée : au moindre doute, **brouillon** — le doute ne publie rien).
  ⚠️ **`access_mode` n'entre dans aucune de ces quatre notions** : il ne dit pas si la démarche est
  proposée, ni sous quel nom, mais à quelles **conditions** on la dépose — voir ci-dessous.
  ⚠️ **`user_communication` n'en est pas une cinquième non plus** : elle ne dit rien de la
  publication, seulement ce que l'usager **lit** une fois la démarche proposée.
- **Descriptif** → colonnes `procedures` : `name` (obligatoire), `category_id` (obligatoire, catégories
  de la racine), `type` (`interne`/`externe`), `access_mode` (accès — voir ci-dessous),
  `keywords` (text[], CSV), `short_description`,
  `input_duration_minutes`, `order_index` (rang, défaut max+1), + `translations` (libellé **et
  descriptif court** traduits dans chaque langue activée par la racine — voir feature « Langues et
  libellés traduits »).
- **Accès = `procedures.access_mode`** (`libre` | `authentifie`, défaut **libre**, CHECK en base —
  2026-09-10) : la démarche se dépose-t-elle sans compte, ou faut-il être connecté à son espace
  usager ? Sélecteur **« Accès »** de l'étape Descriptif, à côté du type — c'est de la même nature,
  ce que la démarche EST avant ce qu'elle demande.
  ⚠️ **CE N'EST PAS UNE CINQUIÈME RÈGLE DE PUBLICATION**, et c'est le seul piège de ce réglage : une
  démarche réservée reste au **catalogue** du portail et doit s'y voir — c'est en la lisant que
  l'usager apprend qu'il doit se connecter. La retirer la cacherait à ceux-là mêmes qui ont un
  compte. La connexion se demande au moment de **déposer**, pas au moment de montrer ; c'est écrit
  aux trois endroits où un consommateur regarde (DTO, schéma OpenAPI, description de la route).
  ⚠️ **Défaut `libre`, lignes existantes comprises** : c'est ce qui était vrai (le portail dépose
  sans compte depuis le 2026-09-06), et le défaut inverse aurait fermé d'un coup un catalogue que
  personne n'avait déclaré fermé. Même raison pour le parseur : **au moindre doute, `libre`** —
  l'inverse de `procedureStatus` (là le doute ne publie rien, ici il ne **ferme** rien).
  ⚠️ Le Socle **enregistre et publie**, il ne garde aucune porte (motif de la charte graphique et de
  l'étape « Publication ») : tant que Nora ne lit pas le champ, une démarche réservée se dépose comme
  les autres. L'espace usager est à la roadmap (« Démarches avec compte »).
  **En aval** (contrat 1.19.0) : `access_mode` sur `Procedure` **et** sur `PortalProcedure` (liste
  et détail) — le portail en a besoin pour l'annoncer, l'application qui instruit pour refuser un
  dépôt anonyme. Logique pure `procedureAccess.ts` (testée) ; miroir edge `readAccessMode` dans
  `public-api/_shared/serializers.ts` (testé des deux côtés, motif `readDocumentIds`). Migration
  `procedures_acces_libre_authentifie`.
- **Informations demandeur** → colonne `procedures.requester_config` (JSONB). Publics
  citoyen/entreprise/association activables ; par public, chaque donnée vaut `masque`/`visible`/
  `obligatoire`. Logique pure + parseur robuste `requesterFields.ts` (testé), UI `steps/DemandeurStep.tsx`.
  `enabledAudiences` en extrait les publics **activés** : c'est le seul morceau de cette colonne
  qui concerne un usager avant qu'il ait choisi sa démarche, et c'est ce que le portail sert
  (`PortalProcedure.audiences`) et ce sur quoi il filtre.
- **Formulaire** → colonne `procedures.form_schema` (JSONB) : **form builder maison**, schéma
  **possédé** (contrat public consommé en aval). Contenu = liste ordonnée de nœuds *champ* ou *section* ;
  champs simples / choix (options) / **pièce justificative** (1–5 fichiers, formats, obligatoire +
  conditionnel) ; **conditions** d'affichage & d'obligation (moteur pur `conditions.ts`). Ajout des
  champs par **palette** (glisser-déposer positionné, ou clic → ajout à la fin). La palette propose
  aussi un champ **« Lieu d'intervention »** (`type: "location"`, fabrique `createLocationField`,
  clé par défaut `intervention_lieu`) : une adresse sur **une ligne** complétée par la Base Adresse
  Nationale, et une carte OpenStreetMap où l'usager peut **déplacer le point** dans un rayon de
  **150 m** (`LOCATION_ADJUST_RADIUS_M`, constante de plateforme — pas une option du champ) pour
  désigner l'endroit exact ; **l'adresse ne bouge pas**. Sa réponse est un **objet**
  `LocationValue` (`{ address, lat, lon, precision, adjusted }`, décrit dans l'OpenAPI, contrat
  1.29.0) — `lat`/`lon` vont ensemble, `null` en saisie libre ; ⚠️ un consommateur qui a un point
  **ne géocode pas**. Aucune option propre, pas de source de condition (valeur objet, comme la PJ).
  ⚠️ L'aperçu du builder **ne simule ni la BAN ni la carte** (le Socle n'appelle aucun service
  tiers depuis le builder) : c'est Nora qui complète, dessine et produit la valeur.
  ⚠️ Jusqu'au 2026-09-22, la palette insérait à la place une **section de sept champs** d'adresse
  (clés `intervention_numero` … `intervention_ville`) ; les démarches qui la portent la
  **gardent** (rien n'est migré), Iris continue de la lire par ses clés. Les champs
  **existants** se déplacent au glisser-déposer entre racine et sections (entrée/sortie/changement
  de section) : un **seul `DndContext`** couvre tout le canevas (pas de contexte imbriqué dans
  `SectionEditor`, sinon les champs restent prisonniers de leur conteneur) ; logique pure
  `formReorder.ts` (`insertNode`/`moveNode`, testée), position avant/après déduite du point de dépôt.
- **Communication** → colonne `procedures.communication_config` (JSONB) : schéma **possédé**
  (contrat consommé en aval), organisé en **blocs** pour que les réglages à venir de l'étape
  s'ajoutent en clés voisines sans déplacer l'existant. Premier bloc, **`visibility`** :
  `portalVisible` (proposée sur le portail usagers), `publicationPeriodEnabled` +
  `publicationStart`/`publicationEnd` (`AAAA-MM-JJ`, **bornes incluses**, chacune facultative).
  Aucun comportement branché pour l'instant — le Socle **enregistre et publie**, l'aval s'y adosse.
  ⚠️ Les deux commutateurs sont **actifs par défaut**, et une colonne **NULL** (démarche jamais
  passée par l'étape — c'est le cas de toutes les existantes) se lit comme ces défauts : la traiter
  comme « non publiée » dépublierait tout le catalogue d'un coup. ⚠️ Désactiver la période
  **conserve** les dates (le commutateur gouverne l'usage, pas la donnée — même parti que
  `email_sender_name`) : un consommateur qui applique les dates sans regarder le commutateur
  dépublie à tort. Une fin antérieure au début est refusée à la saisie (`publicationPeriodError`) :
  elle ne publierait jamais. Logique pure + parseur robuste `communication.ts` (testé), UI
  `steps/CommunicationStep.tsx`.
  Second bloc, **`documents`** (« Documents et courriers », 2026-09-01) : quels documents du
  catalogue (`document_templates`) l'agent peut produire depuis cette démarche. Deux listes
  distinctes — `documents` puise dans les types `interne`/`externe`, `letters` dans `courrier` —
  plus `restrictVisibility`. Chaque entrée est `{id, visibility}` où `visibility` vaut `toujours`,
  `positive` ou `negative` (l'issue de la demande).
  ⚠️ La condition est **par document**, pas globale au bloc : c'est ce qui permet à une même
  démarche de porter une lettre d'acceptation *et* une lettre de refus. ⚠️ `restrictVisibility`
  **faux** rend toutes les conditions sans effet, et les conserve (motif `publicationPeriodEnabled`) :
  un consommateur qui applique les `visibility` sans lire le drapeau masque des documents rendus
  visibles. ⚠️ Défauts **vides**, contrairement à `visibility` dont les défauts sont actifs : une
  colonne NULL ne doit pas déverser le catalogue dans chaque démarche. ⚠️ Le JSON ne porte **pas de
  clé étrangère** : une sélection survit à la suppression de son document — l'UI comme l'API
  **écartent** les références mortes (`resolveDocuments`, testé). UI : `steps/communication/DocumentsBlock.tsx`.
  **En aval** : servi **résolu** dans `Procedure.documents` par `public-api` (contrat 1.6.0), à
  côté du catalogue `GET /v1/document-templates` — voir feature « API publique ».
- **Base de connaissances** → colonne `procedures.knowledge_base` (JSONB) : informations à destination
  de **l'agent et de son assistant LLM**, schéma **possédé** (contrat consommé en aval). Champs : texte
  d'aide agent & procédures (**Markdown**, aperçu via `markdown.ts` — rendu HTML échappé, aucune
  dépendance), liens utiles agent + sources IA (`{url, description}`), FAQ (`{question, answer}`),
  garde-fous (liste). Deux jeux de **documents** (aide agent PDF/image ; entraînement IA formats
  étendus, 10 fichiers max chacun) : **téléversement fonctionnel** vers le bucket privé Supabase
  `procedure-documents` (voir feature ci-dessous), référencés dans le JSON par `{path, name}`
  (`agentDocuments`/`trainingDocuments`). Logique pure + parseur robuste `knowledgeBase.ts`
  (testé), UI `steps/KnowledgeBaseStep.tsx` (+ `steps/connaissances/*`).
  ⚠️ **Ce qu'un consommateur en fait, depuis le 2026-09-19** : l'assistant d'Iris PROPOSE à
  l'agent de consulter les **sources IA** et les **documents d'entraînement**, et n'en lit le
  contenu **qu'avec son accord** (même règle pour les `recommendedSources` d'une collectivité —
  journal des API du 2026-09-19). Conséquence pour qui rédige : une source en ligne est une
  page **https publique et stable**, pas une page d'accueil ; un document d'entraînement est
  servi par `GET /v1/documents/signed-url`, et un PDF **scanné** ne sera pas lu (le
  consommateur l'annonce « non lu » plutôt que d'en deviner le contenu).
- **Communication usager** (2026-09-18) → colonne `procedures.user_communication` (JSONB) : ce que
  la collectivité écrit **pour ses usagers**, schéma **possédé**, organisé en **blocs** voisins
  comme `communication_config`. `delays` (durée habituelle d'instruction : valeur + unité),
  `audience.note` (précision éditoriale), `attachments.items` (`{label, description}` — pièces
  annoncées), `faq.items` (`{question, answer}` — FAQ usager).
  ⚠️ **INVARIANT : TOUT CE QUE PORTE CETTE COLONNE EST PUBLIC.** C'est ce qui permet de la servir
  **telle quelle** au portail, sans whitelist clé par clé — comme `form_schema` et
  `requester_config`. Rien de ce qui sert à INSTRUIRE n'y entre : cela vit dans `knowledge_base`
  (agent et IA) ou dans `communication_config` (diffusion, documents de l'agent), qui ne
  traversent ni l'un ni l'autre. Le jour où l'on sera tenté d'y poser un réglage interne, il faut
  lui trouver une autre maison.
  ⚠️ **Défauts VIDES**, à l'inverse du bloc `visibility` de `communication_config` dont les
  défauts sont actifs : une colonne NULL veut dire « la collectivité n'a rien écrit ». Lui
  inventer un délai ou une FAQ publierait en son nom ce qu'elle n'a pas dit.
  ⚠️ **LE DESCRIPTIF N'EST PAS DANS CE JSON** : c'est la colonne `user_description`, qui existait,
  qui était **déjà publiée** (liste **et** détail portail) et que plus aucun écran ne remplissait.
  Lui créer une clé JSONB voisine aurait fait deux sources de vérité pour un même texte. Elle est
  en **Markdown** depuis le 2026-09-18 — décidé pendant qu'elle était nulle sur les 51 démarches
  de la plateforme ; le même choix pris après coup aurait réinterprété des textes déjà publiés.
  ⚠️ **TROIS DESCRIPTIFS COHABITENT** : `short_description` (résumé d'une ligne, étape
  « Descriptif », texte brut, traduit), `user_description` (le descriptif complet, étape
  « Communication usager », Markdown) et `agent_description` (interne, publié sur `Procedure`
  mais **jamais** au portail).
  ⚠️ **TROIS DURÉES, aucune ne se déduit d'une autre** : `input_duration_minutes` (étape
  « Descriptif », en **minutes**) = combien de temps l'usager met à **remplir** ·
  `user_communication.delays` (valeur + **unité explicite** : `jour_ouvre`, `jour`, `semaine`,
  `mois`) = combien de temps la collectivité met à **répondre** ·
  `communication_config.visibility.publicationStart/End` = **entre quelles dates** la démarche est
  proposée. Les deux premières sont servies au portail côte à côte et se confondent au premier
  coup d'œil : les libellés d'écran (« Durée de saisie (minutes) » / « Durée habituelle
  d'instruction ») et les descriptions OpenAPI les séparent explicitement. ⚠️ **L'unité est dans
  la donnée, jamais déduite du nombre** ; ⚠️ **`0` est relu comme non renseigné** — afficher
  « 0 jour » promettrait une réponse immédiate.
  ⚠️ **LE PUBLIC CONCERNÉ NE SE RÈGLE QU'À UN ENDROIT** : l'étape « Informations demandeur »
  (`requester_config`), d'où `enabledAudiences` tire les publics publiés en
  `PortalProcedure.audiences` — le filtre « Je suis… » du portail. L'étape « Communication
  usager » les **rappelle en lecture seule** et n'ajoute qu'une note éditoriale.
  ⚠️ **Cette note ne filtre rien** (motif `access_mode`, qui ne publie ni ne dépublie) : c'est une
  phrase que l'usager lit, pas une règle qu'une machine applique. En cas de contradiction avec
  `audiences`, **`audiences` fait foi** — écrit aux trois endroits où un consommateur regarde
  (DTO, schéma OpenAPI, changelog).
  ⚠️ **`attachments.items` N'EST PAS LA LISTE DES PIÈCES À TÉLÉVERSER** : ce sont les champs
  `attachment` de `form_schema`, typés (`documentTypeId`), parfois conditionnels, et servis sur
  le **même** détail portail. `items` est un texte d'**annonce** : il peut les recouper
  volontairement (on n'annonce pas une pièce comme on la collecte) et porter ce qui ne se dépose
  pas en ligne. L'étape affiche les pièces du formulaire **en lecture seule** (helper pur
  `attachmentFields`) précisément pour que personne ne les recopie. ⚠️ En aval, **ne pas les
  concaténer** (la même pièce s'afficherait deux fois) ni n'afficher `items` seul.
  ⚠️ **DEUX FAQ, UNE SEULE SORT** : `user_communication.faq.items` est publiée sur le site de
  démarches ; `knowledge_base.faq` est écrite pour **l'agent et son assistant LLM** et n'a jamais
  traversé vers le portail (test anti-fuite de `serializers.test.ts`). Même forme
  (`{question, answer}`), deux destinataires : **elles ne se fusionnent jamais**. Les libellés
  d'écran les séparent (« FAQ usager » / « FAQ interne (agent et IA) ») — c'est la seule
  protection contre un agent qui répondrait à l'usager dans la mauvaise case.
  ⚠️ **L'étape écrit TROIS colonnes dans UNE seule mutation** (`user_description`,
  `user_communication` et `translations`) : c'est le seul endroit du stepper où une étape persiste
  une colonne texte en plus de son JSON — et la traduction de ce texte. Les scinder laisserait
  l'agent devant un écran à moitié enregistré sans qu'il puisse le savoir — un test l'épingle.
  **Traductions** (2026-09-18, voir feature « Langues ») : chaque texte a les siennes, repliées
  sous lui. Le descriptif est une colonne → `translations.<code>.user_description`, et l'étape
  ne réécrit **que ce champ** de `translations` (le libellé traduit à l'étape « Descriptif » lui
  survit, et réciproquement). La note, les pièces et les questions vivent dans le JSON → leur
  traduction vit **sur l'entrée** (`translations` de chacune) et la suit quand on réordonne. ⚠️ Une
  entrée sans texte français est écartée à l'enregistrement, traductions comprises : elles
  n'auraient rien sur quoi se replier.
  **En aval** (contrat 1.24.0) : `user_communication` sur `Procedure` **et** sur
  `PortalProcedureDetail`, transmis tel quel — traductions des entrées comprises depuis **1.26.0**
  (schéma `UserCommunicationTranslations`). ⚠️ **Rien sur la LISTE** `GET
  /v1/portal/procedures` : ce contenu appartient à la page d'une démarche, pas à un catalogue —
  un test épingle ses neuf champs des deux côtés. ⚠️ Toute colonne absente du **select explicite**
  du détail (`index.ts`) arrive `undefined` et devient `null` en silence : ajouter le champ au DTO
  ne suffit pas.
  Logique pure + parseur robuste `userCommunication.ts` (testé), UI
  `steps/UserCommunicationStep.tsx` (+ `steps/usager/*` : `PiecesEditor`, `Recaps`).
  Migration `procedures_communication_usager`.
- RLS `procedures` : écriture `is_super_admin() OR is_org_admin(organization_id)` (la policy
  permissive `write procedures` par `global_role` a été retirée → isolation tenant). Suppression
  réservée au superadmin (UI).
- Code : `src/features/procedures/` — `useProcedures.ts`, `useWritableRootOrganizations.ts`,
  `Stepper.tsx`, `ProcedureEditor.tsx`, `ProceduresListPanel.tsx`, `ProceduresPage.tsx` (admin
  `/demarches`), `ProcedureEditorPage.tsx` (`variant` admin/superadmin). Étapes : `steps/DescriptifStep`,
  `steps/DemandeurStep`, `steps/FormulaireStep` (+ `steps/formulaire/*` : `FieldPalette`, `SectionEditor`,
  `FieldRow`, `ConditionEditor`, `FormPreview`, `FormatsPicker`),
  `steps/UserCommunicationStep` (+ `steps/usager/*`), `steps/CommunicationStep`,
  `steps/KnowledgeBaseStep` (+
  `steps/connaissances/*` : `MarkdownField`, `LinkListEditor`, `FaqEditor`, `StringListEditor`,
  `DocumentsUploader`, `controls`), `steps/PlaceholderStep`. Stockage des documents :
  `procedureStorage.ts` (logique pure de chemin/validation, testée) + `useProcedureDocuments.ts`
  (upload/suppression/URL signée). Logique pure **testée** : `requesterFields.ts`,
  `formSchema.ts`, `formReorder.ts`, `conditions.ts`, `formats.ts`, `knowledgeBase.ts`,
  `communication.ts`, `userCommunication.ts`, `procedureStatus.ts`, `procedureAccess.ts`,
  `markdown.ts`, `procedureStorage.ts`.
  Superadmin : section « Catalogue de démarches » dans `OrgSettingsPage` (racine uniquement).
- Prérequis : une racine sans **catégorie** ne permet pas de créer une démarche (catégorie
  obligatoire) → créer d'abord des catégories via `/categories`.
- La **pièce justificative** porte un `documentTypeId?: string` référençant un type du catalogue
  `document_types` (voir feature ci-dessous). Le type est **obligatoire à la saisie** : `FormulaireStep`
  bloque l'enregistrement tant qu'une PJ n'est pas typée (helper pur `attachmentFieldsMissingDocumentType`,
  testé) et signale les champs fautifs. Le sélecteur charge le catalogue de la racine via
  `useDocumentTypesForOrg`. Les **formats acceptés** se saisissent via `FormatsPicker` (puces
  retirables + formats courants en un clic + saisie libre ; logique pure `formats.ts`, testée).
  L'**aperçu** (`FormPreview`) affiche les formats autorisés et le nombre de fichiers max, et applique
  la borne `maxFiles` (l'attribut HTML `multiple` seul n'impose aucune limite) : une sélection trop
  grande est refusée.

## Stockage des documents (bucket privé `procedure-documents`)

Les documents de la **base de connaissances** sont stockés dans un **bucket Supabase privé**
`procedure-documents` (25 Mio max/fichier), **multi-tenant strict** comme les démarches — mais
l'isolation est portée par le **RLS de `storage.objects`**, pas par une colonne.

- **Convention de chemin** (le RLS s'appuie dessus) :
  `{organization_id}/{procedure_id}/{agent|training}/{uid}-{fichier}`. Le **1er segment est
  l'organisation principale (racine)** de la démarche.
- **RLS `storage.objects`** (policies scopées `bucket_id = 'procedure-documents'`, rôle
  `authenticated`) : lecture `has_org_access(org_id)`, écriture (INSERT/UPDATE/DELETE)
  `is_org_admin(org_id)` — où `org_id = ((storage.foldername(name))[1])::uuid`. Reflète l'écriture
  des `procedures` (`is_super_admin` court-circuité par `is_org_admin`).
- **Consultation** via **URL signée temporaire** (bucket privé, pas d'accès public).
- Référence stockée dans `procedures.knowledge_base` : `{ path, name }` (`KbDocument`). Upload
  **immédiat** à la sélection (le chemin est persisté à l'enregistrement de l'étape ; un fichier
  téléversé puis abandonné sans enregistrer laisse un objet orphelin — acceptable pour l'instant).
- Code : `procedureStorage.ts` (pur, testé : chemin, formats, taille), `useProcedureDocuments.ts`
  (hooks upload/suppression + `createSignedDocumentUrl`), UI `steps/connaissances/DocumentsUploader`.

## Démarches partenaires (Arpège…) — 2026-10-02

Une démarche peut appartenir à un **partenaire** (`procedures.integration_id`,
`external_reference`, `partner_config`) : importée depuis l'intégration, elle se dépose chez le
partenaire (depuis Clara), **jamais au portail ni dans Iris**. Ses informations demandeur et
son formulaire sont ceux du partenaire : le stepper ne montre que Descriptif et Base de
connaissances, et l'annonce par un bandeau. Détail, règles de
visibilité et d'import : [intégrations partenaires](integrations.md).

## Écran « Démarches activées » — par catégorie (2026-10-03)

`OrganizationProceduresTab` (super admin et onglet de l'administrateur) range le catalogue par
catégorie (`groupProceduresByCategory` : alphabétique, « Sans catégorie » en dernier), avec un
compteur et un bouton **« Tout activer »** par catégorie, et un « Tout activer » global (avec
confirmation). ⚠️ Un seul upsert (`useEnableProcedures`) : tout passe ou rien. Les démarches
qu'une autre organisation du même porteur tient déjà sont donc écartées d'avance
(`procedureIdsToEnable`), sinon `enforce_single_offer_per_bearer` refuserait le lot entier. Pas
de « tout désactiver » : on relâche une démarche à la fois.

## Pictogrammes des catégories (2026-10-10)

`categories.icon` prend sa valeur dans un catalogue **fermé** : `ICON_GROUPS` de
`src/features/categories/icon-options.ts` (69 pictogrammes rangés par thème — administratif,
enfance et jeunesse, santé, cadre de vie, mobilité, sports et culture, économie et sécurité ;
sélecteur `IconPicker`). La valeur est un nom d'icône **Lucide** en kebab-case.
- ⚠️ **Contrat public** : servie par `CategoryDto.icon` et, depuis la 1.41.0, par
  `PortalCategoryRef.icon` dans la **liste** du portail (`/v1/portal/procedures`), que Nora dessine
  sur chaque carte. On **ajoute** des valeurs, on n'en renomme ni n'en retire (la catégorie
  retomberait sur le pictogramme neutre). Le libellé et le groupe sont libres.
- ⚠️ **Deux listes épinglées** : `icon-options.test.ts` ici, `categoryIcons.test.tsx` dans Nora.
  Nora n'embarque pas Lucide : son registre `categoryIcons.ts` est **généré** depuis ce fichier
  (`node scripts/generate-category-icons.mjs ../socle`, dans le dépôt Nora). Ajouter un
  pictogramme = l'ajouter ici, régénérer Nora, recopier la liste dans les deux tests.
- L'aperçu de l'éditeur du site (`DemarchesSection`) rend la même carte que Nora : pictogramme de
  la catégorie, pastille « À la une », catégorie, nom, résumé, organismes, puis durée et flèche.
