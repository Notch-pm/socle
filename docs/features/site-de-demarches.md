# Feature : site de démarches — portail usagers (`organization_domains`, `portal_pages`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Le portail usagers est **Nora** (dépôt `Notch-pm/Nora`) : une instance unique, **sans base de
données**, qui sert toutes les collectivités. Elle demande au Socle à qui appartient le domaine
visité, puis ce qu'elle doit afficher. Le Socle est donc la source de vérité de trois choses : le
**domaine** (`organization_domains`), le **catalogue public** (`/v1/portal/procedures`) et la
**composition de la page d'accueil** (`portal_pages`), éditée ici, dans l'écran « Site de
démarches ». Ajouter une collectivité au portail = une ligne de domaine, aucun déploiement.

- **Domaines** (`organization_domains`) : `hostname` **unique sur toute la plateforme** (un domaine
  désigne exactement une collectivité — c'est l'invariant de toute la résolution de tenant),
  normalisé par trigger à l'écriture, au plus un `is_primary` par organisation, **pas** restreint
  à une racine (une sous-organisation peut tenir son guichet). Écran `DomainsSection` : onglet
  « Domaines du portail » de l'éditeur d'organisation (admin) et section `?section=domaines`
  d'`OrgSettingsPage` (superadmin). ⚠️ **Écriture réservée au super administrateur** depuis le
  2026-09-08 (RLS `is_super_admin()`) : le sous-domaine fourni se pose au provisioning, un domaine
  personnalisé suppose un CNAME chez le client et un enregistrement chez l'hébergeur du portail ;
  les administrateurs lisent leurs domaines et la cible CNAME (`platform_settings`). ⚠️ Un doublon
  peut appartenir à une organisation que l'administrateur n'a pas le droit de voir : l'erreur ne
  dit pas laquelle. `localhost` est
  refusé par CHECK — le développement de Nora simule un domaine réel (`<label>.localhost` →
  `<label>.<PORTAL_DEV_DOMAIN_SUFFIX>`).
- **Composition** (`portal_pages`, une ligne par `(organization_id, slug)`, racine uniquement) :
  deux colonnes, **`draft`** et **`published`**. ⚠️ **Sauvegarder n'est pas publier** — et c'est
  structurel, pas une option : le brouillon est **autosauvegardé** (`useSaveDraft`, 800 ms après
  la dernière modification, n'écrit que `draft`, flush au démontage et au `beforeunload`) ; la
  publication est un geste explicite (`usePublishPortalPage`, `AlertDialog` qui ne se ferme que
  sur succès — un refus RLS doit rester visible) ; « Annuler » = `draft := published`. Le portail
  ne sert **que** `published` (404 = jamais publiée). Test dédié : une rafale de modifications ne
  produit qu'une écriture, jamais sur `published`.
- **Schéma possédé** (`src/features/portal/portalPage.ts`, motif `formSchema.ts`) :
  `{ version: 1, sections }`, kinds `recherche` / `demarches` / `actus` / `compte` / `texte` /
  `texte-image` / `footer`. Parse **tolérant section par section** (une section illisible est écartée, les autres
  restent — une page d'accueil de collectivité ne s'efface pas pour un bloc abîmé) ; repli total
  sur `defaultPortalPage()` si ce n'est pas une page. Les épinglages et raccourcis référencent des
  **`procedures.id`**, jamais des libellés. ⚠️ Les couleurs (`footer.background`) n'entrent que
  sous la forme `#rrggbb` : ce sont des valeurs CSS injectées dans une page publique — on écarte,
  on ne nettoie pas. « Contact et horaires » n'est pas un kind mais un **preset** de `texte`
  composé depuis `organizations.address / phone / email` (pas de colonne d'horaires : l'agent les
  tape).
- **Catalogue** (`catalogue.ts`) : la liste d'épinglage montre **tout** le catalogue de la racine
  avec sa visibilité portail (`brouillon` / `interne` / `masquee` / `hors-periode` /
  `non-activee` / `visible`, calculée par les règles existantes de `communication.ts` plus
  l'activation) — on surface, on ne masque pas. **Le canevas rend la liste réelle** (2026-09-06) :
  les seules démarches `visible`, chacune avec les **organismes qui la proposent**
  (`organization_procedures.is_enabled` sur l'arbre de la racine — `portalTreeOrganizations`,
  `useEnabledProcedureBindings`, `buildCatalogue`), et le filtre par organisme figé dans
  l'en-tête dès que deux organismes proposent quelque chose. ⚠️ Une démarche que **personne**
  n'active n'est pas servie par le portail, même en `production` : c'est le badge « Non activée ».
  La règle est le **miroir volontaire** de `public-api/_shared/portalCatalogue.ts`.
  ⚠️ **L'organisme affiché n'est pas toujours celui qui a activé** : un **service interne**
  s'efface derrière son porteur (voir la feature « Services internes »), et c'est le porteur qui
  entre dans la liste — dédoublonné, sans quoi deux cartes identiques apparaîtraient.
  ⚠️ `portalTreeOrganizations` renvoie **tout** le sous-arbre, obsolètes comprises, et c'est
  `offersByProcedure` qui les écarte : filtrer avant couperait la chaîne des parents, et un service
  interne deviendrait un sommet de liste — donc son propre porteur — et réapparaîtrait sous son
  propre nom. C'est aussi ce qui rend les deux miroirs littéralement identiques.
- **Fond du bloc de recherche** (`recherche.imageUrl` + `imageFullWidth` / `imageFixed`,
  2026-09-12) : une image qui **recouvre tout le bloc**, avec deux options — **pleine largeur** (elle
  va d'un bord à l'autre, comme le pied de page) et **image fixe**
  (`background-attachment: fixed` : le bloc glisse par-dessus au défilement).
  ⚠️ **C'EST UN FOND, PAS UNE ILLUSTRATION** — d'où l'absence d'`alt`, contrairement à
  `texte-image` : ce qu'une synthèse vocale doit lire, ce sont le titre et le sous-titre, posés
  **dessus**. Elle se rend en CSS, jamais en `<img>` (qui réclamerait un `alt` dont le seul honnête
  serait vide), et elle ne se traduit pas.
  ⚠️ **LE VOILE CLAIR A ÉTÉ RETIRÉ le 2026-09-12** (décision produit) : la photo se voit telle que
  la collectivité l'a choisie, dans l'aperçu comme sur le site. Il faut savoir ce que ça a coûté —
  ce voile à 60 % était une **garantie** de contraste, pas un effet : il laissait l'encre du
  portail à **5,7 : 1** sur le pire fond possible, au-dessus du seuil AA, quelle que soit l'image.
  Sans lui, il n'y a **plus aucune garantie** : sur un gris moyen, l'encre pleine elle-même tombe à
  **4,1 : 1** (mesuré et épinglé dans `themeStyle.test.ts`, des deux côtés). Ce qui reste comme
  filet : le sous-titre passe à l'encre pleine sur une image, et les puces de raccourci en blanc
  plein. Le jour où il faudra y revenir, la bonne forme est un voile **sous le texte seul** — la
  photo intacte, et le contraste avec.
  ⚠️ **Un bandeau pleine largeur en tête de page touche l'en-tête** (`flushBanner` dans
  `PortalCanvas`, `startsWithFullWidthBanner` chez Nora) : symétrique du pied de page collé au bas.
  Pendant un glisser qui vise la première place, la marge revient — sinon la cible de dépôt n'aurait
  plus où s'afficher.
  ⚠️ Les deux options sont **conservées** quand l'adresse est effacée (le réglage gouverne l'usage,
  pas la donnée — motif `email_sender_name`) : l'inspecteur les **masque**, le rendu les ignore, et
  recoller une adresse rend le bandeau tel qu'il était. C'est la **frontière** de Nora
  (`pageService.ts`) qui les éteint, comme `show_shortcuts` éteint les raccourcis : le rendu n'a pas
  à connaître un commutateur.
  ⚠️ Même URL libre en `https` absolue que `texte-image` (`IMAGE_URL`), signalée à la saisie et
  écartée des deux côtés ; une adresse refusée fait un bloc **sans fond**, jamais un bloc perdu.
  ⚠️ L'adresse est échappée (`JSON.stringify`) avant d'entrer dans la valeur CSS : `IMAGE_URL`
  autorise le guillemet, et une déclaration cassée ferait disparaître le fond sans rien dire.
  ⚠️ `imageFixed` est un **ornement** : plusieurs navigateurs mobiles ignorent `fixed` et y font
  défiler l'image — le bloc reste entier, l'inspecteur le dit.
  **Textes sur l'image** (`textColor` `theme`/`white` + `textShadow`, 2026-09-24, contrat 1.32.0) :
  la réponse de l'agent au voile retiré — c'est lui qui choisit, photo par photo, un titre et un
  sous-titre **blancs** et/ou une **ombre portée**. ⚠️ L'ombre est un **halo sans décalage** (elle
  part de tous les côtés) et prend le **contre-pied** du texte : sombre sous le blanc, claire sous
  l'encre (`imageTextStyle` dans `themeStyle.ts`, miroir chez Nora, testé des deux côtés).
  ⚠️ Même régime que les options de l'image : proposées **seulement sous une image**, conservées
  quand l'adresse est effacée, éteintes par la frontière de Nora. Les puces de raccourci et le
  champ ne changent pas (déjà en blanc plein). Aucune garantie de contraste n'est rendue : c'est
  un outil, pas un filet.
  **En aval** (contrat 1.20.0, puis 1.32.0 pour `text_color` / `text_shadow`) : `image_url`, `image_full_width`, `image_fixed` sur
  `PortalRechercheSection`, **consommés par Nora**. Code : `imageBackdropStyle` dans
  `themeStyle.ts` (pur, testé des deux côtés — la garantie de contraste EST le test), rendu dans
  `editor/sections/RechercheSection.tsx` ; côté Nora, `HomeComposition` rend le bandeau pleine
  largeur **hors** de son conteneur centré, comme le pied de page.
- **Texte et image** (`texte-image`, 2026-09-07) : un paragraphe et une illustration, côte à côte
  et **empilés sur mobile**. `layout` (`text-first` / `image-first`) est un **ordre de lecture**,
  pas une position : porté par un seul `order-first`, il vaut dans les deux dispositions — « image
  à gauche » n'a plus de sens sur un téléphone, « image d'abord » si. Titre **facultatif** (comme
  le pied de page) : ce bloc illustre autant qu'il annonce. ⚠️ `imageUrl` est une **URL libre**,
  motif `organizations.logo_url` : le Socle enregistre et publie, il n'héberge pas le fichier — mais
  il filtre la **forme** (`IMAGE_URL` : **`https` absolue, rien d'autre**), parce que la valeur finit
  dans le `src` d'une page publique ; on **écarte**, on ne nettoie pas (motif `footer.background`),
  et le bloc reste servi sans image plutôt que perdu. ⚠️ `http://` et les chemins absolus sont
  refusés **à la saisie** alors que le Socle pourrait les stocker sans risque : c'est le portail qui
  ne peut pas les rendre (servi en https, et il n'héberge aucun média de collectivité), et une
  adresse acceptée ici mais écartée là-bas ne se découvrirait qu'en production. Le champ le **signale à la saisie** : sans
  cela, le parseur l'écarterait en silence au rechargement. ⚠️ `alt` **se traduit** — c'est ce que
  lit une synthèse vocale, le laisser en français ne traduirait la page que pour ceux qui la voient
  (d'où sa présence dans `PORTAL_SECTION_FIELDS` et dans `FIELD_SPECS` de `translate-labels`) ;
  **vide = image décorative**, jamais le titre recopié à sa place.
- **Filtre « Je suis… »** de la grille de démarches (`demarches.audienceFilter`, 2026-09-07) :
  citoyen / entreprise / association, d'après les publics activés à l'étape « Informations
  demandeur » (`enabledAudiences`, pur et testé, lu dans `PortalCatalogueEntry.audiences`).
  ⚠️ Il se **cumule** avec le filtre par organisme, il ne le remplace pas : deux dimensions de la
  même grille — qui je suis, et à qui je m'adresse. ⚠️ Le réglage dit ce que la collectivité
  **veut** ; c'est le catalogue affiché qui dit s'il a un **sens** : sous deux publics représentés
  (`catalogueAudiences`), la pastille ne s'affiche pas — un filtre à un seul choix n'en est pas un.
  Même règle que le filtre par organisme, et les deux pastilles sont décoratives dans le canevas.
  ⚠️ **Le défaut de la fabrique (`true`) diverge de celui du parseur (`false`)**, et c'est voulu :
  une grille neuve le propose, une page composée avant qu'il existe ne gagne pas un filtre que
  personne n'y a mis. ⚠️ Une démarche **sans public déclaré** ne répond à aucun choix (elle reste
  visible sans filtre) : la lire comme « tous publics » la ferait apparaître là où elle n'est pas
  ouverte.
- **Éditeur** (`PortalEditorPage` → `PortalEditor` → `editor/*`) : entrée de menu « Site de
  démarches » (`/site-de-demarches`, `?org=` quand plusieurs racines) et
  `/superadmin/organisations/:orgId/portail`. Le bandeau de la maquette porte le **logo de la
  collectivité** (`organizations.logo_url`), avec repli sur la pastille — même règle que Nora
  (`PageHeader`), et si l'URL ne charge pas : une vignette cassée dans une maquette se lit comme
  un défaut de la page. ⚠️ Pas de `resolve_branding` ici : l'éditeur est toujours sur une **racine**,
  qui n'hérite jamais, donc la colonne porte déjà la valeur résolue que Nora reçoit de
  `GET /v1/organizations/{id}/branding`. Palette / canevas / inspecteur, aperçu = le canevas
  sans son chrome, Bureau / Tablette / Mobile (`device.ts`, largeur de page fixe mise à l'échelle
  par CSS `zoom` — pas `transform`, pour que le conteneur défilant suive ; ajustement à la fenêtre
  et Ctrl/⌘ + molette). Glisser-déposer dnd-kit avec la logique pure dans `portalReorder.ts` :
  **`dropIndex`** est le nombre unique que partagent l'ombre affichée et le dépôt (ce qu'on voit
  est là où le bloc va) ; `transition: null` + `dropAnimation={null}` (aucun effet de « retour »
  après dépôt) ; un dépôt sur sa propre place ne remonte pas au parent (sinon une sauvegarde
  partirait pour rien). **Retirer un bloc** : bouton « Supprimer la section » de l'inspecteur
  (hors du panneau grisé des actualités — on doit pouvoir retirer ce qu'on ne peut pas éditer),
  corbeille de la pastille du bloc (qui **annule le zoom** de la page pour rester cliquable), ou
  Suppr / Retour arrière hors d'un champ. Sans confirmation : c'est un brouillon.
- **Pied de page** (`footer`) : pleine largeur (annule les marges de la page), fond configurable
  (défaut sombre `#0f1f18`, texte clair ou sombre selon la luminance — `isDarkColor`), 1 à 3
  colonnes de sous-blocs `texte`. **En dernière position, il EST le bas de la page** : pas de
  marge sous lui, « Ajouter une section » passe au-dessus, et `appendIndex` glisse tout bloc
  ajouté « en fin de page » au-dessus de lui (un second pied de page s'ajoute après).
- **Multilingue (2026-09-07)** : chaque bloc porte ses textes traduits (`translations` sur la
  section — voir feature « Langues »). ⚠️ `setSectionTranslation` **n'élague pas** la valeur,
  contrairement à `translationsForWrite` : ici l'état EST le JSON, et élaguer à chaque frappe
  supprime l'espace au moment où on le tape — les espaces devenaient impossibles à saisir.
  L'élagage se fait à la lecture (`parseTranslations`), comme partout. L'inspecteur propose **un seul bloc de traduction par
  section**, replié (`<details>`), en bas du panneau donc **sous les textes français qu'il
  traduit** ; un bloc par sous-bloc du pied de page. ⚠️ Un bloc par CHAMP produirait un appel au
  guichet IA par champ, contre la règle « un seul appel pour tous les textes d'une ligne ».
  ⚠️ **Rien ne s'affiche si la collectivité est monolingue** — le garde est dans l'inspecteur, pas
  dans `TranslationFields` (les écrans de paramétrage gardent leur phrase explicative ; un canevas
  n'explique pas un réglage qui vit ailleurs). ⚠️ `TranslationFields` reçoit ici `reviewHint` /
  `overwriteHint` : ses phrases par défaut parlent d'« enregistrer » et de « valider le
  formulaire », deux gestes qui **n'existent pas dans l'éditeur** (le brouillon s'autosauvegarde,
  le dernier mot est **Publier**). Le canevas montre en outre **la place du sélecteur de langue**
  de l'usager dans son chrome de page — décoratif comme la nav, affiché seulement au-delà d'une
  langue, et **visible même en mobile** : c'est le seul élément qu'un visiteur non francophone
  doit pouvoir atteindre. Les langues viennent de `useOrganizationLanguages(racine)`, **jamais**
  des clés de `translations` (une langue activée mais pas encore traduite doit apparaître).
- **Grisé, pas caché** : le bloc « Actualités » (palette et inspecteur, et son entrée dans la vue
  « Contenus ») — aucune route, `aria-disabled`, « Bientôt disponible ». Le parse accepte quand
  même `actus` : une composition importée plus tard ne sera pas amputée. La vue **« Thème » est
  ouverte** depuis le 2026-09-08 (feature ci-dessous), la vue **« Contenus »** depuis le
  2026-09-18 (section suivante).
- **Déclaration d'accessibilité et contenus du site** (2026-09-18, contrat 1.25.0) — deux objets,
  deux vues, et c'est voulu :
  - La **mention** (une phrase au pied de TOUTES les pages, un lien) se règle dans
    **« Composition »** : bande cliquable sous la dernière section du canevas, inspecteur dédié
    (`editor/AccessibilityMention.tsx`). ⚠️ **Ce n'est pas une section** : état de sélection à
    part (`mentionSelected`), pour qu'aucun geste de section — Suppr, flèches, glisser — ne
    l'atteigne. Ses réglages vivent dans le **thème** (`accessibility.declarationEnabled` /
    `declaration` / `declarationLink`) : ils valent pour tout le site, pas pour l'accueil. Le
    champ a donc QUITTÉ l'onglet « Thème », qui dit où il est parti.
  - La **déclaration** (plusieurs écrans, Markdown) se rédige dans **« Contenus »**
    (`editor/ContentsPanel.tsx`), table **`portal_contents`** (slug `accessibilite`, schéma
    `portalContent.ts`). Bouton « Partir du modèle RGAA » : la structure du modèle de la DINUM,
    pré-remplie avec le nom et les coordonnées de la collectivité. ⚠️ **Tout ce qui est
    engageant reste entre crochets** — état de conformité, taux, date et auteur de l'audit : le
    modèle donne la structure, jamais le résultat. Remplacer un texte existant passe par une
    confirmation.
  - ⚠️ **Le lien ne mène jamais à une page vide** : le canevas ne le montre que si la
    déclaration a un texte (`mentionPreview`), et l'API ne sert `declaration_link` que si une
    déclaration **non vide** est publiée. Une mention masquée sort **vide** de l'API (le
    commutateur s'applique à la frontière) ; son texte reste en base.
  - ⚠️ **Défauts « affichée » et « avec lien »**, parseur compris : deux collectivités avaient
    publié une mention avant ces commutateurs, les lire « masquées » l'aurait effacée de leur site.
  - **« Publier » publie le site entier** : composition, thème ET contenus (trois `mutateAsync`
    enchaînés dans `PortalEditorPage`) ; « Annuler » rend les trois ; un seul minuteur
    d'autosauvegarde.
  - **Chez Nora** : page `/accessibilite` (segment réservé — `ROUTE_SEGMENTS` là-bas,
    `organizations_slug_url_form` ici), Markdown rendu **sans `innerHTML`** (parseur → arbre →
    éléments React), titres décalés d'un niveau, `lang="fr"` sur le texte quand la page est servie
    dans une autre langue.
  - Code : `portalContent.ts` (pur, testé : catalogue, parse, modèle RGAA), `usePortalContent.ts`,
    `editor/AccessibilityMention.tsx`, `editor/ContentsPanel.tsx` ; miroir edge
    `public-api/_shared/portalContent.ts` (testé des deux côtés). Migration `portal_contents`.
- **API** (tag « Portail » de `public-api`, contrat 1.7.0 → 1.20.0) : `GET /v1/portal/tenant?hostname=`
  (**même 404** pour inconnu / hors périmètre / obsolète : on ne renseigne pas sur l'existence des
  collectivités ; porte `languages`, les langues de la collectivité, héritage résolu), `GET /v1/portal/procedures?tenant_id=` (déjà filtrées : `production`, `externe`,
  `portalVisible`, dans leur période **heure de Paris**, **et activées par au moins un organisme
  actif de l'arbre du tenant** — chaque démarche porte `organizations`, dans l'ordre de l'arbre ;
  règle pure `_shared/portalCatalogue.ts`, lectures dans `loadPortalCatalogue` : sous-arbre,
  organisations, activations, catalogue de la **racine** du tenant ; depuis **1.15.0** chaque
  démarche porte aussi `audiences`, l'extrait de `requester_config` qui dit à **qui** elle
  s'adresse — ⚠️ seuls les NOMS des publics traversent, jamais les champs demandés au requérant,
  qui restent au détail ; ⚠️ une liste **vide** = aucun public déclaré, surtout pas « tous publics ».
  Miroir volontaire d'`enabledAudiences`, testé des deux côtés — motif `readDocumentIds` ; depuis
  **1.19.0** chaque démarche porte `access_mode` — ⚠️ qui **ne filtre rien** : une démarche réservée
  aux usagers authentifiés est servie comme les autres et doit s'afficher comme les autres, la
  connexion se demande au **dépôt**), `GET /v1/portal/procedures/{id}?tenant_id=`
  (le **détail** : le public de la liste, plus la catégorie et les DEUX schémas de saisie
  `form_schema` et `requester_config` — ils *sont* le formulaire de l'usager ; `knowledge_base`,
  `agent_description` et les documents ne franchissent toujours pas. Même `publishedCatalogue`,
  donc **404** pour une démarche non publiée, et son `form_schema` n'est pas même lu.
  ⚠️ clé machine d'un champ = `key` ; l'`id` ne sert qu'aux conditions),
  `GET /v1/portal/page?tenant_id=&slug=`
  (`published` seulement, références résolues sur ce même catalogue ; chaque section porte
  `translations` depuis le contrat **1.14.0** — schéma `PortalSectionTranslations`, **distinct** de
  `Translations` qui décrit `name`/`short_description`, et servi **par whitelist des champs du
  kind** : un `body` égaré sur une `recherche` ne sort pas ; en **1.15.0** s'ajoutent la section
  `PortalTexteImageSection` (avec la clé traduisible `alt`) et `audience_filter` sur la grille ; en **1.16.0** chaque organisme porte
  `handling_organization_id` — le service interne qui instruit, **identifiant seul, jamais son
  nom**). La charte vient de
  `GET /v1/organizations/{id}/branding` (résolue). ⚠️ `supabase/config.toml` déclare
  `verify_jwt = false` pour `public-api` : un déploiement sans ce fichier remet le défaut `true`
  et coupe **tous** les consommateurs (incident du 2026-09-05).
- **Informations usagers des organismes** (2026-09-24, contrat 1.30.0) :
  `GET /v1/portal/organizations?tenant_id=` sert, pour chaque organisme **affiché** de l'arbre
  (collectivité en tête), le descriptif, les **horaires d'accueil** et la FAQ rédigés dans
  l'onglet « Informations usagers » de l'organisation — public, sans brouillon, sans héritage ;
  rien d'écrit = `[]`. Lu par Nora et par son assistant. Détail : [`organisations.md`](organisations.md).
- Code : `src/features/portal/` — `portalPage.ts` (+ `fieldsForKind`, `sectionText`,
  `setSectionTranslation`, `hasTranslations`), `portalReorder.ts`, `catalogue.ts` (purs,
  **testés** — `catalogue.ts` porte aussi `audiences` par entrée, `catalogueAudiences` et
  `AUDIENCE_FILTER_LABELS`, les publics au **singulier** : ils complètent « Je suis… », là où le
  paramétrage les nomme au pluriel), `usePortalPage.ts` (`usePortalPage`, `useEnsurePortalPage`, `useSaveDraft`,
  `usePublishPortalPage`, `useDiscardDraft`), `PortalEditorPage.tsx` (chargement, autosave,
  publier / annuler — **testé**), `PortalEditor.tsx` (shell, état du glisser), `editor/`
  (`PortalCanvas`, `SectionBlock`, `SectionInspector`, `SectionTranslations`, `SectionPalette`,
  `ProcedurePickList`,
  `sections/*` — l'implémentation **de référence** du rendu de chaque kind ; Nora est le rendu
  réel). `src/components/ui/segmented-control.tsx` (promu pour l'éditeur ; `TabButton` /
  `ModeButton` restent à y rallier). Domaines : `src/features/organizations/{organizationDomains.ts,
  useOrganizationDomains.ts, DomainsSection.tsx}` (testés). Migrations `organization_domains`,
  `portal_pages`.
- Suite prévue (démarches « pour de vrai », multilingue, comptes usagers, échanges, pièces
  jointes, FranceConnect…) : `docs/roadmap.md`, section « Portail usagers ».
