# Journal des évolutions des API publiques

> **Public** : équipes consommatrices (Ariane, Clara, Iris, partenaires) · **Question traitée** :
> quand un contrat d'API a-t-il changé, et comment ? · **Dernière mise à jour** : 2026-09-12

Journal **append-only** : chaque évolution de la surface de contrat des API publiques
(`public-api`, `contacts-api`, `ai-api`, `audience-api`) — endpoint, paramètre, champ de réponse,
comportement d'authentification — ajoute une entrée datée en tête de liste. Une entrée n'est jamais
réécrite ; une correction s'ajoute sous une nouvelle date. Politique de compatibilité et obligations
consommateur : [integration.md](./integration.md#politique-de-compatibilité-v1).

Format d'une entrée : `## AAAA-MM-JJ — <api> — ajout|correctif|rupture`

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
