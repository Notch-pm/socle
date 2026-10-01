# Journal des évolutions des API publiques

> **Public** : équipes consommatrices (Ariane, Clara, Iris, partenaires) · **Question traitée** :
> quand un contrat d'API a-t-il changé, et comment ? · **Dernière mise à jour** : 2026-10-01

Journal **append-only** : chaque évolution de la surface de contrat des API publiques
(`public-api`, `contacts-api`, `ai-api`, `audience-api`) — endpoint, paramètre, champ de réponse,
comportement d'authentification — ajoute une entrée datée en tête de liste. Une entrée n'est jamais
réécrite ; une correction s'ajoute sous une nouvelle date. Politique de compatibilité et obligations
consommateur : [integration.md](./integration.md#politique-de-compatibilité-v1).

Format d'une entrée : `## AAAA-MM-JJ — <api> — ajout|correctif|rupture`

---

## 2026-10-01 — public-api — ajout (attributions des organisations)

Nouvelle route **`GET /v1/organizations/attributions?tenant_id=<uuid>`** (scope `read`) : ce que
chaque organisme de la collectivité **traite et ne traite pas**, rédigé dans l'onglet
« Attributions » du Socle — pour orienter une demande ou un courrier vers le bon service. Version
du contrat : **1.33.0**. Ajout **additif**.

Réponse : un **tableau nu**, une entrée par organisme **actif** du sous-arbre qui a écrit un texte.

```json
[
  {
    "id": "6f1c…",
    "name": "Services techniques",
    "is_internal_service": true,
    "attributions": "Traite : voirie, éclairage public, propreté.
Ne traite pas : stationnement.",
    "updated_at": "2026-10-01T08:00:00Z"
  }
]
```

- ⚠️ **Services internes compris**, contrairement à `GET /v1/portal/organizations` : ce sont
  souvent eux qui instruisent.
- ⚠️ **Interne** : destiné aux agents et à leurs outils IA, jamais à un usager ; aucune route
  `/v1/portal/*` ne le sert. Distinct du descriptif public des informations usagers et des
  recommandations aux agents (racine seule).
- Markdown, en français, 2 000 caractères au plus, jamais vide. **Pas d'héritage** : un organisme
  absent n'a rien écrit. La collectivité en tête si elle a écrit, puis les autres par nom.
- `tenant_id` invalide ⇒ `400` ; hors périmètre de la clé ⇒ `404` ; rien d'écrit ⇒ `200 []`.
- **Consommateur** : **Clara** (proposition du service instructeur d'un courrier).

---

## 2026-09-24 — public-api — ajout (couleur et ombre des textes du bloc de recherche)

Chaque section **`recherche`** de `GET /v1/portal/page` porte deux champs de plus, qui habillent
le **titre et le sous-titre posés sur l'image de fond** — pour qu'ils restent lisibles sur une
photo aux couleurs variées. Version du contrat : **1.32.0**. Ajout **additif**.

| Champ | Type | Sens |
|---|---|---|
| `text_color` | `"theme"` \| `"white"` | Encre du thème (rendu d'avant l'option) ou blanc |
| `text_shadow` | booléen | Ombre portée **sans décalage** : un halo qui part de tous les côtés |

- ⚠️ **Sans objet quand `image_url` est vide**, et à ignorer alors : un titre blanc sur la page
  blanche disparaîtrait. La valeur est conservée telle quelle (motif `image_full_width`).
- ⚠️ **L'ombre prend le contre-pied du texte** : sombre sous `white`, claire sous l'encre du
  thème — une ombre noire sous une encre presque noire épaissit les lettres sans rien détacher.
  Rendu du Socle : `text-shadow: 0 0 2px, 0 0 8px, 0 0 18px` (noir à 70/55/40 %, ou blanc à
  85/70/50 %), aucune composante décalée.
- Toujours présents, y compris sur une page publiée avant l'option (`"theme"`, `false`) ; une
  valeur inconnue retombe sur `"theme"`.
- **Consommateur** : **Nora** (page d'accueil du portail).

---

## 2026-09-24 — public-api — ajout (téléphone et courriel des organismes du portail)

Chaque élément de **`GET /v1/portal/organizations`** porte désormais le **téléphone** et le
**courriel** de la fiche de l'organisme (onglet « Informations de base » du Socle). Version du
contrat : **1.31.0**. Ajout **additif**.

```json
{ "id": "…", "name": "Mairie de Plounéour", "slug": "plouneour", "is_tenant": true,
  "phone": "02 98 00 00 00", "email": "accueil@plouneour.fr",
  "updated_at": "2026-09-24T08:00:00+00:00", "info": { … } }
```

- `phone`, `email` : chaînes telles que saisies (espaces de bord retirés), **`null`** si non
  renseignées — toujours présentes.
- ⚠️ **La liste s'élargit** : un organisme affiché qui n'a rien écrit dans « Informations
  usagers » mais a un téléphone ou un courriel **est désormais listé**, avec ses quatre rubriques
  vides et `updated_at: null`. Un consommateur qui supposait « listé ⇒ a des horaires ou un
  descriptif » doit relire `info`.
- ⚠️ **Pas d'héritage**, comme pour les horaires : ne donnez pas le numéro du parent à un organisme
  qui n'en a pas.
- **Consommateur** : **Nora** (assistant du portail, qui peut désormais dire comment joindre
  l'organisme).

---

## 2026-09-24 — public-api — ajout (informations usagers des organismes)

**Chaque organisme peut dire au public qui il est, quand il ouvre, et répondre aux questions
fréquentes** — onglet « Informations usagers » du Socle, sur toute organisation (racine comme
sous-organisation). Nouvelle route **`GET /v1/portal/organizations?tenant_id=`**, tag « Portail »,
scope `read`. Version du contrat : **1.30.0**. Ajout **additif** : rien d'autre ne change.

```json
[
  {
    "id": "d5227d25-f327-493a-a9a2-278397531e33",
    "name": "Mairie de Plounéour",
    "slug": "plouneour",
    "is_tenant": true,
    "updated_at": "2026-09-24T08:00:00+00:00",
    "info": {
      "description": "La mairie vous accueille pour l'état civil, l'urbanisme et les élections.",
      "openingHours": [
        { "day": "monday", "morningOpen": "08:30", "morningClose": "12:00", "afternoonOpen": "13:30", "afternoonClose": "17:00" },
        { "day": "saturday", "morningOpen": "09:00", "morningClose": null, "afternoonOpen": null, "afternoonClose": "12:00" }
      ],
      "openingHoursNotes": "Fermé les jours fériés.",
      "faq": [{ "question": "Faut-il prendre rendez-vous ?", "answer": "Seulement pour les passeports." }]
    }
  }
]
```

- **Public** : fait pour être affiché, et c'est le **corpus de l'assistant du portail** pour
  « à quelle heure ouvre la mairie ? ». Pendant usager de `/v1/organizations/{id}/agent-guidance`,
  qui reste interne — ne composez jamais l'un avec l'autre.
- Collectivité **en tête** (`is_tenant: true`), puis les autres organismes par nom. Ne sont listés
  que les organismes **affichés** (actifs, pas service interne) qui ont **écrit** quelque chose.
- ⚠️ **Pas d'héritage** : un organisme absent de la liste n'a rien dit. Ne lui prêtez pas les
  horaires de son parent.
- `openingHours` est **structuré** (schéma `DayOpeningHours`) : un élément par jour d'ouverture,
  dans l'ordre de la semaine (`monday` → `sunday`), heures en `HH:MM` 24 h, strictement
  croissantes. `morningOpen` et `afternoonClose` toujours présents ; `morningClose` /
  `afternoonOpen` (pause de midi) valent `null` **ensemble** quand l'accueil est continu.
- ⚠️ **Un jour absent est fermé**, mais une liste **vide** veut dire « horaires non renseignés » :
  n'annoncez pas un organisme fermé toute la semaine.
- `openingHoursNotes` (Markdown, vide = rien à signaler) porte ce que la grille ne dit pas :
  fermetures exceptionnelles, jours fériés, horaires d'été, permanences. ⚠️ Il **nuance**
  `openingHours` : lisez-le avant d'affirmer qu'un organisme est ouvert un jour donné.
- Textes (descriptif, FAQ) en Markdown, en français ; pas de `translations` pour l'instant.
- Enregistré = publié (pas de brouillon). Rien d'écrit ⇒ `200 []` ; collectivité hors périmètre
  ⇒ `404`.
- **Consommateur** : **Nora** — page d'accueil ou d'organisme, et **assistant du portail**, qui doit
  ajouter cette route à son corpus. **Iris** peut la lire aussi pour répondre au guichet.

---

## 2026-09-22 — public-api — ajout (lieu d'intervention : champ `location`)

**Le lieu d'intervention devient un champ de formulaire à part entière : une adresse sur une
ligne, complétée par la Base Adresse Nationale, et un point que l'usager peut déplacer dans un
rayon de 150 m pour désigner l'endroit exact.** Nouveau type `location` dans `form_schema`
(version du schéma **inchangée : 1**) ; sa réponse, dans `form_data[key]`, est un **objet**
`LocationValue` et non une chaîne. Version du contrat : **1.29.0**. Ajout **additif** : un
consommateur qui ignore les types inconnus n'affiche pas le champ, et rien d'autre ne change.

```json
"intervention_lieu": {
  "address": "10 Avenue de Frémeur 44000 Nantes",
  "lat": 47.2234, "lon": -1.5731,
  "precision": "adresse",
  "adjusted": true
}
```

| Clé | Type | Sens |
|---|---|---|
| `address` | string, jamais vide | Le libellé BAN entier si une proposition a été retenue, **sinon le texte tapé** (retenir une proposition reste facultatif : la BAN ignore les adresses neuves) |
| `lat`, `lon` | number ou `null`, **ensemble** | Le **point retenu** (WGS 84) : celui de l'adresse, ou celui où l'usager l'a déplacé. `null` en saisie libre |
| `precision` | `adresse` · `voie` · `lieu_dit` · `commune` · `null` | Finesse de la proposition BAN retenue |
| `adjusted` | boolean | L'usager a déplacé le point (de 150 m au plus) : il diffère de celui de l'adresse |

- **Le type est structurel** : reconnaissez le champ par `type === "location"`, jamais par sa
  clé (`intervention_lieu` n'est qu'un défaut, modifiable par l'agent).
- ⚠️ **Un point présent ne se géocode pas.** Le point de l'usager est plus précis que tout
  géocodage de `address` ; géocodez seulement quand `lat`/`lon` sont `null`.
- ⚠️ **L'adresse ne bouge pas** : déplacer le point ne réécrit jamais `address`. Un itinéraire
  peut viser les coordonnées quand `adjusted` est vrai, l'adresse sinon.
- ⚠️ **L'ancien bloc subsiste sur les démarches paramétrées avant cette date** : une section
  ordinaire de champs texte aux clés `intervention_numero`, `intervention_btq`,
  `intervention_voie`, `intervention_complement`, `intervention_appartement`,
  `intervention_code_postal`, `intervention_ville`. Rien n'est migré ; la palette ne le propose
  plus (`createLieuInterventionSection` est retirée du Socle). Un consommateur lit les deux
  formes tant que des démarches portent l'ancienne.
- Un objet illisible (adresse vide, `lat` sans `lon`, précision hors vocabulaire…) vaut **non
  renseigné** ; les clés inconnues s'ignorent. Le déplacement est borné **à la saisie** (portail)
  et la forme revalidée à la frontière ; aucun serveur ne connaît le point de l'adresse pour
  revérifier les 150 m.
- Le champ n'est **pas** une source de condition (`visibleIf`) : valeur objet, non comparable —
  comme une pièce justificative.
- **Consommateur** : **Nora** rend le champ (adresse assistée + carte OpenStreetMap, déplacement
  au pointeur et au clavier) et produit la valeur ; **Iris** la lit (fiche, carte des
  interventions, itinéraire) et l'écrit à la création guichet. ⚠️ Iris : un type inconnu **vide
  tout le schéma** dans son moteur de formulaire (client, edge function et jumeau SQL
  `form_field_valid`) — le miroir doit être livré **avant** qu'une démarche publiée porte le champ.

---

## 2026-09-22 — ai-api — correctif (partage du plafond, 1.3.0)

**Une part du plafond peut désormais être RÉSERVÉE à une application — en jetons ou en pourcentage
vivant du plafond — et les applications sans part se partagent le reste, auquel elles sont
bornées.** Aucun champ, aucune route, aucun code d'erreur ne change ; la **sémantique des chiffres
rendus** change, d'où le passage du contrat `ai-api` à **1.3.0** et la qualification « correctif ».

- **Ce qui change pour un consommateur : rien, tant qu'aucune part n'est réservée dans la
  collectivité.** Les chiffres sont alors ceux du plafond commun, comme avant.
- ⚠️ **L'entrée du 2026-09-20 ne vaut plus** sur un point : elle disait qu'Iris et Clara « ne sont
  pas touchées ». Dès qu'une part est réservée à une autre application (l'assistant du portail,
  `nora`), une application **sans part peut être refusée avant que le plafond commun soit
  atteint** — par le **même** `429 ai_quota_exceeded`, avec le même message daté. Le geste attendu
  est identique : relayer le message, ne pas réessayer avant le renouvellement.
- ⚠️ **Les chiffres sont désormais ceux de l'application appelante**, partout et de façon
  cohérente — `quota` d'un appel accepté, `quota` du `429`, et `GET /v1/usage` : pour une
  application avec part, `limit`/`used_tokens`/`reserved_tokens` sont ceux de **sa part** ; pour
  une application sans part, `limit` est le **plafond commun moins les parts des autres** (stable
  dans le mois) et `used_tokens`/`reserved_tokens` excluent l'engagé des parts.
  `remaining_tokens = limit − used − reserved` est exactement ce que la prochaine réservation
  laissera passer. Un écran qui affichait « consommé / plafond de la collectivité » affiche
  désormais « consommé par nous / notre plafond » — c'est ce qu'il voulait dire.
- `by_consumer` de `GET /v1/usage` reste la ventilation de **toute la collectivité**.
- Un pourcentage sans plafond commun est **sans effet** (la part ne borne personne) ; une part en
  jetons plus grande que le plafond s'y borne. Aucun de ces cas ne produit d'erreur côté API.

---

## 2026-09-20 — ai-api — ajout (sous-plafond par application)

**Une application peut désormais porter une borne mensuelle propre, en plus du plafond commun de
la collectivité.** Aucun champ, aucune route, aucun code d'erreur ne change : version du contrat
`ai-api` **inchangée**.

- **Ce qui change pour un consommateur : rien, tant qu'aucun sous-plafond ne le concerne.** Le
  plafond de la collectivité reste commun à toutes les applications.
- Quand le super administrateur pose un sous-plafond pour **votre** application, vos appels peuvent
  être refusés **avant** que le plafond commun soit atteint — par le **même** `429` de code
  `ai_quota_exceeded`, avec le même message daté. L'objet `quota` rendu porte alors les chiffres du
  **sous-plafond** (`limit`, `used_tokens`, `reserved_tokens`). Le geste attendu est identique :
  relayer le message, ne pas réessayer avant le renouvellement.
- Première application concernée : `nora` (assistant du portail usagers, ouvert à des visiteurs
  anonymes). Iris et Clara ne portent aucun sous-plafond et ne sont pas touchées.

---

## 2026-09-20 — public-api — ajout (assistant du portail usagers)

**Ce que la collectivité a ouvert de l'assistant conversationnel de son site.** Nouveau champ
`assistant` sur la réponse de `GET /v1/portal/tenant`. Version du contrat : **1.28.0**. Ajout
**additif** : rien ne change pour qui ne le lit pas.

```json
"assistant": { "enabled": false, "deposit_enabled": false }
```

- `enabled` — l'assistant est proposé sur le site : il renseigne et oriente. `deposit_enabled` —
  il peut en outre recueillir les réponses d'un formulaire dans la conversation (le dépôt reste un
  geste de l'usager).
- ⚠️ **Toujours présent, jamais `null`** : rien de réglé ⇒ tout à `false`. Face à un Socle d'avant
  1.28.0, lisez une **absence** comme un assistant fermé.
- ⚠️ **Le commutateur s'applique à la frontière** : `deposit_enabled` n'est `true` que si `enabled`
  l'est (la base, elle, conserve la valeur). Lisez chaque booléen tel quel, sans les croiser.
- Réglé par le **super administrateur**, sur l'organisation principale (fiche du client ›
  « Assistant du portail usagers ») ; héritage **déjà résolu** quand le domaine désigne une
  sous-organisation. **Effet immédiat** — il ne passe pas par « Publier ».
- **Deux faits publics, rien d'autre** : ni prompt, ni alias d'agent, ni plafond. Le Socle ne
  compose aucun prompt ; le portail bâtit le sien à partir de ce que `/v1/portal/*` sert déjà et le
  confie à `ai-api` (scope `ai`, clé dédiée).

---

## 2026-09-19 — public-api — correctif (sources recommandées : consultables par un assistant)

**Une phrase du contrat 1.27.0 disait l'inverse de ce que fait désormais Iris.** La description de
`GET /v1/organizations/{id}/agent-guidance` affirmait que les `recommendedSources` sont « des liens
à citer — un assistant ne les consulte pas pour autant », et l'aide de l'onglet « Recommandations
aux agents » qu'il « les cite sans jamais les ouvrir ». Depuis le 2026-09-19, l'assistant d'Iris
peut **proposer** à l'agent de consulter ces sources — comme les sources en ligne IA d'une
démarche (`knowledge_base.aiSources`) — et n'en lit le contenu **qu'avec son accord**. Les deux
textes le disent désormais.

- **Aucun champ ne bouge**, aucune route : contrat toujours **1.27.0**.
- La lecture est faite **par le consommateur**, depuis son propre serveur : le Socle ne va chercher
  aucune page, et `ai-api` reste sans outil (`tools` toujours refusé).
- **Pour qui rédige les sources** : une adresse en `https` publique peut désormais être lue et
  résumée à un agent. Préférez une page stable et officielle à une page d'accueil.

---

## 2026-09-19 — public-api — ajout (recommandations aux agents)

**Ce que la collectivité dit à ses agents, pour toutes ses démarches à la fois.** Nouvel onglet
« Recommandations aux agents » sur l'organisation principale, servi par une route nouvelle. Version du
contrat : **1.27.0**. Ajout **additif** : rien ne change pour qui ne l'appelle pas.

`GET /v1/organizations/{id}/agent-guidance` — scope `read`, 404 hors périmètre :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `organization_id` | uuid | L'organisation demandée |
| `source_organization_id` | uuid ou `null` | Celle qui porte les recommandations (sa racine) ; `null` si rien n'est écrit |
| `configured` | booléen | Au moins une rubrique est remplie |
| `updated_at` | date-heure ou `null` | Dernier enregistrement |
| `guidance.roleDescription` | Markdown | Rôle des agents |
| `guidance.physicalReception` | Markdown | Spécificités de l'accueil physique |
| `guidance.guidelines[]` | `{ title, text }` | Consignes générales, dans l'ordre de lecture |
| `guidance.faq[]` | `{ question, answer }` | FAQ des agents |
| `guidance.recommendedSources[]` | `{ url, description }` (`KbLink`) | Sources de données recommandées |

- **C'est la version GLOBALE de `knowledge_base`** : même public (l'agent et son assistant IA),
  mêmes formes pour la FAQ et les liens — votre parseur de `knowledge_base` les lit déjà. Les deux ne
  se fusionnent pas : montrez-les côte à côte, et dites à votre assistant que **la consigne de la
  démarche l'emporte sur la consigne générale**.
- ⚠️ **Interne** : jamais sur une page destinée à un usager. Aucune route `/v1/portal/*` ne le sert.
- ⚠️ **Rédigées sur l'organisation principale seulement** : interroger une sous-organisation rend
  celles de sa racine. Le jour où un organisme pourra avoir les siennes, `source_organization_id` le
  dira sans rupture.
- **Rien d'écrit ⇒ 200**, `configured: false` et cinq rubriques **vides, jamais absentes**.
- ⚠️ **« Consignes générales », pas « procédures »** : ce mot désigne les démarches.
- **Consommateur** : Iris (base de connaissances et assistant IA). Rien à faire pour les autres.

---

## 2026-09-18 — public-api — ajout (traduction de la communication usager)

**Ce que la collectivité écrit pour ses usagers se traduit dans ses langues.** L'étape
« Communication usager » propose, sous chaque texte, ses traductions dans les langues activées par
la collectivité, avec la traduction automatique habituelle. Version du contrat : **1.26.0**. Ajout
**additif** : un consommateur qui l'ignore affiche le français, exactement comme aujourd'hui.

**Le descriptif usager rejoint `translations`** (`Procedure`, `PortalProcedure`,
`PortalProcedureDetail`) — c'est une colonne, il prend sa place à côté du libellé :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `translations.<code>.user_description` | texte **Markdown** | Le descriptif usager dans cette langue |

**Les textes de `user_communication` portent leur traduction SUR L'ENTRÉE** (`Procedure`,
`PortalProcedureDetail`) — ils vivent dans un objet, pas dans des colonnes :

| Champ | Clés d'une langue | Ce qu'il traduit |
|---|---|---|
| `…audience.translations` | `note` | La précision sur le public concerné |
| `…attachments.items[].translations` | `label`, `description` | Une pièce annoncée |
| `…faq.items[].translations` | `question`, `answer` | Une question de la FAQ usager |

- ⚠️ **Les trois règles de `Translations` valent ici aussi** : jamais de clé `fr` (le français est
  le champ de même nom) ; un texte absent est un **repli sur le français**, pas un texte vide ; et le
  repli se fait **champ par champ** — une question traduite sans sa réponse est le cas normal.
  Pour l'attribut `lang` de l'écran (RGAA 8.7), c'est donc **texte par texte** qu'il faut savoir ce
  qui est traduit : une réponse repliée sur le français se marque `lang="fr"` dans une page servie
  en anglais.
- ⚠️ **La traduction voyage avec son entrée** : réordonner la FAQ ne demande rien au consommateur.
  Ne l'associez jamais à une question par son **index**.
- ⚠️ **Absent sur les entrées enregistrées avant ce contrat** : lisez une absence comme `{}` (le
  Socle écrit `{}` à chaque nouvel enregistrement de l'étape).
- **Rien ne se traduit dans `delays`** : la durée est structurée (valeur + unité), le portail la
  rend dans sa propre langue.
- **Un correctif de documentation au passage** : `PortalProcedure.user_description` dit désormais,
  comme `Procedure`, qu'il est en **Markdown** (depuis 1.24.0). Et `user_communication` est affiché
  par Nora depuis le 2026-09-18 — l'entrée 1.24.0 disait « l'affichera ».
- **Consommateur** : Nora sert déjà `translations.user_description` sur la page d'une démarche ; la
  traduction des entrées de `user_communication` reste à brancher de son côté (repli champ par
  champ, `lang="fr"` texte par texte). Rien à faire pour les autres.

---

## 2026-09-18 — public-api — ajout (déclaration d'accessibilité)

**La mention d'accessibilité du pied de page peut mener à la déclaration complète.** La
collectivité rédige sa déclaration d'accessibilité (RGAA, article 47 de la loi du 11 février 2005)
dans l'onglet « Contenus » de l'éditeur, et règle la mention du pied de page dans « Composition » :
l'afficher ou non, sa phrase, et son lien. Version du contrat : **1.25.0**. Ajout **additif** : un
consommateur qui l'ignore se comporte exactement comme aujourd'hui.

**Une route** — `GET /v1/portal/content?tenant_id=&slug=accessibilite` (tag « Portail », scope
`read`) → `PortalContent` :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `slug` | `accessibilite` | Quel contenu — le seul à ce jour |
| `published_at` | ISO 8601 | Date de la publication du **site** (voir ci-dessous) |
| `format` | `markdown` | Toujours `markdown` : le champ existe pour qu'un autre format s'annonce |
| `body` | texte | La déclaration, en Markdown, **jamais vide** |

**Un champ sur `Tenant.theme.accessibility`** (`GET /v1/portal/tenant`) :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `declaration_link` | booléen | Ajouter à la mention un lien « Déclaration d'accessibilité » vers la page qui rend la route ci-dessus |

- ⚠️ **`declaration_link` est RÉSOLU par le Socle** : vrai seulement si la collectivité a demandé le
  lien **et** qu'une déclaration non vide est publiée. Un portail qui suit ce drapeau ne sert jamais
  un lien vers une page vide, et n'a aucune autre condition à vérifier.
- ⚠️ **Il peut être vrai avec une `declaration` vide** : la collectivité n'a pas écrit de phrase,
  le lien s'affiche alors seul — c'est encore une mention.
- ⚠️ **`declaration` sort désormais VIDE quand la collectivité masque la mention.** Le commutateur
  est appliqué par le Socle, le texte reste en base : un portail d'avant ce contrat, qui n'affiche
  que `declaration`, fait déjà ce qu'il faut. Changement de comportement sans changement de forme,
  aucune valeur existante ne change (les mentions publiées restent affichées : le commutateur vaut
  « affichée » par défaut).
- ⚠️ **Un texte publié vide est un 404**, comme rien de publié : publier le site publie aussi une
  déclaration que personne n'a encore écrite, et la servir rendrait une page blanche sous un titre
  engageant.
- ⚠️ **`body` est en Markdown et en français.** Rendez-le en échappant le HTML (ou mieux, sans
  jamais injecter de HTML), **descendez ses titres d'un niveau** — votre page porte déjà son `h1` —
  et marquez-le `lang="fr"` quand la page est servie dans une autre langue : il n'est pas traduit.
- `published_at` est la date de la **publication du site** (« Publier » publie tout d'un geste),
  pas celle de la déclaration : sa date d'établissement est dans le texte.
- **Consommé par Nora le jour même** : page `/accessibilite`, lien dans la mention de toutes les
  pages.

---

## 2026-09-18 — public-api — ajout

**Une démarche porte désormais ce que la collectivité écrit POUR SES USAGERS.** Durée habituelle
d'instruction, précision sur le public concerné, pièces demandées, foire aux questions : la sixième
étape du paramétrage (« Communication usager ») remplit une colonne dédiée, servie telle quelle.
Version du contrat : **1.24.0**. Ajout **additif** : un consommateur qui l'ignore se comporte
exactement comme aujourd'hui.

**Un champ sur `Procedure`** (`GET /v1/procedures`, `GET /v1/procedures/{id}`) **et sur
`PortalProcedureDetail`** (`GET /v1/portal/procedures/{id}`) :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `user_communication` | objet ou `null` | Ce que l'usager lit avant de déposer |
| `…delays.processingTimeValue` | entier 1–999, ou `null` | Durée habituelle d'**instruction** |
| `…delays.processingTimeUnit` | `jour_ouvre` · `jour` · `semaine` · `mois` | Son unité — **jamais déduite** |
| `…audience.note` | texte, souvent vide | Précision éditoriale sur le public concerné |
| `…attachments.items` | `{ label, description }[]` | Pièces **annoncées** à l'usager |
| `…faq.items` | `{ question, answer }[]` | FAQ **usager** |

- ⚠️ **Le descriptif usager n'est PAS dans cet objet.** Il reste dans `user_description`, servi à
  côté depuis le premier contrat — et il est désormais **rédigé en Markdown** (`**gras**`, listes,
  titres, liens). Aucun écran ne le remplissait jusqu'ici : il était **vide sur les 51 démarches de
  la plateforme**, aucune valeur existante ne change donc de sens. Rendez-le comme du Markdown, en
  échappant le HTML.
- ⚠️ **Trois durées, et aucune ne se déduit d'une autre.** `input_duration_minutes` = combien de
  temps l'usager met à **remplir** (en minutes) · `user_communication.delays` = combien de temps la
  collectivité met à **répondre** (valeur + unité explicite) ·
  `communication_config.visibility.publicationStart`/`publicationEnd` = **entre quelles dates** la
  démarche est proposée. Les deux premières sont servies côte à côte au portail : c'est là qu'on se
  trompe. ⚠️ `0` n'existe pas et ne sortira jamais — ce serait promettre une réponse immédiate.
- ⚠️ **`audience.note` ne filtre rien.** Le filtre « Je suis… » reste `audiences` (servi sur la
  liste comme sur le détail, dérivé de `requester_config`). Une note qui dirait « réservée aux
  résidents » ne retire la démarche d'aucun public : c'est une phrase, pas une règle. En cas de
  contradiction, **`audiences` fait foi**.
- ⚠️ **`attachments.items` n'est PAS la liste des pièces à téléverser.** Celles-ci sont les champs
  `attachment` de `form_schema`, servi sur le **même** détail, avec leur `documentTypeId`, leur
  `required` et leurs conditions. `items` est un texte d'**annonce** : il peut les recouper
  volontairement (on n'annonce pas une pièce comme on la collecte) et porter ce qui ne se dépose pas
  en ligne — un original à présenter au guichet. Les **concaténer** afficherait deux fois la même
  pièce ; n'afficher que `items` en cacherait certaines du formulaire. `items` habille la page de
  présentation, `form_schema` construit le formulaire.
- ⚠️ **Deux FAQ existent, une seule sort.** `user_communication.faq.items` est la FAQ **usager**.
  Celle de `knowledge_base.faq` est écrite pour l'agent et son assistant : elle n'a jamais traversé
  vers un portail public et ne traversera pas. Ne les fusionnez pas.
- ⚠️ **`null` = la collectivité n'a rien écrit**, et les défauts de cette colonne sont **vides** —
  à l'inverse de `communication_config`, dont un `null` se lit « visible sur le portail ».
  N'affichez pas de section « Délai d'instruction » quand la valeur est `null`, et ne composez
  aucun texte à sa place.
- **Rien ne change sur la LISTE** `GET /v1/portal/procedures` : ses neuf champs sont inchangés. Ce
  contenu appartient à la page d'une démarche, pas à un catalogue — un test l'épingle des deux
  côtés.
- **Consommateur** : Nora l'affichera sur la page d'une démarche. Rien à faire pour les autres.

---

## 2026-09-13 — contacts-api — ajout

**Le référentiel enregistre les consentements RGPD d'un usager, et leur preuve.** Deux questions
posées systématiquement au dépôt d'une demande, quelle que soit la démarche — elles **remplacent**,
dans ce qu'on demande à l'usager, « accepte les mails / accepte les SMS » :

| `kind` | Question | Régime |
|---|---|---|
| `traitement` | Utilisation des informations pour instruire la demande | **Obligatoire** au dépôt |
| `partage` | Partage aux services de la collectivité, pour ce dossier et les suivants | Facultatif, proposé coché |

Version du contrat : **1.2.0**. Ajout **additif** : un consommateur qui l'ignore se comporte
exactement comme aujourd'hui.

**Un endpoint** — `POST /v1/contacts/{id}/consents` (corps `ContactConsentsCreate`) :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `source_app` | `iris`, `nora`, un code de partenaire… | Qui a **affiché la case** et recueilli la réponse |
| `source_reference` | libre, ou absent | Le dépôt d'origine — porte l'**idempotence** |
| `collected_at` | ISO 8601, défaut « maintenant » | La date qui fait foi |
| `consents[].kind` | `traitement` \| `partage` | — |
| `consents[].granted` | booléen | — |
| `consents[].statement` | **requis** | La phrase exacte que l'usager a lue |

**Quatre champs d'état et un historique sur `Contact`** : `consent_traitement`,
`consent_traitement_at`, `consent_partage`, `consent_partage_at`, et `consents[]`
(`ContactConsent` : `kind`, `granted`, `statement`, `source_app`, `source_reference`,
`collected_at`).

- ⚠️ **`statement` vient de VOUS, et c'est requis.** Le référentiel enregistre un fait, il n'écrit
  pas la phrase : seule l'application qui a affiché la case sait sa langue, sa formulation et le
  nom d'organisme qu'elle y a interpolé. La composer ici la ferait diverger de ce que l'usager a
  lu — et la preuve ne prouverait plus rien (art. 7.1 RGPD : le responsable doit pouvoir
  **démontrer** le consentement, pas seulement l'affirmer).
- ⚠️ **L'état ne s'écrit pas.** `consent_traitement` et `consent_partage` sont **dérivés** de
  l'historique par trigger, depuis le recueil le plus **récent** — un recueil antérieur consigné
  après coup (dépôt papier repris) n'écrase donc pas un consentement retiré depuis. Un `PATCH`
  qui tenterait de les poser directement ne les atteint pas.
- ⚠️ **`consents[]` est vide dans les réponses de LISTE et de rapprochement**, comme `quartier` est
  `null` quand la jointure n'a pas été demandée : la preuve ne se lit que sur la fiche
  (`GET /v1/contacts/{id}`). L'état, lui, voyage partout.
- **Idempotent** par (`contact_id`, `kind`, `source_app`, `source_reference`) : rejouer le même
  dépôt met la ligne à jour au lieu d'en créer une seconde. Sans `source_reference`, chaque appel
  est un fait nouveau.
- **Le référentiel n'exige RIEN** : il accepte `granted: false` sur le consentement obligatoire.
  Cette exigence-là appartient au dépôt (Iris la tient), et un **retrait** de consentement doit
  pouvoir se consigner.
- **`consent_email` et `consent_sms` sont marqués OBSOLÈTES** — conservés tant que Clara les écrit,
  aucun nouveau consommateur ne doit s'y fier. Leur retrait fera l'objet d'une entrée « rupture »
  quand Clara aura basculé.

---

## 2026-09-12 — public-api — ajout

**Le logo d'un organisme voyage avec le catalogue.** De quoi le reconnaître dans une liste : le
portail usagers en fait un menu « Ma ville », qui mène aux pages d'organisme ouvertes par le
contrat 1.22.0. Version du contrat : **1.23.0**. Ajout **additif** : un consommateur qui l'ignore
se comporte exactement comme aujourd'hui.

**Un champ sur `PortalOrganizationRef`** (`GET /v1/portal/procedures` et
`GET /v1/portal/procedures/{id}`) :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `logo_url` | `https://…` ou `null` | Le logo **propre** de l'organisme affiché |

- ⚠️ **L'héritage n'est PAS résolu ici**, contrairement à
  `GET /v1/organizations/{id}/branding`, et c'est délibéré : dans une liste de communes, servir le
  logo hérité donnerait à chaque ligne la même image — celle de l'intercommunalité. `null` veut
  donc dire « cette organisation n'a pas de logo à elle » : affichez un repli neutre, jamais celui
  de la collectivité. C'est le seul endroit du contrat où une valeur de charte sort **brute**, et
  c'est l'usage qui le justifie.
- ⚠️ C'est le logo du **PORTEUR**, comme `name` et `slug` : le logo d'un service interne ne sort
  pas plus que son nom.
- **URL libre**, comme partout dans la charte : le Socle enregistre et publie, il n'héberge rien et
  ne redimensionne rien. Écartez ce que vous ne pouvez pas peindre — une adresse non `https`, par
  exemple.
- **Qui figure dans une telle liste** reste ce que dit le catalogue : les organismes qui proposent
  au moins une démarche publiée. Un organisme qui ne publie rien n'a pas de page, et n'a donc rien
  à faire dans un menu qui y mène.

---

## 2026-09-12 — public-api — ajout

**Un organisme peut avoir sa propre adresse sur le site de démarches.** Son identifiant lisible
(`slug`) voyage désormais avec chaque démarche, ce qui permet à un portail de servir une page par
organisme : `/<slug>` y montre les démarches de cet organisme, à ses couleurs et avec son logo.
Version du contrat : **1.22.0**. Ajout **additif** : un consommateur qui l'ignore se comporte
exactement comme aujourd'hui.

**Un champ sur `PortalOrganizationRef`** (`GET /v1/portal/procedures` et
`GET /v1/portal/procedures/{id}`) :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `slug` | `mairie-d-arles` ou `null` | L'identifiant lisible de l'organisme affiché |

- ⚠️ **C'est le slug du PORTEUR**, jamais celui du service interne qui instruit — même règle que
  `name`. Un service interne ne s'affiche pas au portail, et son adresse ne sort donc pas non plus :
  elle mènerait à une vitrine que la collectivité a choisi de ne pas montrer.
- ⚠️ **`null` est un cas normal**, pas une anomalie : personne n'a donné d'identifiant lisible à cet
  organisme. Il reste nommé sur les cartes et dans les filtres, il n'a simplement pas de page. Ne
  fabriquez pas d'adresse à sa place à partir de son nom : elle changerait au premier renommage, et
  les liens déjà partagés mourraient.
- ⚠️ **Quatre caractères au moins, `[a-z0-9-]`** (contrainte `organizations_slug_url_form`, unique
  sur toute la plateforme). La longueur minimale est une décision de contrat, pas une coquetterie :
  un portail qui porte la langue dans un préfixe de chemin (`/en`, `/gsw`) doit pouvoir décider, sur
  la seule forme du premier segment, s'il lit une langue ou un organisme. Un slug de trois
  caractères serait lu comme une langue, et la page de l'organisme deviendrait inatteignable.
- **Qui a une page se déduit du catalogue**, sans réglage : les organismes qui apparaissent dans
  `organizations` sont ceux qui proposent au moins une démarche publiée. Le jour où un organisme n'en
  propose plus, son adresse s'éteint d'elle-même plutôt que de mener à une page vide.
- Le slug d'une **collectivité racine** voyage aussi (c'est le même champ), mais son site est déjà à
  la racine du domaine : lui servir en plus une page sous son slug ferait deux adresses pour la même
  page. Nora écarte donc la racine.

---

## 2026-09-12 — public-api — ajout

**La charte graphique porte le favicon de la collectivité.** L'icône que le navigateur affiche
dans l'onglet et les favoris du site de démarches. Version du contrat : **1.21.0**. Ajout
**additif** : un consommateur qui l'ignore se comporte exactement comme aujourd'hui.

**Un champ sur `Branding`** (`GET /v1/organizations/{id}/branding`) :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `favicon_url` | `https://…` ou `null` | L'icône du site, telle que la collectivité l'a déposée |

- C'est un **cinquième élément de la charte**, pas un réglage du thème : le thème dit COMMENT
  peindre, la charte dit AVEC QUOI. Il suit donc l'héritage comme les logos et les couleurs —
  une sous-organisation qui tient son propre guichet reçoit l'icône de sa collectivité sans que
  personne ait eu à la ressaisir, et `source_organization_id` dit toujours qui la porte.
- ⚠️ **`configured` compte désormais CINQ éléments.** Si vous vous servez de ce drapeau pour
  décider s'il y a quelque chose à peindre, sachez qu'il passe maintenant à `true` pour une
  collectivité qui n'aurait déposé que son favicon. C'est voulu : le lire autrement reviendrait à
  ignorer le seul élément qu'elle a rempli.
- ⚠️ **C'est une URL, pas un fichier.** Le Socle enregistre et publie, il n'héberge rien, ne
  redimensionne rien et ne vérifie pas que l'image est carrée — comme pour les logos. Posez-la en
  `<link rel="icon">` ; **son absence n'est pas une demande d'effacement**, gardez alors l'icône
  que vous affichiez.
- ⚠️ **Ne la reconstituez pas depuis `GET /v1/organizations/{id}`** : `favicon_url` n'est **pas**
  exposé sur `OrganizationDto`, pour la raison qui vaut déjà pour les quatre autres colonnes de
  charte — brute, elle est nulle sur une organisation qui hérite.

**Consommateur** : Nora la pose dès qu'elle est publiée. Rien à faire pour les autres.

---

## 2026-09-12 — public-api — ajout

**Le bloc de recherche du portail peut porter une image de fond.** La collectivité la choisit dans
l'éditeur du site de démarches ; le Socle l'enregistre et la publie. Version du contrat :
**1.20.0**. Ajout **additif** : un consommateur qui l'ignore rend le bloc exactement comme
aujourd'hui.

**Trois champs sur `PortalRechercheSection`** (`GET /v1/portal/page`), tous **requis** — un
consommateur n'a pas à distinguer « pas d'image » d'un champ absent :

| Champ | Valeur | Ce qu'il dit |
|---|---|---|
| `image_url` | `https://…` ou `""` | L'image de fond du bloc, vide quand il n'y en a pas |
| `image_full_width` | booléen | L'image va d'un bord à l'autre de la page |
| `image_fixed` | booléen | L'image reste fixe pendant que la page défile |

- ⚠️ **C'EST UN FOND, PAS UNE ILLUSTRATION** — toute la différence avec
  `PortalTexteImageSection.image_url`, et c'est pour cela qu'il n'y a **pas de texte alternatif** à
  chercher ici. Ce qu'une synthèse vocale doit lire, ce sont le `title` et le `subtitle`, posés
  **dessus**. Rendez-la en CSS (`background-size: cover`), jamais en `<img>` : un `<img>` demande un
  `alt`, et le seul honnête serait vide.
- ⚠️ **POSEZ UN VOILE CLAIR PAR-DESSUS** si vos textes restent en encre sombre. C'est la seule
  chose que ce champ vous oblige à faire : la collectivité choisit sa photo, personne ne sait ce
  qu'elle contient, et un titre sombre sur une photo sombre est illisible une fois sur deux. Le
  Socle rend un **blanc à 60 %** — le fond le plus sombre qu'on puisse alors obtenir (`#999999`,
  le voile sur du noir pur) garde **5,7 : 1** sous l'encre du portail, au-dessus du seuil RGAA AA.
  Moins de voile, et la garantie tombe : à 50 % l'encre est à 4,1 : 1. Le **gris de texte**, lui,
  n'y résiste pas (2,1 : 1) : le Socle passe son sous-titre à l'encre pleine sur une image, et
  c'est la seule conséquence du voile sur le rendu du bloc.
- ⚠️ **Les deux options sont SANS OBJET quand `image_url` est vide, et servies telles quelles.**
  Le Socle **conserve** un « pleine largeur » quand l'adresse est effacée — le réglage gouverne
  l'usage, pas la donnée (motif `email_sender_name`, `publicationPeriodEnabled`) : recoller une
  adresse rend le bandeau tel qu'il était. C'est donc au rendu de les ignorer tant qu'il n'y a rien
  à habiller ; les lire comme des réglages du **bloc** afficherait un bandeau sans bandeau.
- ⚠️ **`image_fixed` est un ORNEMENT.** C'est `background-attachment: fixed`, que plusieurs
  navigateurs mobiles ignorent (iOS Safari en tête) : l'image y défile normalement. Le bloc reste
  entier, image comprise — aucune information n'en dépend, et il n'y a rien à compenser.
- ⚠️ **L'adresse est libre et peut être morte** : le Socle n'héberge pas le fichier et ne garantit
  pas qu'il existe encore. Elle est filtrée sur sa **forme** — `https://…` absolue, rien d'autre,
  parce qu'elle finit dans une page publique —, et une adresse refusée sort en `""` : le bloc est
  servi **sans fond**, jamais perdu. Échappez-la avant de la poser dans une valeur CSS : une URL
  https peut contenir un guillemet.
- **Pour les autres consommateurs de la gamme : rien à faire.** Ce champ ne concerne que le
  portail usagers.

---

## 2026-09-12 — audience-api — ajout

**Une quatrième API, en ÉCRITURE SEULE : les compteurs de fréquentation du site de démarches.**
Version du contrat : **1.0.0**. Servie sous `{SUPABASE_URL}/functions/v1/audience-api`,
`verify_jwt = false`. Aucune rupture : rien n'existait.

Nora tourne dans le navigateur de l'usager et n'a **pas de base de données**. Le Socle détient déjà
le domaine, le catalogue et la page publiée : c'est donc ici que se compte la fréquentation.
`public-api` refuse tout ce qui n'est pas `GET` — cette ligne EST son contrat pour tous ses
consommateurs —, `contacts-api` est la surface des données personnelles, `ai-api` celle de la
dépense. Quatrième domaine, quatrième fonction, **quatrième scope**.

**Nouveau scope `audience`** sur `api_keys` (la contrainte `api_keys_scopes_known` en connaît
désormais cinq : `read`, `contacts`, `smtp`, `ai`, `audience`). Il ne donne accès qu'à cette API.

| Route | Corps | Réponse |
|---|---|---|
| `POST /v1/page-views` | `{tenant_id, page, procedure_id?, entry?, lang?, device?}` | `202 {recorded}` |
| `POST /v1/deposits` | `{tenant_id, procedure_id}` | `202 {recorded}` |

- ⚠️ **ÉCRITURE SEULE, ET CE N'EST PAS UN OUBLI.** Aucun `GET` dans tout le document. La clé de
  Nora est posée dans une edge function qui sert des pages publiques : lui donner le moyen de LIRE
  la fréquentation ferait d'une clé volée un moyen de connaître le trafic de toutes les
  collectivités qu'elle sert. Les chiffres se lisent dans le Socle, par RPC, avec le compte d'un
  agent.
- ⚠️ **AUCUNE DONNÉE PERSONNELLE NE TRAVERSE CETTE API, ET ELLE NE PEUT PAS EN RECEVOIR.** Toute
  clé inconnue dans le corps est un **400** — c'est ce qui rend la promesse vérifiable de
  l'extérieur. `entry` est un **booléen** (l'appelant a déjà lu le référent et l'a jeté), `device`
  **l'une de trois valeurs** (dérivée du User-Agent par l'appelant, qui ne le transmet jamais),
  `lang` la langue **servie**. Les deux tables de compteurs n'ont aucune colonne capable de porter
  un identifiant, une adresse ou un texte libre, et un test SQL en épingle la liste exacte.
  Conséquence : rien n'est écrit sur le poste du visiteur, aucun consentement n'est à demander
  (article 82 de la loi Informatique et Libertés).
- ⚠️ **Une visite est une ARRIVÉE sur le site, pas un visiteur unique** — sans identifiant, la
  seconde notion n'a pas de sens et n'est pas mesurée. C'est **l'appelant** qui tranche, dans le
  navigateur, et pose `entry: true`.
- ⚠️ **Le jour vient du serveur**, en heure de Paris. Aucune date ne traverse le corps : une
  horloge de navigateur décalée ferait atterrir des vues dans un futur qu'aucune période n'affiche.
- ⚠️ `tenant_id` est **l'organisme du domaine visité**, pas forcément une racine : une
  sous-organisation peut tenir son guichet. Il est recoupé avec le périmètre de la clé (sous-arbre
  de sa racine, ou collectivités abonnées à son application) ; hors périmètre ⇒ **404**, comme
  partout dans la gamme. `procedure_id` est requis **si et seulement si** `page` n'est pas
  `accueil`, et doit appartenir au catalogue de la racine du tenant — sinon `recorded: false`, sans
  erreur : un compteur ne fait pas échouer une page.
- ⚠️ **Ni `429` ni `502`** dans la liste des erreurs, et la liste courte est le signe que l'API est
  étroite : il n'y a aucun crédit à épuiser (le frein de cadence vit chez l'appelant, au plus près
  de l'adresse IP que le Socle ne verra jamais) et elle n'appelle personne.

Documentation : `GET /openapi.json` sur la fonction. **Pour les autres consommateurs de la gamme :
rien à faire.** Cette API concerne le portail usagers, le seul qui voie des pages s'afficher.

---

## 2026-09-10 — public-api — ajout

**Accès libre ou usagers authentifiés : une démarche dit désormais à quelles conditions on la
dépose.** La collectivité règle le champ à l'étape « Descriptif » du paramétrage ; le Socle
l'enregistre et le publie. Version du contrat : **1.19.0**. Ajout **additif** : un consommateur qui
l'ignore continue de se comporter comme aujourd'hui, puisque la valeur par défaut est celle qui
était vraie avant le réglage.

**`access_mode` sur `Procedure`** (`GET /v1/procedures`, `/v1/procedures/{id}`) **et sur
`PortalProcedure`** (`GET /v1/portal/procedures`, `/v1/portal/procedures/{id}`). Deux valeurs :

| Valeur | Ce que le consommateur doit faire |
|---|---|
| `libre` | Rien de particulier : n'importe quel visiteur dépose la démarche. |
| `authentifie` | Exiger un usager connecté **au moment du dépôt**. |

- ⚠️ **CE N'EST PAS UNE RÈGLE DE PUBLICATION.** Les quatre conditions de publication du portail ne
  changent pas, et `access_mode` ne s'y ajoute pas : une démarche `authentifie` est servie par
  `GET /v1/portal/procedures` **comme les autres**, et doit s'y afficher comme les autres. C'est en
  la lisant que l'usager apprend qu'il doit se connecter ; la retirer du catalogue la cacherait à
  ceux-là mêmes qui ont un compte. Demandez la connexion au moment de **déposer**, pas au moment de
  montrer.
- ⚠️ **`libre` est le défaut, et il est servi sans distinction** : une colonne jamais réglée —
  c'est le cas de toutes les démarches d'avant le 2026-09-10 — rend `libre`, parce que c'est ce qui
  était vrai (le portail dépose sans compte depuis le 2026-09-06). Le défaut inverse aurait fermé
  d'un coup un catalogue entier que personne n'avait déclaré fermé. Le champ est **toujours
  présent** : un champ facultatif obligerait chaque portail à choisir un défaut, et deux portails en
  choisiraient deux différents.
- **Le Socle ne garde aucune porte** : il publie le réglage, il ne refuse aucun dépôt. C'est au
  portail de demander la connexion et à l'application qui instruit de refuser un dépôt anonyme sur
  une démarche réservée. Même partage que la charte graphique et l'étape Communication.
- **Pour Nora** : l'espace usager n'existant pas encore (voir `docs/roadmap.md`, « Démarches avec
  compte »), le champ est à afficher avant d'être à appliquer — une mention sur la carte et sur la
  page de la démarche, le blocage du dépôt quand les comptes arriveront.
- Base : `procedures.access_mode`, text NOT NULL défaut `libre`, CHECK
  `procedures_access_mode_check` sur les deux valeurs. Migration
  `procedures_acces_libre_authentifie`.

---

## 2026-09-08 — public-api, contacts-api & ai-api — rupture (clés plateforme seulement)

**Une clé par application, bornée par abonnement.** Le Socle tient désormais un **registre des
applications** (`nora`, `iris`, `clara`, `socle`…) et, par collectivité, la liste des applications
**souscrites**. Une clé **plateforme** (`organization_id` NULL) est rattachée à une application et
ne voit que les collectivités abonnées à celle-ci — plus jamais « toutes les organisations ».
Versions : `public-api` **1.18.0**, `contacts-api` **1.1.0**, `ai-api` **1.2.0**. Les clés
**liées à une organisation principale** (partenaires) ne changent pas.

- **Ce qui change pour une clé plateforme** : `GET /v1/organizations` rend les racines abonnées et
  leur descendance ; `GET /v1/portal/tenant` répond **404** pour le domaine d'une collectivité non
  abonnée (même message qu'un domaine inconnu — on ne renseigne pas sur les clients des autres) ;
  `contacts-api` et `ai-api` répondent **404** à un `X-Organization-Id` hors abonnement, comme à
  une organisation inexistante.
- ⚠️ **Une clé plateforme sans application est refusée (403)** : « Cette clé plateforme n'est
  rattachée à aucune application : son périmètre ne peut pas être déterminé. » Les clés d'avant le
  registre se rattachent depuis `/superadmin/applications` (« À rattacher »).
- ⚠️ **Chemin de migration, dans cet ordre** : (1) migration `applications_et_abonnements` — elle
  abonne **toutes les racines existantes à toutes les applications**, donc aucune régression le
  jour du déploiement ; (2) rattacher les clés plateforme et vérifier les abonnements dans l'UI ;
  (3) déployer les trois fonctions. Inverser (2) et (3) coupe le portail.
- **Pourquoi** : l'isolation par tenant vivait dans le code de chaque application (une application
  compromise lisait tout). Elle vit désormais au Socle, et l'arrivée d'un client ne transmet plus
  aucun secret : le super administrateur coche ses applications, la clé de chacune le voit.
- **Onboarding d'un client côté application** : `GET /v1/organizations` avec la clé de
  l'application rend exactement ses clients — de quoi créer ses tenants à la synchronisation
  plutôt qu'à la main.
- `api_keys.consumer` est une clé étrangère vers le registre ; `scopes` est borné par CHECK à
  `read`, `contacts`, `smtp`, `ai`.

---

## 2026-09-08 — public-api — ajout

**Le thème du site de démarches : chaque collectivité règle l'apparence de son portail.**
Typographie, formes, densité, en-tête, accessibilité — réglés dans l'onglet « Thème » de
l'éditeur du Socle, publiés avec la page d'accueil, et servis au portail. Version du contrat :
**1.17.0**. Ajout **additif** : un consommateur qui l'ignore continue de rendre ce qu'il rend
aujourd'hui.

**`theme` sur `Tenant`** (`GET /v1/portal/tenant?hostname=`).

- **Pourquoi sur le tenant et pas sur la page** : le thème vaut pour **toutes les pages** du
  portail. Le loger dans `GET /v1/portal/page` en ferait un thème par page — ce que l'éditeur
  n'offre pas — et le déloger ensuite serait une rupture. Il arrive donc avec l'appel que vous
  faites déjà en premier, sans aller-retour supplémentaire.
- ⚠️ **Toujours présent, jamais `null`.** Une collectivité qui n'a rien publié reçoit **les
  défauts du Socle**. Ne recodez pas de défauts chez vous : deux jeux de valeurs finiraient par
  diverger. C'est aussi ce qui rend les ajouts à venir indolores — un nouveau réglage arrivera
  avec sa valeur par défaut, jamais un trou.
- ⚠️ **Le thème ne porte AUCUNE couleur.** Elles restent servies par
  `GET /v1/organizations/{id}/branding`, héritage résolu. Le thème dit **comment** peindre, la
  charte dit **avec quoi**. Une collectivité choisit ses couleurs une fois, pour toute la gamme.
- **Toutes les valeurs sont des énumérés fermés** : traduisez-les par une table de
  correspondance, sans interpréter de chaîne libre. Les quatre blocs (`typography`, `shapes`,
  `header`, `accessibility`) sont tous présents.
- ⚠️ **`typography.font` est un IDENTIFIANT, pas une famille CSS** (`systeme`, `nunito-sans`,
  `rubik`, `public-sans`). C'est le seul réglage du thème qui coûte quelque chose : **ne chargez
  que la police choisie**. Tout le reste est du CSS, gratuit ; `systeme` ne télécharge rien.
- ⚠️ **AUTO-HÉBERGEZ-LES, ne les prenez pas chez Google Fonts.** Les trois familles web sont sous
  **SIL Open Font License 1.1** — c'est le *critère d'entrée* au catalogue, précisément pour que
  vous puissiez les servir depuis votre propre domaine. Un site de collectivité qui les chargerait
  chez Google enverrait l'adresse IP de chaque visiteur à un tiers, sans base légale (jugement du
  LG München I du 20 janvier 2022, position de la CNIL). C'est aussi pourquoi Marianne, la police
  de l'État, n'est pas au catalogue : sa licence lui est propre.
- ⚠️ **`accessibility.dark_primary` ne remplace pas la charte, il la fonce au rendu** : clarté
  multipliée par **0,75**, teinte et saturation inchangées (sRGB → TSL → sRGB). La collectivité
  l'active quand le contraste de sa couleur ne suffit pas ; ses colonnes de charte ne bougent pas.
  `high_contrast` implique le même assombrissement, en plus d'encres et de bordures plus sombres.
- ⚠️ **`accessibility.declaration` est une mention légale**, pas un réglage visuel : la
  déclaration RGAA obligatoire d'un site public, à afficher au pied des pages. Chaîne vide = la
  collectivité ne l'a pas encore écrite ; n'inventez rien à sa place.
- Rien à faire pour un consommateur en place.
- **Nora consomme déjà ce champ** (le portail usagers de la gamme) : il peut servir de référence
  d'implémentation — lecture tolérante champ par champ, un seul objet de style, polices
  auto-hébergées.

## 2026-09-08 — public-api — ajout

**Les services internes : qui instruit n'est pas toujours qui s'affiche.** Une collectivité peut
désormais marquer une sous-organisation « service interne » : elle instruit des demandes, mais
n'apparaît pas sur le portail usagers — c'est son **porteur** (le premier ancêtre qui n'est pas un
service interne) qui est nommé à sa place. Un usager s'adresse à sa mairie, pas à son service
d'état civil. Version du contrat : **1.16.0**. Ajout additif **sur la forme** ; le contenu d'une
liste change, voir le premier ⚠️.

**1. `handling_organization_id` sur `PortalOrganizationRef`** (`GET /v1/portal/procedures`,
`GET /v1/portal/procedures/{id}`).

- ⚠️ **Le contenu de `organizations` change.** `id`/`name` désignent l'organisme **AFFICHÉ**, qui
  n'est plus forcément celui qui a activé la démarche : pour une collectivité qui utilise le
  réglage, c'est le porteur. Un consommateur qui recoupait cette liste avec les activations brutes
  (`organization_procedures`) trouvera un écart — c'est attendu, pas une anomalie. Tant qu'aucune
  organisation n'est marquée « service interne », rien ne bouge.
- `handling_organization_id` porte l'organisation qui **instruit** réellement, `null` quand c'est
  l'organisme affiché lui-même. **Transmettez-le avec la demande** : c'est ce qui la fait arriver
  au bon service. Sans lui, une demande déposée « à la Mairie de X » ne dirait pas lequel de ses
  services la traite.
- ⚠️ **C'est un identifiant, et rien d'autre.** Le **nom** du service interne n'est pas servi : la
  collectivité a choisi de ne pas le montrer à ses usagers. Ne l'affichez pas, ne le devinez pas
  par un autre appel pour le remettre à l'écran.
- ⚠️ **Il y en a au plus un.** Le Socle refuse qu'une même démarche soit activée par deux
  organisations d'un même porteur — sans quoi on ne saurait pas à qui adresser la demande. Vous
  pouvez vous appuyer sur cette unicité.
- Rien à faire pour un consommateur en place qui se contente d'afficher `name`.

**2. `is_internal_service` sur `Organization`** (`GET /v1/organizations`, `/{id}`,
`?tree=true`).

- `true` = l'organisation **n'est pas un guichet usager**. Ne la proposez pas dans une liste
  offerte à un usager final ; elle reste une organisation ordinaire pour tout le reste (agents,
  hiérarchie, activation de démarches).
- Toujours `false` sur une organisation principale (racine) : elle n'a personne au-dessus d'elle
  pour la porter. Le Socle **corrige** la valeur plutôt que de refuser, pour ne pas bloquer une
  réorganisation qui promeut un service en racine.
- ⚠️ Contrairement aux colonnes de charte graphique, **la valeur brute ne ment pas** : il n'y a
  aucun héritage à résoudre. Elle décrit l'organisation, pas ce qui s'applique à elle.

## 2026-09-07 — public-api — ajout

**Un bloc « texte et image » sur la page d'accueil, et un filtre « Je suis… » sur la grille de
démarches.** Deux ajouts de l'éditeur du Socle qui demandent chacun quelque chose au portail.
Version du contrat : **1.15.0**. Ajouts additifs — aucun champ existant ne change de sens.

**1. Nouvelle section `texte-image`** (`GET /v1/portal/page`), schéma **`PortalTexteImageSection`**,
ajoutée au `oneOf` et au `discriminator` de `PortalPage` : `title` (facultatif), `body`,
`image_url`, `alt`, `layout`, `translations`.

- `layout` vaut `text-first` ou `image-first` : c'est un **ORDRE de lecture**, pas une position.
  Côte à côte il donne la colonne de gauche ; empilé sur un téléphone, il donne ce qui vient en
  premier — et il doit être respecté dans les deux cas.
- ⚠️ **`image_url` est une adresse libre**, saisie par la collectivité : le Socle n'héberge pas le
  fichier et ne garantit pas qu'il existe encore. Prévoyez qu'elle ne charge pas. Sa **forme** est
  en revanche filtrée — **`https` absolue seulement** ; `javascript:`, `data:`, `http://` et les
  chemins relatifs sont **écartés, pas nettoyés**, et le bloc est alors servi sans image. (Un
  portail servi en https ne peut afficher ni contenu mixte, ni un chemin qui se résoudrait chez
  lui : accepter ces formes ferait enregistrer des images que personne ne verrait.)
- ⚠️ **`image_url` vide n'est pas une erreur** : le bloc n'est qu'un bandeau texte, à rendre comme
  tel. Même chose pour `title` vide : pas de titre à afficher, et surtout pas un titre vide.
- ⚠️ **`alt` vide = image décorative** : rendez un `alt` vide, jamais le titre du bloc à la place —
  une synthèse vocale lirait deux fois la même chose.
- `PortalSectionTranslations` porte donc une clé de plus, **`alt`** : le texte alternatif se traduit
  comme les autres, sinon la page n'est traduite que pour ceux qui la voient. Toujours **par
  whitelist du `kind`** : `alt` n'apparaît que sur une section `texte-image`.
- Rien à faire pour un consommateur en place, **à une réserve près** : un `kind` inconnu doit être
  **ignoré**, jamais servi brut ni traité comme une erreur (c'est déjà le contrat). Un portail qui
  ne connaît pas encore `texte-image` affichera la page sans ce bloc.

**2. `audience_filter` sur `PortalDemarchesSection`, `audiences` sur `PortalProcedure`** — de quoi
proposer à l'usager « Je suis… : citoyen / entreprise / association ».

- `audience_filter` (booléen) dit que la collectivité **veut** ce filtre sur cette grille. Il se
  **cumule** avec un filtre par organisme (`PortalProcedure.organizations`), il ne le remplace pas :
  deux dimensions indépendantes de la même liste — qui je suis, et à qui je m'adresse.
- ⚠️ **`true` ne veut pas dire « affiche-le »** : un filtre à un seul choix n'en est pas un. Ne le
  montrez que si les démarches affichées visent **au moins deux** publics — c'est exactement ce que
  fait l'éditeur du Socle, et c'est ce que voit l'agent qui compose la page.
- ⚠️ **`false` sur les pages composées avant l'existence du filtre** : la clé y manque, et une page
  publiée ne gagne pas un élément que personne n'y a mis. Une grille créée depuis le 2026-09-07 naît
  avec.
- `audiences` (`PortalProcedure`, donc aussi `PortalProcedureDetail`) liste les publics auxquels la
  démarche est ouverte, dans l'ordre `citoyen`, `entreprise`, `association`. C'est l'extrait de
  `requester_config` qui concerne l'usager **avant** qu'il ait choisi sa démarche : de quoi filtrer
  une liste sans charger le détail de chacune. La configuration complète (quels champs, obligatoires
  ou non) reste au détail, elle ne franchit toujours pas sur la liste.
- ⚠️ **`audiences` peut être VIDE, et ce n'est pas une anomalie** : une démarche dont l'étape
  « Informations demandeur » n'a jamais été remplie ne déclare aucun public. Elle ne répond alors à
  **aucun** choix du filtre — elle reste visible tant qu'on ne filtre pas. La lire comme « tous
  publics » la ferait apparaître sous chaque choix, y compris là où elle n'est pas ouverte.

---

## 2026-09-07 — public-api — ajout

**La page d'accueil composée se traduit.** Les libellés des démarches et des catégories l'étaient
déjà ; les textes que la collectivité **écrit elle-même** dans son éditeur — titres de blocs,
sous-titres, texte du champ de recherche, paragraphes, pied de page — le sont maintenant aussi.
Version du contrat : **1.14.0**. Ajout additif.

- Les six sections de `GET /v1/portal/page` (`PortalRechercheSection`, `PortalDemarchesSection`,
  `PortalActusSection`, `PortalCompteSection`, `PortalTexteSection`, `PortalFooterSection`, ainsi
  que les sous-blocs du pied de page) portent un champ **`translations`**, décrit par le nouveau
  schéma **`PortalSectionTranslations`**. Toujours présent, `{}` quand rien n'est traduit : on
  écrit `s.translations[lang]?.title ?? s.title` sans tester la présence du champ.
- ⚠️ **Un schéma à part, et pas un élargissement de `Translations`.** Ce dernier est servi sur
  `Category`, `Procedure` et `PortalProcedure`, où les clés sont `name` et `short_description` ;
  y ajouter `title`/`body` dirait qu'elles peuvent y apparaître, ce qui est faux. Deux formes
  voisines, un seul jeu de règles.
- ⚠️ **Une section ne porte que les clés de son `kind`** : `title` partout, plus `subtitle` et
  `placeholder` sur la recherche, `subtitle` sur l'espace usager, `body` sur un bandeau texte. Un
  `body` égaré sur une section `recherche` **ne sort pas** — il n'aurait aucun français à replier.
- ⚠️ **Le repli se fait champ par champ, jamais langue par langue** (inchangé, et c'est la règle
  qu'on voit le plus souvent mal appliquée) : une langue peut porter le titre traduit sans le
  paragraphe. C'est le cas normal, pas une traduction inachevée.
- Toujours **jamais de clé `fr`** : le français est le champ de même nom.
- Rien à faire pour un consommateur en place : une section se lit exactement comme avant, en
  français. Ceux qui servent déjà un sélecteur de langue ont maintenant de quoi traduire la page
  entière, et plus seulement les noms de démarches.

## 2026-09-07 — public-api — ajout

**Le descriptif court se traduit lui aussi.** `translations` ne portait que le libellé ; une
démarche y met désormais **son descriptif court**, sous la même langue. Version du contrat :
**1.13.0**. Ajout additif — aucune entrée existante ne bouge, aucune clé ne change de sens.

- Schéma `Translations` (servi sur `Category`, `Procedure`, `PortalProcedure` et
  `PortalProcedureDetail`) : chaque langue portait `{ "name": "…" }`, elle porte maintenant
  `{ "name": "…", "short_description": "…" }`. **Les deux champs sont facultatifs**, et les clés
  sont celles des colonnes françaises correspondantes.
- ⚠️ **LE REPLI SE FAIT CHAMP PAR CHAMP, jamais langue par langue.** Une langue peut porter le
  libellé traduit sans le descriptif : c'est le cas normal, pas une traduction inachevée. Un
  consommateur qui, voyant `short_description` absent, replierait la langue entière sur le
  français masquerait un libellé traduit que la collectivité a écrit — et qu'elle voit à son
  écran. La règle inchangée reste : champ absent ⇒ champ français de même nom.
- ⚠️ **Une catégorie n'a pas de descriptif court** — la table n'en porte pas. Son `translations`
  ne contiendra jamais que `name` ; l'attendre ailleurs n'a pas de sens.
- Toujours **jamais de clé `fr`** : le français est la colonne, pas une traduction (inchangé).
- Rien à faire pour un consommateur déjà en place : lire `translations[lang]?.name` continue de
  fonctionner à l'identique. Ceux qui affichent un résumé aux usagers ont maintenant de quoi le
  servir dans la langue choisie.

## 2026-09-06 — public-api — ajout

**Une démarche, avec son formulaire.** Le portail listait les démarches ; il peut désormais en
*servir* une : la présenter, puis la faire remplir. Version du contrat : **1.12.0**. Ajout
additif.

- `GET /v1/portal/procedures/{id}?tenant_id=` — nouvelle route. Elle rend `PortalProcedureDetail` :
  tout ce que porte la liste, plus la **catégorie** et les **deux schémas de saisie**,
  `form_schema` et `requester_config`.
- **Mêmes règles de publication que la liste**, appliquées par le même code (`publishedCatalogue`) :
  la démarche doit appartenir au catalogue publié de la collectivité. Sinon **404** — le même que
  pour un identifiant inexistant. Une démarche en brouillon, interne, hors période ou qu'aucun
  organisme n'active est donc introuvable, **et son `form_schema` n'est même pas lu en base** : la
  lecture n'a lieu qu'après la décision de publication.
- **Pourquoi ces deux schémas sortent, et pas les autres.** `form_schema` et `requester_config` ne
  sont pas du paramétrage d'instruction : ils **sont** le formulaire de l'usager, et sans eux un
  portail ne peut afficher qu'un titre. `knowledge_base`, `agent_description` et les documents de
  la communication, eux, ne franchissent toujours pas — ce qu'un agent lit pour instruire n'a rien
  à faire dans le navigateur d'un habitant. La liste, elle, reste un **catalogue** et n'en porte
  aucun : c'est le détail qui les sert, une démarche à la fois.
- ⚠️ **La clé machine d'un champ est `key`, pas `id`.** `key` nomme la donnée en aval — c'est elle
  qui indexe le `form_data` d'une demande, et la seule qu'un agent lise. L'`id` ne sert qu'aux
  conditions (`visibleIf`, `requiredIf`), qui s'évaluent sur les identifiants. Déposer un
  `form_data` indexé par `id` produirait des demandes dont aucun agent ne reconnaît les champs.
- `form_schema` est un schéma **possédé et versionné** (`{ version: 1, content: [...] }`) : à
  parser avec tolérance, un `type` de champ inconnu s'ignore. Les deux schémas valent `null` quand
  la démarche n'a rien de paramétré — c'est une démarche sans saisie, pas une erreur.

---

## 2026-09-06 — public-api — ajout

**Les libellés traduits, et les langues d'une collectivité.** Une collectivité active les langues
dans lesquelles elle s'adresse à ses usagers (français toujours compris) ; les libellés des
**démarches** et des **catégories** se traduisent dans chacune d'elles. Version du contrat :
**1.11.0**. Ajout additif.

- `GET /v1/portal/tenant` gagne `languages` : les codes **BCP 47** activés par la collectivité,
  **français toujours compris et en tête** — de quoi bâtir un sélecteur de langue. Le réglage vit
  sur l'organisation **principale** : la liste est celle de la collectivité, héritage **déjà
  résolu**, même quand le domaine visité désigne une sous-organisation.
- `Category` gagne `translations`, et `PortalProcedure` aussi. `Procedure.translations` existait
  déjà (toujours vide, « structure libre ») : elle prend une **forme documentée**, décrite par le
  schéma partagé `Translations`.
- Forme : `{ "<code>": { "name": "…" } }`. Un objet par langue, pour que d'autres champs traduits
  s'y ajoutent en clés voisines sans déplacer l'existant.
- ⚠️ **Il n'y a jamais de clé `fr`** : le libellé français est `name`. La chercher, c'est ne rien
  trouver.
- ⚠️ **Une langue absente n'est pas un libellé vide, c'est un repli sur `name`.** Afficher la
  chaîne vide d'une traduction manquante donnerait une carte de démarche sans titre.
- Codes : ISO 639-1 quand il existe (`en`, `br`, `oc`), ISO 639-3 sinon (`gsw`, `frp`, `gcr`).
  Quelques langues de France n'ont aucun code ISO (gallo, poitevin-saintongeais, francique
  lorrain) : elles ne sont pas encore proposées, et leur arrivée demandera une convention de
  nommage — donc une entrée à ce journal.
- Rien à faire pour un consommateur qui ne fait pas de multilingue : `name` ne change pas.

---

## 2026-09-06 — public-api — ajout

**Qui propose chaque démarche du portail.** `GET /v1/portal/procedures` gagne, sur chaque
démarche, `organizations` : les organismes de l'arbre de la collectivité (elle-même, ses communes,
ses services) qui l'ont **activée**, dans l'ordre de l'arbre — de quoi les nommer sur une carte et
filtrer par organisme. Version du contrat : **1.10.0**. Ajout additif sur la forme.

- ⚠️ **Le contenu de la liste change.** L'activation par organisation
  (`organization_procedures.is_enabled`) devient la **quatrième** règle de publication, après
  `production`, `externe` et la visibilité du bloc communication. Une démarche activée par une
  seule commune apparaît désormais sur le portail de l'agglomération ; une démarche que
  **personne** n'active n'est plus servie, même en `production`. `organizations` n'est donc jamais
  vide. Une organisation obsolète n'active rien.
- Les références de `GET /v1/portal/page` (`pinned`, `shortcuts`) suivent la même liste : une
  démarche épinglée que personne n'active en est écartée.
- Comme avant : **n'appliquez pas ces règles vous-même** depuis `/v1/procedures`.

---

## 2026-09-05 — public-api — ajout

**Le pied de page.** Nouveau `kind` dans la composition publiée (`GET /v1/portal/page`) :
`footer` — bandeau **pleine largeur**, `background` (`#rrggbb`), `columns` (1 à 3), `children`
(bandeaux `texte`, répartis dans les colonnes dans l'ordre). Version du contrat : **1.9.0**. Ajout
additif — un consommateur qui ignore les `kind` inconnus, comme le contrat le demande, n'a rien à
faire.

---

## 2026-09-05 — public-api — ajout

**La composition publiée d'une page du portail.** Nouvelle route
`GET /v1/portal/page?tenant_id=&slug=accueil` : la page d'accueil telle que la collectivité l'a
**publiée** depuis l'éditeur du Socle — sections typées (`recherche`, `demarches`, `actus`,
`compte`, `texte`), dans l'ordre. Version du contrat : **1.8.0**. Ajout additif.

- **Le brouillon n'est jamais servi.** L'éditeur enregistre automatiquement un brouillon ; seule la
  publication explicite alimente cette route. Sauvegarder n'est pas publier.
- **`404` n'est pas une panne** : rien n'a encore été publié. Rendez votre mise en page par défaut.
- **Les références sont résolues** : `pinned` et `shortcuts` ne portent que des identifiants de
  démarches publiées (mêmes règles que `/v1/portal/procedures`). Joignez sur cette liste.
- ⚠️ **Ignorez les `kind` inconnus.** Le serveur peut apprendre de nouvelles sections avant vous ;
  une section inconnue s'ignore, elle ne casse pas la page. `actus` est servi sans contenu à ce jour.

---

## 2026-09-05 — public-api — ajout

**Le portail usagers.** Deux routes sous le tag « Portail », version **1.7.0**, ajout additif :

- `GET /v1/portal/tenant?hostname=` — résout un **domaine** en collectivité (`id`, `name`, `slug`,
  `hostname`). C'est ce qui permet à une instance unique de portail de servir toutes les
  collectivités sans en connaître aucune : ajouter un domaine dans le Socle suffit. Domaine inconnu,
  hors périmètre ou collectivité obsolète : le **même `404`** — la route ne révèle pas ce qui existe.
- `GET /v1/portal/procedures?tenant_id=` — les démarches qu'un **usager** doit voir, **déjà
  filtrées** (`production`, `externe`, visibles sur le portail, dans leur période — heure de Paris).
  Réponse volontairement étroite : ni `form_schema`, ni `knowledge_base`, ni `agent_description`.
  **N'appliquez pas ces règles vous-même** depuis `/v1/procedures`.

---

## 2026-09-01 — public-api — ajout

**Une démarche dit désormais quels documents l'agent peut en produire.** Nouveau catalogue
`GET /v1/document-templates` (+ `/{id}`, + `/{id}/signed-url`) : des modèles `.doc`/`.docx`/`.odt`
porteurs de variables, qualifiés `interne`, `externe` ou `courrier`. Et sur chaque démarche, un
nouveau champ **`documents`** qui porte la sélection faite au paramétrage. Scope `read`.
Version du contrat : **1.6.0**.

Ajout **additif** : aucun champ existant ne change, `communication_config` reste transmis tel quel.

- **`Procedure.documents` est déjà résolu.** Vous y trouvez le libellé, le type, le groupe et le
  nom de fichier de chaque document, dans l'ordre du paramétrage — de quoi afficher la liste à un
  agent **sans second appel**. C'est le même parti que le `quartier` embarqué dans la fiche
  contact et que la charte graphique résolue : ce qui s'applique, servi tel quel.
- ⚠️ **`documents.restrict_visibility` gouverne les conditions, et il vaut `false` par défaut.**
  Chaque document porte une `visibility` (`toujours` / `positive` / `negative`, l'issue de la
  demande). Ces conditions sont **conservées** quand le paramétreur désactive la restriction — le
  commutateur gouverne l'usage, pas la donnée. Un consommateur qui applique les `visibility` sans
  lire `restrict_visibility` **masquerait des documents rendus visibles**. Lisez le drapeau d'abord.
- ⚠️ **Ne reconstituez pas la liste depuis `communication_config.documents`.** Ce bloc brut ne
  porte que des identifiants, et une sélection peut **survivre à son document** : le paramétrage
  vit dans un JSON sans clé étrangère, un document supprimé du catalogue y laisse un identifiant
  mort. `Procedure.documents` les écarte déjà. Le bloc brut n'est documenté (`DocumentsConfig`)
  que pour lever l'ambiguïté sur ce qui est stocké.
- **Le fichier passe par une URL signée**, valable 5 minutes :
  `GET /v1/document-templates/{id}/signed-url`. Le chemin de stockage n'est **pas** exposé — ni
  sur `DocumentTemplate`, ni ailleurs. La garde de périmètre porte sur la ligne, pas sur une
  chaîne que vous fourniriez. Ne stockez pas l'URL obtenue, redemandez-la.
- ⚠️ **À ne pas confondre avec `GET /v1/documents/signed-url`**, qui sert depuis toujours les
  documents de la *base de connaissances* d'une démarche (bucket `procedure-documents`) à partir
  d'un chemin. Deux ressources différentes, deux buckets, deux endpoints : celui-ci est inchangé.
- **Rien de rétroactif** : une démarche qui n'est pas passée par l'étape Communication depuis ce
  jour a `documents: {restrict_visibility: false, items: []}`. Aucun document n'est proposé nulle
  part tant qu'il n'a pas été choisi — le catalogue ne se déverse pas dans les démarches.

---

## 2026-08-30 — ai-api — correctif

**Le contrat annonçait une URL qui répond 404.** `openapi.json` déclarait comme
serveur `https://<projet>.supabase.co/ai-api`, sans le préfixe `/functions/v1` :
un consommateur qui faisait confiance au contrat — c'est-à-dire le bon réflexe — partait dans le
mur. La bonne base est `https://<projet>.supabase.co/functions/v1/ai-api`, inchangée
depuis le premier jour ; seule sa **déclaration** était fausse. Aucune requête existante n'est
affectée, aucun champ ne bouge : contrat toujours **1.1.0**.

- **Cause** : `parseRoute` reconstruisait l'URL publique depuis le chemin **entrant**,
  dont la passerelle Supabase a déjà retiré `/functions/v1`. `public-api` et
  `contacts-api` utilisent un préfixe fixe depuis toujours ; seule `ai-api`
  divergeait. Elle utilise désormais le même.
- ⚠️ **Pourquoi les tests ne l'ont pas vu** : `openapi.test.ts` vérifie bien que le
  serveur annoncé porte `/functions/v1/ai-api` — mais il teste
  `buildOpenApiDocument(serverUrl)`, à qui l'on passe l'URL. Le défaut était dans le
  **calcul** de cette URL, resté dans `index.ts` (code Deno, hors du périmètre vitest).
  Un test vert sur une fonction pure ne dit rien de ce qui l'appelle.
- Si vous aviez codé en dur la mauvaise URL après lecture du contrat, corrigez : elle n'a jamais
  fonctionné, la panne était immédiate et non silencieuse.

---

## 2026-08-30 — public-api — ajout

**La charte graphique d'une collectivité est maintenant lisible, héritage résolu.** Nouvelle
ressource `GET /v1/organizations/{id}/branding` : logo couleur, logo blanc, couleur
principale, couleur secondaire — de quoi habiller une interface aux couleurs de l'organisation.
Scope `read` (rien ici n'est un secret, contrairement au serveur d'envoi). Version du
contrat : **1.5.0**.

Ajout **additif** : aucune ressource existante ne change, `Organization.logo_url` reste
servi tel quel.

- **L'héritage est déjà appliqué.** Une charte se définit d'ordinaire sur l'organisation
  principale et vaut pour toute sa descendance ; une sous-organisation peut en avoir une propre.
  La réponse est celle qui **s'applique**, et `source_organization_id` dit qui la porte
  (`inherited` le résume). Interroger une sous-organisation suffit — ne remontez pas
  l'arbre vous-même.
- ⚠️ **Ne reconstituez pas la charte depuis `GET /v1/organizations/{id}`.** Les colonnes
  brutes d'une organisation qui hérite sont **nulles** : vous peindriez du vide au lieu des
  couleurs de sa collectivité. C'est précisément pour éviter que chaque application réécrive
  (différemment) la même remontée d'arbre que la ressource existe. Les trois colonnes ajoutées
  côté Socle (`logo_white_url`, `primary_color`, `secondary_color`)
  ne sont **pas** exposées sur `Organization`, et ne le seront pas.
- `configured: false` ⇒ aucun élément défini nulle part au-dessus : retombez sur votre
  habillage par défaut. Ce n'est pas une erreur, seulement une collectivité qui n'a pas encore
  rempli sa charte — cas majoritaire aujourd'hui, la fonctionnalité datant de ce jour.
- Couleurs servies en hexadécimal **minuscule** (`#rrggbb`) ou `null`. Une
  valeur qui n'est pas une couleur valide est servie `null` plutôt que transmise.
- Hors périmètre de la clé ⇒ `404`, comme partout ailleurs.

---

## 2026-08-30 — public-api — ajout

**Une démarche dit maintenant si elle est finie.** Nouveau champ `status` sur `Procedure`
(`brouillon` | `production`), colonne `procedures.status` alimentée par le commutateur
« Production » de la liste des démarches. Version du contrat : **1.4.0**.

Ajout **additif** — mais avec une conséquence à lire avant de brancher quoi que ce soit :

- ⚠️ **Toutes les démarches existantes sont en `brouillon`.** La notion n'existait pas avant le
  2026-08-30 : personne n'avait donc déclaré une démarche prête, et la migration n'a rien
  affirmé à leur place. Un consommateur qui filtrerait sur `status = 'production'` dès
  aujourd'hui n'obtiendrait **aucune** démarche. Attendre que les collectivités aient basculé
  leur catalogue, ou traiter l'absence de bascule comme un cas à part.
- ⚠️ **`status` et `communication_config.visibility` ne disent pas la même chose.** `status` dit
  si la **configuration est finie** (décision de l'agent qui paramètre) ; `visibility` dit **où
  et quand** proposer une démarche déjà prête (décision d'exposition). Une démarche en
  production peut n'être sur aucun portail — une démarche interne, par exemple. Une démarche en
  brouillon n'est nulle part, **quelle que soit sa visibilité** : c'est la garde qui prime.
- Le champ est **toujours présent et jamais nul** : la colonne est `NOT NULL` avec un CHECK, et
  le sérialiseur retombe sur `brouillon` devant toute valeur inattendue — le doute ne publie
  rien.

---

## 2026-08-30 — public-api — ajout

**La démarche dit désormais si elle doit être publiée, et quand.** Nouveau champ
`communication_config` sur `Procedure` (`GET /v1/procedures` et `/v1/procedures/{id}`) — JSON
**possédé**, transmis tel quel comme `form_schema` et `knowledge_base`. Premier bloc,
`visibility`, alimenté par l'étape « Communication » du paramétrage : `portalVisible`,
`publicationPeriodEnabled`, `publicationStart`, `publicationEnd`. Version du contrat : **1.3.0**.

Ajout **additif** : aucun champ existant ne bouge, aucun consommateur n'a à changer. Le
comportement n'est pas encore branché côté portail — le Socle **enregistre et publie** le
paramètre pour que l'aval puisse s'y adosser quand il en aura l'usage.

- ⚠️ **`null` n'est pas « non visible »** : une démarche jamais passée par l'étape porte
  `communication_config: null`, à lire comme les **valeurs par défaut** — visible sur le
  portail, publication non bornée. Toutes les démarches existantes sont dans ce cas : traiter
  `null` comme un refus de publication les retirerait toutes d'un coup.
- ⚠️ **Les deux bornes de période sont incluses**, au jour civil (`AAAA-MM-JJ` — pas d'instant,
  pas de fuseau), et chacune est facultative : `publicationStart` seul publie à partir de ce
  jour, `publicationEnd` seul jusqu'à ce jour, les deux nuls ne bornent rien.
- ⚠️ **Les dates survivent à la désactivation de la période** : `publicationPeriodEnabled: false`
  laisse `publicationStart`/`publicationEnd` en place (le commutateur gouverne l'usage, pas la
  donnée — même parti que `email_sender_name` sur une organisation). Un consommateur qui
  appliquerait les dates sans regarder le commutateur dépublierait à tort.

---

## 2026-08-29 — ai-api — ajout

**Le guichet apprend à lire les documents, et à rendre du JSON.** Deux évolutions **additives**
appelées par la bascule de Clara, dont l'analyse de courrier repose sur l'OCR de pièces jointes
scannées et sur une extraction structurée — deux besoins que la v1 du guichet ne couvrait pas.

- `POST /v1/ocr` — extrait le texte d'un PDF scanné ou d'une image, **au même plafond, au même
  compteur et dans le même journal** que les complétions (`resource_type = 'ocr'`, prévu au
  schéma depuis l'origine : aucune migration). Réponse : `{ text, pages, page_count, usage,
  quota, provider, event_id }`.

  ⚠️ **Le document ne transite pas par le Socle.** L'appelant fournit une **URL https signée et
  de courte durée** que le fournisseur va chercher lui-même. La promesse de passe-plat est donc
  plus forte ici que sur les complétions : l'octet du document ne traverse jamais le Socle.
  Refusés : tout schéma autre que `https`, les identifiants dans le lien, un lien de plus de
  4096 caractères, et `include_image_base64` — celui-là parce qu'il ferait transiter les
  illustrations du document par le Socle.

  ⚠️ **Le plafond est en jetons, l'OCR se facture à la page.** La réservation part du
  `page_count_hint` (1200 jetons par page, délibérément haut) ; le **règlement retient le texte
  réellement extrait**. Une page blanche ne coûte donc presque rien, et sous-déclarer les pages
  ne fait rien gagner. Au-delà de **100 pages** annoncées : `400 payload_too_large` — le plafond
  mensuel ne borne pas le coût d'un appel unique.

- `POST /v1/completions` accepte désormais **`response_format: "json"`** — contrainte de sortie
  pour un appelant qui **parse** au lieu d'afficher. Sans lui, une application qui a besoin de
  structure n'avait que deux issues : supplier dans son prompt et retenter sur échec (donc payer
  deux fois le même appel), ou réclamer `tools` — la porte qu'on tient fermée. La valeur est un
  **alias du Socle** ; la forme du fournisseur (`{ type: "json_object" }`) reste refusée, comme
  `model` et `agent_id`.

  ⚠️ Le mot « json » doit figurer dans `system` ou dans un message : exigence du mode JSON du
  fournisseur, **vérifiée par le Socle avant toute dépense** plutôt que découverte chez le
  fournisseur — sans quoi l'appelant recevrait `502 ai_unavailable` pour une erreur de payload,
  et chercherait longtemps.

  ⚠️ Le JSON rendu est **valide, pas conforme** : aucun schéma n'est imposé au modèle. Le
  consommateur revalide `answer` contre ses propres règles. Ce n'est pas un manque du guichet,
  c'est la frontière : le Socle décide du coût, l'application décide du sens.

**Ce qui n'a pas changé** : `tools`/`tool_choice`, `stream`, `temperature`, `model`, `agent_id`,
`consumer` et `organization_id` restent refusés, pour les raisons déjà écrites. L'ajout de
`response_format` ne les rouvre pas — un paramètre est refusé quand il déplace une **décision**
vers l'appelant, pas quand il décrit la **forme** de ce qu'il attend.

---

## 2026-08-29 — ai-api — ajout

**Garde-fou de cadence.** Un plafond mensuel dit *combien*, jamais *à quelle vitesse* : une
boucle accidentelle chez un consommateur consommerait le budget d'un mois en quelques minutes,
et le refus n'arriverait qu'une fois l'argent dépensé. Le rythme est donc borné **par agent
(`actor_id`) et par NATURE d'appel** — un échange conversationnel suit une cadence humaine, un
lot d'OCR une cadence machine :

| Nature | Par agent | Sans agent identifié |
|---|---|---|
| Conversationnel (`/v1/completions`) | 20 / minute | 120 / minute |
| Lot (`/v1/ocr`) | 60 / minute | 360 / minute |

Les deux natures ont des compteurs **séparés** : un lot de documents ne consomme pas le budget
de questions du même agent. Un type d'appel inconnu retombe sur le seuil conversationnel, le
plus strict — sur un garde-fou de coût, l'inconnu se bride.

- Nouveau code d'erreur **`ai_rate_limited`**, en `429` comme `ai_quota_exceeded` mais
  **distinct** : le crédit est **intact**, seul le rythme est en cause. Le geste attendu n'est
  pas de demander un relèvement, mais d'attendre — d'où l'en-tête **`Retry-After`** (secondes
  jusqu'à la fenêtre suivante), que le refus de plafond ne porte pas.
- La réponse ne contient **pas** de bloc `quota` : il n'aurait rien à y dire, et le remplir
  laisserait croire que le budget est en cause.
- ⚠️ **Le compteur retient les TENTATIVES, refus de plafond compris.** Un consommateur déjà
  refusé pour crédit épuisé et qui continuerait d'appeler finit donc par être freiné. C'est
  voulu : sans cela, le garde-fou serait inopérant précisément dans le cas où il sert.
- Le seuil **n'est pas réglable** par collectivité : c'est un garde-fou, pas un paramètre
  commercial.

**Ce qui ne change pas** : aucune modification du corps de requête, aucun champ ajouté ou
retiré, et le contrat des réponses `200` est identique. Un consommateur qui ne dépasse pas la
cadence ne voit aucune différence. OpenAPI en **1.1.0**.

---

## 2026-08-29 — ai-api — ajout

**Nouvelle API : le guichet IA du Socle.** La clé du fournisseur LLM et la comptabilité des
jetons quittent les applications pour vivre ici. Contrat rendu sur `/api-doc-ia`, OpenAPI
`1.0.0` sur `/openapi.json`.

- `POST /v1/completions` — l'appelant compose son prompt (`system` + `messages`) et le confie
  au Socle, qui **réserve, appelle le fournisseur, puis solde** la consommation réelle. Réponse :
  `{ answer, usage, quota, provider, event_id }`.
- `GET /v1/usage?period=AAAA-MM` — plafond, consommation et ventilation par application.

**Scope dédié `ai`**, réservé aux applications de la gamme : le scope `read` du référentiel ne
suffit pas (même posture que `smtp`). La clé doit en outre porter une **application imputable**
(`api_keys.consumer`) — sans elle, l'appel est refusé, parce qu'une dépense sans imputation ne
peut être ni facturée ni expliquée.

**Ce que l'appelant NE décide PAS**, et qui est refusé en `400` : `model` et `agent_id` (le
Socle reste l'autorité sur le coût ; l'appelant passe un **alias** `agent`), `consumer` et
`organization_id` (dérivés de la clé, jamais du corps), `tools`/`tool_choice`, `stream`,
`temperature` et consorts, et `role: "system"` dans `messages` — le prompt système a son propre
champ.

**Le budget est celui de la COLLECTIVITÉ, pas de l'application.** Un appel émis au nom d'une
sous-organisation débite sa racine, et toutes les applications de la gamme puisent au même
plafond mensuel. Le **journal** attribue la dépense par application ; le compteur et le plafond
restent globaux.

**Promesse de passe-plat** : le Socle **ne conserve ni le prompt ni la réponse**. Aucune colonne
du journal ne peut en porter (un test épingle l'ensemble exact des colonnes), l'appel fournisseur
est isolé dans un module sans client base ni journalisation, et un test lit le source pour
interdire toute trace du contenu. La limite, écrite : *le Socle voit le prompt ; il ne le garde
pas.*

**Erreurs propres à cette API** : `429 ai_quota_exceeded` (le message nomme la date de
renouvellement), `502 ai_unavailable` (fournisseur muet — son erreur brute n'est jamais
relayée), `503 not_configured` (plateforme sans fournisseur).

---

## 2026-08-23 — public-api — ajout

**`GET /v1/organizations/{id}/smtp` : héritage résolu et nouveau champ
`source_organization_id`.** Le Socle permet désormais à une **sous-organisation** d'utiliser le
relais de son organisme parent (par défaut) ou d'en déclarer un propre — commutateur
« Utiliser la configuration de l'organisme parent ». L'endpoint suit cette règle :

- il répond pour **toute organisation du périmètre de la clé**, plus seulement pour une racine :
  la garde « organisation principale » (qui renvoyait `404` sur une sous-organisation) **est
  levée** ;
- la réponse est le relais **applicable** : celui de l'organisation, ou celui de l'ancêtre le
  plus proche dont elle hérite ;
- le nouveau champ **`source_organization_id`** (uuid, nul si `configured: false`) dit laquelle
  des deux le porte, pour que le consommateur n'ait pas à remonter l'arbre lui-même.

**Impact consommateur** : additif. Une racine répond exactement comme avant (avec un champ en
plus, `source_organization_id` = son propre id). Une sous-organisation répond `200` au lieu de
`404` — un appelant qui traitait ce `404` comme « pas de relais ici, demander à la racine » peut
garder son code (il obtiendra la même configuration), ou interroger directement la
sous-organisation et supprimer sa remontée d'arbre. Aucun champ retiré ni renommé.
Version du contrat OpenAPI : **1.2.0**.

---

## 2026-08-23 — public-api — ajout

**Nouvel endpoint `GET /v1/organizations/{id}/smtp`** — serveur d'envoi (SMTP) de
l'organisation **principale**, servi aux applications de la gamme qui expédient les mails de la
collectivité (Iris en premier consommateur : il en tient un miroir rafraîchi à chaque
synchronisation du référentiel, plutôt que de faire ressaisir les identifiants).

C'est la **première et seule ressource de cette API qui sert un secret** (le mot de passe du
relais, en clair). Elle est donc gardée trois fois :

- la clé API doit porter le **nouveau scope `smtp`** — le scope `read` du référentiel ne
  suffit pas, une clé partenaire ne devient pas lectrice d'identifiants parce qu'elle lit les
  démarches (sinon `403`) ;
- l'organisation doit être dans le **périmètre** de la clé (sinon `404`) ;
- l'organisation doit être une **racine** : une sous-organisation n'a pas de relais propre
  (sinon `404`).

Réponse `200` avec `configured: false` et tous les champs nuls quand aucun relais exploitable
n'est défini (hôte ou adresse d'expédition manquants) : le consommateur retombe alors sur son
propre repli au lieu d'expédier avec une configuration bancale.

Le scope `smtp` est proposé à la création d'une clé (super admin → « API publique » /
« Clés plateforme »). **Aucune intégration existante n'est impactée** : les clés déjà émises ne
le portent pas et voient l'endpoint en `403`. Version du contrat OpenAPI : **1.1.0**.

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
