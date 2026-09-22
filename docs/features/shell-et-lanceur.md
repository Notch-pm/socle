# Shell de l'app et bascule entre applications

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

## Shell de l'app par organisation (le même que dans la gamme, couleur du rail exceptée)

- **Rail latéral beurre** (`Sidebar.tsx`) : jeton dédié `--rail` / `--rail-foreground`
  (`index.css`, pas de couleur en dur) — fond `--rail: var(--secondary)` (`#FFCC57`, la secondaire
  du DS, référencée et non recopiée), icônes **bleu nuit `#0B132B`** à **pleine opacité dans tous
  les états** ; c'est la tuile qui marque le survol et l'actif (`rail-foreground/10|20`).
  ⚠️ **Pas le brun `secondary-foreground`** pour les icônes, même s'il est le contraste « officiel »
  de la secondaire : essayé à 80 % le 2026-09-11, il ressortait mal sur le jaune.
  ⚠️ **LA COULEUR DU RAIL N'EST PAS UN INVARIANT DE LA GAMME** — ses mesures et sa disposition,
  si (ci-dessous). Chaque application peint le sien — au 2026-09-11 : **Socle** en beurre
  `#FFCC57` à icônes bleu nuit, **Clara** en bleu nuit `#0B132B` à icônes blanches (son propre
  jeton `--rail`, rail et barre de navigation mobile), **Iris** et **Ariane** en primaire verte. Une couleur qui diffère d'un produit à l'autre n'est pas un écart à réaligner. Changer
  de couleur, c'est changer **le jeton et son jeton de contraste** ensemble (`bg-X` /
  `text-X-foreground`, états en `X-foreground/10|20`) — jamais un `white/…` ou `black/…` en dur,
  qui ne suit plus le fond.
  ⚠️ **Pas** les jetons `--sidebar-*` (charbon-forêt) : ils existent dans `index.css` à
  l'identique d'Iris et de Clara, qui ne s'en servent pas non plus pour le rail.
  ⚠️ **LES MESURES DU RAIL SONT CELLES DE LA GAMME, PAS CELLES DE SOCLE** : `w-[52px]`, `py-3`,
  tuiles de **36 px** (`h-9 w-9`) à icône de 20 px — identiques dans `AppSidebar` d'Iris, de
  Clara et d'Ariane. Socle a vécu jusqu'au 2026-09-10 sur 68 px à tuiles de 44 px : c'était le
  seul écart, et une largeur qui diverge est précisément ce qu'un agent remarque en changeant
  d'outil. La largeur est exportée en `RAIL_WIDTH_CLASS` — l'en-tête s'en sert pour aligner le
  lanceur sur l'axe des icônes.
  ⚠️ **Disposition de la gamme** : tableau de bord **épinglé tout en haut**, le reste **centré
  dans la hauteur du rail** — centré sur le rail ENTIER (`absolute inset-0`), pas sur la place
  qui reste sous le tableau de bord, sans quoi le groupe tomberait plus bas qu'ailleurs. Ni
  pastille de produit au-dessus (l'application se nomme dans l'en-tête), ni trait de séparation.
- **Documentations d'API en pied de rail** (`DocTile`, catalogue
  `src/features/public-api-docs/apiDocLinks.ts`) : « API Référentiel » (`/api-doc`) et
  « API Usagers » (`/api-doc-usagers`), **hors du groupe centré** comme le tableau de bord est
  hors de lui en tête.
  ⚠️ **Ce sont des liens sortants, pas des sections de l'application** : un `a` en
  `target="_blank"` et non un `NavLink` — on ne quitte pas un paramétrage en cours pour lire un
  contrat —, donc **jamais d'état actif** (l'écran actif est resté derrière). Le nouvel onglet
  s'annonce dans l'intitulé (`apiDocLinkTitle`) : dans un rail d'icônes, c'est le seul endroit où
  prévenir.
  ⚠️ **Un seul catalogue pour les deux menus** (ce rail et `SuperAdminSidebar`) : ajouter une
  documentation, c'est ajouter une entrée dans `apiDocLinks.ts`. Un test vérifie que chaque route
  citée existe **et reste publique** dans `App.tsx` — un lien mort ne lèverait rien à la
  compilation, il mènerait les deux menus sur `/login`. Le contrat `ai-api` (`/api-doc-ia`) n'y
  est pas : le guichet IA n'est ouvert qu'aux applications de la gamme.
- **En-tête** (`Header.tsx`) : **lanceur d'applications** (dans une colonne de la largeur du rail,
  voir ci-dessous) · wordmark Edilumen · séparateur · **logo + nom de l'organisation principale**
  — à droite : **pastille + nom du produit** (« Socle », en primaire) · séparateur · menu
  utilisateur. Motif repris du shell d'Iris/Clara.
  ⚠️ **QUI L'ON SERT À GAUCHE, AVEC QUOI À DROITE** : la collectivité est le **contexte** de tout
  ce que l'agent voit, elle suit donc immédiatement Edilumen ; le produit est un **repère de
  navigation** entre applications, il se pose à l'autre bout, contre le menu utilisateur.
  ⚠️ Le logo de la collectivité se lit **à nu**, sans pastille ni cadre : un logo est déjà une
  identité graphique, l'enfermer dans une capsule de couleur le met en concurrence avec elle. Il
  est traité comme un wordmark (hauteur fixe, largeur libre bornée — les logos de collectivité
  sont souvent des bandeaux). Sans `logo_url`, **le nom seul** : une initiale dans un carré ne
  serait qu'un ersatz de la capsule qu'on vient d'enlever.
  L'organisation affichée vient de `visibleRootOrganizations` (pur, testé) : le sommet de la
  forêt **visible**, pas la racine stricte — un membre d'une sous-organisation ne voit pas sa
  racine (`has_org_access` exige l'appartenance directe) et resterait sans repère.
  ⚠️ L'en-tête lit `logo_url` **brut**, sans résoudre l'héritage de charte : un membre dont le
  sommet visible est une sous-organisation qui **hérite** n'y voit aucun logo, alors que sa charte
  en résout un. Écart connu, hérité d'avant la charte (il fallait un `logo_url` propre pour voir
  quoi que ce soit) ; le combler demande un `resolve_branding` par sommet visible. Le Socle
  n'ayant **pas** de bascule de tenant (chaque écran a son sélecteur), plusieurs sommets
  s'affichent « premier nom + `+N` » avec la liste en `title`.

## Bascule entre applications de la gamme (`AppLauncher`, `suiteApps.ts`)

Le motif **« quatre carrés »** dans le coin gauche de l'en-tête ouvre la grille des quatre
produits — Socle, Iris, Clara, Ariane. Un agent voit où il est, et s'en va chez le voisin sans
changer de collectivité.

⚠️ **Le lanceur est la tête de la colonne de navigation**, pas un bouton d'en-tête posé là par
hasard : il occupe une colonne de `RAIL_WIDTH_CLASS` (exportée par `Sidebar.tsx`) et porte le
gabarit d'une tuile du rail — 36 px, `rounded-lg`, sans bordure —, si bien qu'il tombe
exactement sur l'axe vertical des icônes juste en dessous. Changer la taille des tuiles du rail
demande de changer celle du lanceur.

⚠️ **Iris, Clara et Ariane ont chacun le leur** (`AppSwitcher` + `apps.ts` / `lib/apps.ts`) : la
maquette est commune, les quatre implémentations sont **jumelles et indépendantes** — rien ne
transite d'un produit à l'autre, chacun tient sa propre session. Une divergence connue au
2026-09-10 : le **descriptif d'Iris** s'écrit « Demandes des usagers » chez Iris, « Portail des
démarches » chez Clara, « Gestion des demandes » ici. À trancher une fois pour les quatre.

- **Catalogue figé dans le code** (`src/components/layout/suiteApps.ts`, pur et testé), motif
  `languages.ts` / `documentVariables.ts` : c'est un **contrat de nommage**, pas une donnée de
  client. La `key` **EST** le sous-domaine — `iris` ⇒ `https://iris.edilumen.fr` —, et c'est cette
  régularité des quatre déploiements qui permet de ne rien paramétrer par collectivité.
  L'initiale de la pastille est **dérivée** du nom : saisie à part, elle finirait par le démentir.
- ⚠️ **NE PAS CONFONDRE avec la table `applications`** (registre des consommateurs d'API :
  `nora`, `iris`, `clara`, `socle` — feature « Applications et abonnements »). Celle-là dit qui a
  le droit d'**appeler** le Socle, celle-ci où un **agent** peut se **rendre**. Les deux listes se
  recoupent sans se confondre : **Nora** est le portail des **usagers**, elle n'a rien à faire
  dans un lanceur d'agent ; **Ariane** n'appelle pas encore l'API mais s'ouvre bel et bien d'ici.
- ⚠️ **Le damier de quatre carrés est RÉSERVÉ au lanceur** : c'est pour cela que le tableau de
  bord du rail porte désormais une **maison** (`House`) et non plus `LayoutDashboard`. Les deux
  tombant sur le même axe vertical, à 56 px l'un de l'autre, deux damiers l'un sous l'autre se
  liraient l'un pour l'autre. Le rail du **superadmin** (`SuperAdminSidebar`, large et légendé)
  garde son `LayoutDashboard` : le lanceur n'y est pas, et un super_admin ne voit jamais
  l'autre zone.
- ⚠️ **On change d'application, pas de collectivité** — le pied du panneau le dit (« Vous restez
  sur l'organisation X »), parce que rien d'autre à l'écran ne le dirait. Et l'application
  **courante** se coche au lieu d'être un lien : s'y « rendre » rechargerait la page pour aboutir
  là où l'on est déjà.
- Code : `src/components/layout/` — `suiteApps.ts` + `AppLauncher.tsx` (testés), consommés par
  `Header.tsx` et `Sidebar.tsx` (tous deux testés).
