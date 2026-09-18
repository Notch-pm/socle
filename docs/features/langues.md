# Feature : langues et libellés traduits (`enabled_languages`, `translations`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Une collectivité choisit les langues dans lesquelles elle s'adresse à ses usagers ; les libellés
des **démarches** et des **catégories** se traduisent dans chacune, depuis le 2026-09-07 le
**descriptif court** d'une démarche avec eux, et depuis le 2026-09-18 tout ce qu'elle écrit pour
ses usagers à l'étape « Communication usager » (descriptif usager, note sur le public, pièces
annoncées, FAQ usager). Le réglage vit sur
l'**organisation principale** (racine) : les langues d'une collectivité ne se découpent pas par
service — motif du catalogue de démarches, des quartiers, du plafond IA.

- **Le français est la langue pivot** : c'est lui que portent les colonnes (`name`,
  `short_description`). Il est toujours actif, ne se retire pas, et n'a **jamais** d'entrée dans
  `translations` — l'y écrire créerait une seconde source de vérité pour un même texte, et rien ne
  dirait laquelle fait foi le jour où elles divergent.
- **Catalogue figé dans le code** (`src/features/languages/languages.ts`), comme
  `documentVariables.ts` : c'est un **contrat de nommage** consommé en aval (le portail en fait son
  sélecteur, les clés de `translations` sont ces codes), pas une donnée de client. Deux groupes —
  **langues mondiales** et **langues régionales de France** (métropole et outre-mer). Codes
  **BCP 47** : ISO 639-1 quand il existe (`en`, `br`, `oc`), ISO 639-3 sinon (`gsw`, `frp`, `gcr`,
  `swb`, `dhv`). ⚠️ Quelques langues de France n'ont **aucun code ISO** (gallo,
  poitevin-saintongeais, francique lorrain, champenois…) : elles ne sont pas au catalogue, et les
  ajouter demande de **choisir une convention** (`fr-x-gallo`, usage privé BCP 47) — décision de
  nommage public, donc entrée au changelog d'API. La LSF n'y est pas : pas de forme écrite.
- **Base** : `organizations.enabled_languages` (`text[]`, défaut `{fr}`), CHECK
  `is_valid_language_set` — la base valide la **forme** (au moins `fr`, sans doublon, codes bien
  formés), **pas la liste** : ajouter une langue ne doit pas demander une migration. Trigger
  `enforce_languages_root_org` : poser des langues sur une sous-organisation est **refusé**, mais
  **rattacher** une organisation sous une autre est accepté (sa liste revient au défaut) — refuser
  bloquerait une réorganisation sans rien protéger.
- **Traductions** : `procedures.translations` (colonne préexistante, jamais utilisée, qui prend ici
  une forme possédée) et `categories.translations` (nouvelle). Forme
  `{ "<code>": { "name": "…", "short_description": "…" } }` — un objet par langue, dont les clés
  sont celles des **colonnes françaises** correspondantes. C'est ce choix qui a permis au
  descriptif court de rejoindre le libellé le 2026-09-07 **sans déplacer une seule entrée**, puis
  au **descriptif usager** (`user_description`, Markdown) de les rejoindre le 2026-09-18.
  `short_description` et `user_description` n'existent que sur `procedures` (une catégorie n'a pas
  de descriptif) ; les champs traduisibles sont déclarés une fois pour toutes dans
  `TRANSLATABLE_FIELDS` (front) et `FIELD_SPECS` (fonction). CHECK `jsonb_typeof = 'object'` des
  deux côtés. ⚠️ **Deux écrans écrivent `procedures.translations`** : l'étape « Descriptif »
  (libellé, descriptif court) et l'étape « Communication usager » (`user_description`) — chacun ne
  gouverne que ses champs (`translationsForWrite(…, fields)`), un test de chaque côté épingle
  que l'un n'efface pas le travail fait dans l'autre.
- **Troisième porteur (2026-09-07)** : les **textes de la page composée** du portail
  (`portal_pages.draft/published`), sous la même forme, avec le jeu de champs
  `PORTAL_SECTION_FIELDS` (`title`, `subtitle`, `placeholder`, `body`, `alt` — le texte alternatif
  d'une image du bloc `texte-image` : le laisser en français ne traduirait la page que pour ceux
  qui la voient). La traduction vit **sur la
  section** — elle voyage donc avec son bloc au glisser-déposer, à la duplication, à la
  suppression, et les sous-blocs du pied de page en héritent (ce sont des sections). ⚠️ Le schéma
  **reste en `version: 1`** : l'ajout est purement additif, et `parsePortalPage` refuse tout autre
  numéro — écrire un `2` ferait retomber la page entière sur `defaultPortalPage()`, c'est-à-dire
  perdre la composition d'une collectivité. ⚠️ **Zod strippe les clés inconnues** : `translations`
  doit être déclaré dans les six schémas de section, sans quoi une traduction saisie survit à la
  frappe puis disparaît au rechargement de l'éditeur (test d'aller-retour dédié).
- **Quatrième porteur (2026-09-18)** : les **textes de `procedures.user_communication`** — la
  note sur le public (`note`), chaque pièce annoncée (`label`, `description`), chaque question de
  la FAQ usager (`question`, `answer`) —, jeu `USER_COMMUNICATION_FIELDS`. Ces textes vivent dans
  un JSONB, pas dans des colonnes : ils ne peuvent pas rejoindre `procedures.translations`, et la
  traduction vit donc **sur l'entrée** (`translations` de la note, de chaque pièce, de chaque
  question), exactement comme sur une section de page — elle **suit sa question** quand la FAQ
  est réordonnée, disparaît avec elle, et aucune liste n'est à resynchroniser. Même forme, mêmes
  trois règles. ⚠️ **Toujours `{}` à l'écriture**, mais **absente** des entrées enregistrées avant
  le 2026-09-18 : un lecteur lit une absence comme `{}`. ⚠️ **L'état de l'écran EST le JSON** :
  la saisie passe par `setTranslation`/`applyTranslations` (valeur gardée telle quelle, élaguée à
  la relecture), pas par `translationsForWrite` — motif des sections. ⚠️ **Une réponse de
  traduction retrouve sa ligne par une CLÉ d'écran, jamais par son index** : elle revient
  plusieurs secondes après le clic, et repérée par son index elle se poserait sur la question qui
  a pris la place de celle qu'on vient de retirer (test dédié). La clé n'est jamais enregistrée.
  Rien ne se traduit dans `delays` : la durée est structurée, le portail la rend dans sa langue.
- ⚠️ **CHAQUE CHAMP EST INDÉPENDANT, ET LE REPLI SE FAIT CHAMP PAR CHAMP** : une langue peut
  porter le libellé traduit sans le descriptif — c'est le cas normal, pas une traduction
  inachevée. Un consommateur qui replierait la **langue entière** parce qu'un champ manque
  masquerait un libellé que la collectivité a bel et bien écrit, et qu'elle voit à son écran.
- ⚠️ **Un écran n'efface que les champs qu'il affiche** : `translationsForWrite` reçoit la liste
  des champs gouvernés (dernier argument). Sans elle, enregistrer une catégorie — qui n'affiche
  que le libellé — effacerait tout descriptif traduit vivant dans la même colonne.
- ⚠️ **Désactiver une langue n'efface pas ses traductions** (le réglage gouverne l'usage, pas la
  donnée — motif `email_sender_name`, `publicationPeriodEnabled`) : `translationsForWrite` part de
  l'existant et ne touche qu'aux langues **actives**. La réactiver rend le travail déjà fait.
- ⚠️ **Une traduction vide n'est pas stockée** : c'est l'absence de traduction. Un consommateur qui
  lirait la chaîne vide afficherait un texte vide là où il devait **retomber sur le français**. Une
  langue dont plus aucun champ n'est rempli **disparaît** de la colonne : une entrée vide se
  compterait comme « traduit en anglais » alors que rien ne l'est.
- **UI** : `LanguagesSection` (onglet « Langues » de `OrganizationEditorPage` côté admin, section
  `?section=langues` d'`OrgSettingsPage` côté superadmin — motif `BrandingSection`) : deux groupes
  de cases à cocher, recherche, français coché et verrouillé, récapitulatif des langues actives.
  ⚠️ Une réponse de traduction s'applique **d'un seul geste** (`onApply`), jamais case par case :
  un appelant qui possède un objet plus gros (la page composée) repart de l'état de son rendu à
  chaque appel, et trois cases écrites dans le même tick n'en laisseraient qu'une (bogue du
  2026-09-07 : titre et sous-titre perdus, seul le placeholder rempli).
  `TranslationFields` (partagé) affiche, par langue active, un champ par texte traduisible
  (`fields`) : libellé **et** descriptif court dans l'étape **Descriptif** d'une démarche, libellé
  seul dans le **dialogue de catégorie**. Avec deux textes, chaque langue devient un groupe
  (`fieldset`/`legend`) ; avec un seul, le nom de la langue reste l'étiquette du champ — encadrer
  un champ unique n'ajouterait qu'une boîte. ⚠️ Le bloc est placé **sous** les textes français
  qu'il traduit : demander à un agent la traduction d'un descriptif qu'il n'a pas encore écrit ne
  peut donner que des cases vides. `TranslatedIn` montre dans les deux listes les langues déjà
  traduites. L'étape **« Communication usager »** porte un bloc **par texte** (le descriptif, la
  note, chaque pièce, chaque question), chacun **replié** sous le texte qu'il traduit
  (`TranslationsDisclosure`, ouvert d'emblée s'il porte déjà une traduction) : un seul bloc pour
  toute l'étape aurait perdu la traduction au premier réordonnancement de la FAQ. ⚠️ **Rien ne
  s'y affiche pour une collectivité monolingue** (motif `SectionTranslations`) : répéter « aucune
  autre langue n'est activée » sous chaque question n'apprendrait rien — l'étape « Descriptif » le
  dit déjà.
- **Traduction automatique** (2026-09-06, étendue au descriptif court le 2026-09-07) : bouton
  **« Traduire automatiquement »** dans `TranslationFields` — donc dans les **deux** écrans,
  démarches et catégories, puisque c'est le même geste sur le même type de texte. ⚠️ **Un seul
  appel pour tous les textes d'une ligne**, jamais un par champ : un seul débit sur le crédit de
  la collectivité, un seul coup de cadence, et le modèle traduit le descriptif en sachant de
  quelle démarche il parle. Edge function **`translate-labels`** (JWT de session,
  `verify_jwt = true`), qui **appelle `ai-api`** avec la clé plateforme `SOCLE_AI_API_KEY`
  (consommateur `socle`, scope `ai`) : le Socle est ici sa propre application consommatrice, sous
  le plafond et la cadence de la collectivité, visible dans sa ventilation. ⚠️ Ne jamais la
  « simplifier » en lisant `MISTRAL_API_KEY` directement — ce serait un **second appelant du
  fournisseur**, donc un second endroit où plafond, cadence et journal peuvent diverger.
  ⚠️ **Elle ne remplit que les cases vides**, langue par langue **et champ par champ** : une
  traduction relue par un agent ne se distingue pas à l'écran de celle qu'il vient de recevoir,
  l'écraser en silence lui ferait perdre un travail qu'il ne saurait même pas avoir perdu. La
  garde est évaluée **à l'arrivée de la réponse** (`valueRef`), pas au clic : une case saisie
  pendant l'appel est protégée elle aussi. L'appel ne demande d'ailleurs que ce qui manque — les
  textes absents quelque part, les langues incomplètes. « Tout retraduire » existe, sous
  `AlertDialog`.
  **Communication usager** (2026-09-18) : le descriptif part en `kind: "procedure"` (c'est une
  colonne de la démarche), les entrées en `kind: "user_communication"` — **une entrée par appel**
  (la note, une pièce, une question), jamais tout le bloc. ⚠️ Le descriptif est en **Markdown** :
  le prompt exige d'en garder la syntaxe et de ne **jamais traduire l'adresse d'un lien**.
  ⚠️ **C'est le seul champ qui REFUSE au lieu de tronquer** (`refuseLonger`, 3 500 caractères,
  message à l'agent) : un intitulé trop long n'en est plus un, mais traduire en silence le début
  d'un descriptif de trois pages publierait une page amputée que personne n'aurait vue l'être.
  ⚠️ **Le budget de sortie suit la longueur réelle** des textes (`perLanguageCost`,
  `SOURCE_CHARS_PER_OUTPUT_TOKEN = 2`, estimation prudente pour les écritures non latines), le
  `cost` de `FIELD_SPECS` n'en est plus que le plancher : un long descriptif part une langue par
  appel, un court dans un seul lot.
  ⚠️ **Rien n'est persisté par la fonction** : la proposition se pose dans les champs, c'est
  l'enregistrement du formulaire qui l'écrit — l'agent garde le dernier mot (d'où « relisez avant
  d'enregistrer »). ⚠️ **Un texte qui ne se traduit pas est RECOPIÉ, pas écarté** (décision du 2026-09-07, après
  usage — la règle inverse tenait jusque-là). Un bandeau intitulé « ACCM » avec une adresse pour
  texte revenait entièrement vide : le modèle avait raison, mais à l'écran ça se lit comme un
  échec, et l'agent ne sait pas si son bloc est traité ou oublié. ⚠️ **Ce que ça coûte, et qui est
  assumé** : une copie stockée est **gelée** — le jour où le français change, elle continue de
  s'afficher à sa place, là où une absence serait retombée sur le français à jour. ⚠️ La
  distinction que tient le prompt : un **texte** intraduisible se recopie, une **langue** que le
  modèle ne maîtrise pas s'omet — recopier du français dans un champ breton ne dirait pas
  « identique », mais « pas fait ». Le français est par ailleurs affiché **en filigrane** de chaque
  case : le repli cesse d'être une règle à connaître pour devenir quelque chose qu'on voit. ⚠️ **Autorisation = `is_org_admin`**, évaluée avec les droits de
  l'appelant : le miroir exact du RLS d'écriture de `procedures`/`categories` — traduire pour une
  organisation où l'on ne pourrait rien enregistrer se paierait sur son crédit pour rien. ⚠️ Les
  langues demandées sont **recoupées côté serveur** avec `enabled_languages` ; le **libellé** de
  chaque langue, lui, vient du front, seul propriétaire du catalogue (le dupliquer dans la fonction
  ferait deux listes pour un seul contrat de nommage). Sans le secret, la fonction répond
  `503 not_configured` et l'écran le dit — voir `docs/operations.md`.
- **En aval** (contrat 1.11.0 ; `short_description` traduit servi en **1.13.0** ;
  `user_description` traduit et traductions des entrées de `user_communication` en **1.26.0**) :
  `GET /v1/portal/tenant` porte `languages` (héritage **résolu** par
  la RPC `resolve_org_languages`, EXECUTE réservé au service role — motif `resolve_branding`), et
  `translations` est servi **tel quel** sur `Category`, `Procedure` et `PortalProcedure` (schéma
  OpenAPI partagé `Translations`). ⚠️ `enabled_languages` n'est **pas** exposé sur
  `OrganizationDto` : brute, la colonne d'une sous-organisation vaut `{fr}` et ferait croire à une
  collectivité monolingue — même piège que les colonnes de charte graphique.
- Code : `src/features/languages/` — `languages.ts` (catalogue + `parseEnabledLanguages`,
  `enabledLanguagesForWrite`, `sortLanguageCodes`), `translations.ts` (`TRANSLATABLE_FIELDS`,
  `PORTAL_SECTION_FIELDS`, `USER_COMMUNICATION_FIELDS`, `parseTranslations`,
  `translationsForWrite`, `setTranslation`/`applyTranslations` — l'état qui EST le JSON —,
  `localizedField`/`localizedName`) — les deux **purs et testés**, et les trois règles n'y sont
  écrites **qu'une fois** : `parseTranslations` et `translationsForWrite` prennent un paramètre
  `known` (ce que la colonne peut porter) distinct de `fields` (ce que l'écran a le droit
  d'effacer) — les confondre ferait effacer précisément ce que `fields` protège —,
  `useOrganizationLanguages.ts`, `LanguagesSection.tsx` (testé), `TranslationFields.tsx` (**testé** :
  ce qu'il complète et ce qu'il n'écrase pas), `TranslationsDisclosure.tsx`, `TranslatedIn.tsx`,
  `useTranslateLabels.ts`. Côté démarches : `userCommunication.ts` (`*_TRANSLATABLE_FIELDS` par
  entrée) et `steps/UserCommunicationStep.tsx` (testé, dont la réponse qui retrouve sa ligne). Miroir
  côté edge function : `readLanguages` dans `public-api/_shared/serializers.ts` (testé des deux
  côtés, motif `readDocumentIds`). Traduction automatique :
  `supabase/functions/translate-labels/` — `index.ts` + `_shared/translate.ts` (pur, **testé** :
  whitelist du payload, recoupement des langues, prompt, parseur tolérant de la réponse) et
  `_shared/passthrough.test.ts` (le libellé traverse, il n'est jamais journalisé — motif `ai-api`).
- Migration : `langues_et_traductions`.
