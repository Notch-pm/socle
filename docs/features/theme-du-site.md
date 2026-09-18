# Feature : thème du site de démarches (`portal_themes`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

L'apparence que chaque collectivité donne à SON portail — typographie, formes, densité, en-tête,
accessibilité —, réglée dans l'onglet **« Thème »** de l'éditeur (ouvert le 2026-09-08, grisé
jusque-là). **Nora l'applique** depuis le même jour : le réglage n'est pas décoratif, il change le
site.

- ⚠️ **LE THÈME NE PORTE AUCUNE COULEUR.** Elles vivent dans la **charte graphique** de
  l'organisation (`primary_color` / `secondary_color`, servies résolues par
  `GET /v1/organizations/{id}/branding`) et n'ont pas à exister deux fois. Le thème dit COMMENT
  peindre, la charte dit AVEC QUOI. Seule exception, et elle ne touche pas la donnée :
  `accessibility.darkPrimary` **fonce la couleur au rendu** (clarté × 0,75, teinte et saturation
  inchangées), sans modifier la colonne.
- ⚠️ **Le thème vaut pour TOUT LE SITE, jamais bloc par bloc** — d'où sa table plutôt qu'une clé
  dans `portal_pages` (qui est `(organisation, slug)`). Un thème par section multiplierait le
  contrat public par le nombre de blocs et rendrait toute cohérence visuelle impossible à tenir.
- ⚠️ **Pas de `version` dans le schéma**, contrairement à `portalPage.ts` : c'est un sac de
  valeurs énumérées dont chacune retombe sur SON défaut (`.catch`), il ne peut pas être « faux »,
  seulement partiellement inconnu. Un littéral de version y recréerait le piège que la roadmap
  signale pour la page. L'évolution se fait en **blocs voisins**, motif `communication_config`.
- ⚠️ **Un réglage conservé n'est pas un réglage appliqué** (motif `email_sender_name`) :
  `header.color` et `header.logoWhite` restent en base quand `fill` repasse à `"white"` — l'UI
  les masque, elle ne les efface pas.
- ⚠️ **« Aperçu gros texte » N'EST PAS ENREGISTRÉ** : c'est une simulation d'éditeur, comme le
  choix d'appareil (son libellé dit « Aperçu », son aide dit « Simule »). Le persister imposerait
  à tous les visiteurs un grossissement que seuls certains demandent, et qui entrerait en conflit
  avec le zoom de leur navigateur. Il vit dans l'état de `PortalEditor`, jamais dans `PortalTheme`.
- **Polices** : catalogue de **4** figé dans le code (`portalFonts.ts`) — Système, Nunito Sans,
  Rubik, Public Sans. C'est un **contrat de nommage** (motif `languages.ts`,
  `documentVariables.ts`) : l'`id` traverse la base puis l'API, en ajouter un est une entrée au
  changelog. ⚠️ **C'est le seul réglage du thème qui coûte quelque chose** — tout le reste est
  une variable CSS. Une seule famille chargée par site, deux graisses, `font-display: swap` ;
  « Système » ne télécharge rien. ⚠️ **Critère d'entrée : une licence qui autorise la
  REDISTRIBUTION** — un portail public ne référence pas une police, il la sert à chaque visiteur.
  Les trois familles web sont donc sous OFL 1.1 et **auto-hébergées** (`public/fonts/`, ici comme
  chez Nora ; `index.html` déclare les faces, inertes tant qu'aucun texte ne les utilise). C'est ce
  qui exclut **Marianne**, la police de l'État, dont la licence lui est propre — et ce qui interdit
  Google Fonts au rendu : l'IP de chaque visiteur partirait chez un tiers, sans base légale, sur le
  site d'une collectivité.
- **Préréglages** (4, figés) : ⚠️ **déduits, jamais stockés** (`presetName` compare) — un nom en
  base se désynchroniserait du premier réglage manuel. Ils gouvernent l'apparence, pas le contenu :
  la mention RGAA et `darkPrimary` leur survivent.
- ⚠️ **La mention d'accessibilité vit dans le thème mais ne se règle PLUS dans l'onglet « Thème »**
  (2026-09-18) : c'est un contenu, pas une apparence — elle se règle dans « Composition », au pied
  du canevas, et la déclaration complète dans « Contenus ». Le bloc `accessibility` la garde parce
  qu'elle vaut pour tout le site ; voir la fiche « Site de démarches ».
- **Contrôle des contrastes** : mesuré sur les couleurs **réelles** de la collectivité, telles
  qu'elles seront peintes (`resolveThemeColors` sert à la fois le rendu et le diagnostic — un
  diagnostic sur autre chose ne diagnostiquerait rien). Seuils RGAA AA (4,5 : 1 texte, 3 : 1
  interface, séparateurs « décoratifs » en dessous). ⚠️ Le correctif « Assombrir » n'est proposé
  **que s'il fait effectivement passer la ligne** : un bouton qui ne corrige rien ferait croire le
  problème traité. Quand un cran ne suffit pas, la bonne réponse est de changer la couleur dans
  « Charte graphique » — c'est ce que dit le pied du panneau.
- **Rendu = variables CSS**, jamais des props (`themeStyle.ts` → `--pt-*` posées sur la racine de
  la page). ⚠️ C'est **le** point de performance : bouger un curseur recalcule un objet de style,
  pas sept arbres de composants ; et côté portail, tout le thème tient en quelques centaines
  d'octets de CSS. ⚠️ Le rembourrage **horizontal** de la page reste FIXE : le pied de page
  l'annule par des marges négatives chiffrées (`FooterSection`), le rendre variable le ferait
  dépasser à chaque changement de densité.
- **Le canevas de la COMPOSITION est thémé lui aussi** (c'est le même `PortalCanvas`) : depuis le
  2026-09-08 il rend la page aux couleurs réelles de la collectivité, plus aux jetons du Socle. Un
  éditeur qui montre une autre page que celle qu'il publie ment. La vue « Thème » réutilise le
  canevas en `previewing` — on y règle l'apparence, pas la composition.
- **Publication** : l'agent publie « son site », donc `PortalEditorPage` publie **page ET thème**
  d'un seul geste (deux `mutateAsync` enchaînés), et l'`AlertDialog` ne se ferme que si les deux
  réussissent. Un demi-échec est sans piège (thème neuf sur composition ancienne, ou l'inverse :
  deux pages valides). Même minuteur de 800 ms pour les deux, et `flush` **n'écrit que ce qui a
  changé**.
- **En aval** (contrat 1.17.0, **consommé par Nora**) : `theme` sur `Tenant`
  (`GET /v1/portal/tenant`), là où `languages`
  a été mis — site-wide, nécessaire avant le premier pixel, sans aller-retour de plus. ⚠️ **Rien
  de publié ⇒ les DÉFAUTS du Socle, jamais `null`** : deux jeux de défauts finiraient par diverger,
  et c'est ce qui rendra indolore l'ajout d'un réglage. DTO en **snake_case** (`text_scale`,
  `logo_white`, `high_contrast`, `dark_primary`).
- Code : `src/features/portal/` — `portalTheme.ts` (schéma possédé, défauts, parse, préréglages),
  `portalFonts.ts` (catalogue), `contrast.ts` (luminance, rapport WCAG, `darkenColor`,
  `readableInk`, `withAlpha` — **seule** implémentation de la luminance du projet ; `portalPage.ts`
  y réexporte `HEX_COLOR` et `isDarkColor`), `themeStyle.ts` (palette dérivée, variables CSS,
  `contrastRows`) — les quatre **purs et testés** —, `usePortalTheme.ts`, `useFontPreview.ts`
  (Google Fonts chargées **seulement** à l'ouverture de l'onglet), `editor/ThemePanel.tsx`
  (testé). Miroir côté edge function : `public-api/_shared/portalTheme.ts` (testé des deux côtés,
  motif `readDocumentIds`). Migration `portal_themes`.
