# Feature : tableau de bord et fréquentation du site (`audience-api`, `portal_audience_*`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

L'accueil de l'app par organisation (`/`, `src/features/dashboard/DashboardPage.tsx`). Deux blocs,
et **l'ordre n'est pas indifférent** : d'abord ce que la collectivité a **paramétré** (démarches,
usagers, activations par organisme) — le Socle est un référentiel —, ensuite ce que son site
**produit** (fréquentation), qui vient d'ailleurs et n'existe qu'une fois Nora déployé.

## La mesure : des compteurs, et rien d'autre

Nora tourne dans le navigateur de l'usager et **n'a pas de base de données**. Le Socle détient déjà
le domaine, le catalogue et la page publiée : c'est ici que la fréquentation se compte.

- ⚠️ **AUCUNE DONNÉE PERSONNELLE, ET C'EST CE QUI DISPENSE D'UN BANDEAU DE CONSENTEMENT**
  (article 82 de la loi Informatique et Libertés). Rien n'est écrit sur le poste du visiteur — ni
  cookie, ni `localStorage`. Les trois données qui pourraient désigner quelqu'un ne franchissent
  jamais `portal-api` : l'**adresse IP** n'y vit que hachée en mémoire, pour le frein anti-abus ;
  le **User-Agent** y est lu pour en tirer un mot parmi trois, puis jeté ; le **référent** n'est lu
  que par le navigateur, qui en tire un oui/non.
  ⚠️ La promesse est **vérifiable, pas déclarative**, par quatre mécanismes du plus fort au plus
  faible (motif du passe-plat de l'`ai-api`) : (1) `supabase/tests/audience.test.sql` fige la
  **liste exacte des colonnes** des deux tables — ajouter `visitor_id` fait tomber le test ; (2)
  les signatures de RPC ne portent que des uuid, trois énumérés et un booléen ; (3) la whitelist du
  corps refuse toute clé inconnue par un **400** ; (4) `audience-api/_shared/privacy.test.ts` lit le
  source et interdit qu'on lise jamais `user-agent`, `referer` ou une IP.
- ⚠️ **UNE VISITE = UNE ARRIVÉE SUR LE SITE** (décision PO) : la première page d'une navigation,
  quand le référent n'est pas le site lui-même et que ce n'est pas un rechargement. Pas de
  « visiteurs uniques » — sans identifiant, la notion n'a pas de sens. Quelqu'un qui revient trois
  fois compte trois visites. C'est **le navigateur** qui tranche ; le serveur incrémente ce qu'on
  lui dit.
- ⚠️ **Le jour vient TOUJOURS du serveur**, en heure de Paris : une horloge de navigateur décalée
  ferait atterrir des vues dans un futur qu'aucune période n'affiche. Aucune date ne traverse le
  corps, et tout le front se cale sur le même fuseau (`parisDay`, `periodRange`) — borner la
  période dans le fuseau du navigateur ferait manquer le dernier jour à un agent aux Antilles.
- **Tables** : `portal_audience_pages` (organisme du domaine, jour, page `accueil`/`demarche`/
  `formulaire`, démarche, `views`/`visits`/`deposits`) et `portal_audience_breakdown` (dimension
  `langue`/`appareil`). ⚠️ `procedure_id` est **sans clé étrangère** : une démarche supprimée garde
  son historique, et l'écran la libelle « Démarche supprimée » plutôt que d'afficher un uuid nu
  (motif `resolveDocuments`). ⚠️ `unique nulls not distinct` sur la clé des pages : sans lui, chaque
  vue de l'accueil créerait une ligne, deux NULL ne se rapprochant jamais.
  ⚠️ **RLS activé SANS AUCUNE POLICY** : seules les RPC entrent. Une policy de lecture, même large,
  ferait du découpage de ces tables un contrat public, alors qu'il doit rester libre.
- **Écriture** : `record_portal_page_view` / `record_portal_deposit`, EXECUTE réservé au
  **service role** (motif `org_subtree_ids`) — appelables par `authenticated`, n'importe quel
  compte fabriquerait des chiffres. Elles **renvoient `false` sans lever** quand la démarche
  n'appartient pas au tenant : un compteur ne fait jamais échouer une page.
- **Lecture** : `organization_dashboard(racine)` et `portal_audience(racine, du, au)`, **`jsonb` et
  non `returns table`** (motif `root_onboarding_status` : une clé s'ajoute sans `drop function`).
  ⚠️ `SECURITY DEFINER` gardées par `has_org_access(racine)`, et c'est délibéré : sous RLS, un
  membre ordinaire ne voit pas les sous-organisations et lirait des totaux **partiels** — un
  tableau de bord qui ment est pire qu'un tableau de bord absent. Choix assumé : les noms des
  sous-organisations et leur nombre d'activations deviennent visibles de tout membre direct de la
  racine (ils sont déjà publics sur le portail). Période bornée à **400 jours**.

## `audience-api` — la quatrième edge function

`{SUPABASE_URL}/functions/v1/audience-api/…`, `verify_jwt = false`, scope **`audience`** (le
cinquième). `POST /v1/page-views` et `POST /v1/deposits`, **202**. Contrat 1.0.0.

- ⚠️ **ÉCRITURE SEULE, ET CE N'EST PAS UN OUBLI** : pas un seul `GET` dans l'OpenAPI (le test
  l'épingle). La clé de Nora vit dans une edge function qui sert des pages publiques ; lui donner
  de quoi LIRE ferait d'une clé volée un moyen de connaître le trafic de toutes ses collectivités.
- ⚠️ **AUCUN FREIN DE CADENCE dans le Socle**, contrairement à `ai-api` : le freiner utilement
  demanderait l'adresse IP du visiteur, précisément ce que le Socle ne doit jamais voir. Le frein
  vit chez `portal-api` (120/min par IP hachée), au plus près de l'adresse. D'où l'absence de `429`.
- ⚠️ Le `tenant_id` vient du **CORPS** (l'appelant est un relais multi-collectivités, le tenant est
  une propriété de l'ÉVÉNEMENT), là où `ai-api` le lit dans `X-Organization-Id`. C'est pour cela
  qu'il est recoupé avec le périmètre de la clé sans exception ; hors périmètre ⇒ **404**.
- ⚠️ **Pas de `resolveRootOrgId` ici**, contrairement à `contacts-api`/`ai-api` : la fréquentation
  se compte sur l'organisme **du domaine** — une sous-organisation qui tient son guichet a son
  propre trafic. Remonter à la racine confondrait les guichets.

## Côté Nora (dépôt `Notch-pm/Nora`)

Beacon `POST /v1/audience` de `portal-api` en **`text/plain`** — une requête « simple » au sens du
CORS, donc **un seul appel réseau par page vue**, sans `OPTIONS` préalable. ⚠️ Réponse **toujours
204**, y compris domaine inconnu : le navigateur ne doit rien pouvoir déduire. ⚠️ Sans
`SOCLE_AUDIENCE_API_URL`, le portail **ne compte rien** — la mesure est un choix explicite, et un
environnement de développement ne pollue pas les chiffres d'une production. ⚠️ Rien n'est mesuré en
dev ni sous `navigator.webdriver`. Le dépôt est signalé **après** l'acceptation par Iris. Détail et
pièges : README de Nora, « Mesure d'audience sans cookie ».

## L'écran

- Cinq tuiles (démarches, usagers, personnes, entreprises, associations), barres « Démarches
  activées par organisme », puis la fréquentation : trois tuiles, aire « Visites et pages vues »,
  « Pages les plus vues », camemberts « Langues » et « Appareils ».
  ⚠️ Le camembert des **langues** ne s'affiche que si la collectivité en a plusieurs — même règle
  que le filtre par organisme du portail : un découpage à une seule part n'en est pas un.
  ⚠️ `activationRows` **écarte les organismes sans activation** (une barre à zéro n'apprend rien),
  mais **garde les services internes sous leur propre nom** : c'est un écran d'agent, pas le
  portail — ce qui s'efface derrière son porteur, ce sont les démarches vues par un usager.
- ⚠️ **`depositRate` rend « — », jamais « 0 % », quand aucun formulaire n'a été ouvert** : un taux
  sans dénominateur n'est pas nul, il n'existe pas. Il n'est pas non plus **borné à 100 %** — un
  usager qui ouvre le formulaire un jour et dépose le lendemain met sa vue d'un côté de la période
  et son dépôt de l'autre ; borner masquerait le décalage.
- ⚠️ **Les jours sans données sont complétés par des zéros** (`seriesFor`) : la RPC ne les renvoie
  pas, et un graphique qui les saute relierait le 3 au 9 comme s'ils se suivaient. Sur un an, on
  regroupe **par mois** — 365 points ne se lisent pas.
- ⚠️ **La fréquentation vide est l'ÉTAT NORMAL** tant que Nora ne mesure pas : l'écran le dit,
  il ne masque pas la section — masquer ferait chercher un réglage qui n'existe pas.
- ⚠️ Un membre rattaché **seulement à des sous-organisations** n'a aucune racine visible : l'écran
  l'explique au lieu d'afficher des zéros, qui passeraient pour la réalité.
- **Graphiques ApexCharts**, `apexcharts@3.54.1` + `react-apexcharts@1.5.0` **épinglés** (le
  wrapper 1.5.0 est le dernier compatible ApexCharts 3 ; ne pas monter en v4 sans le changer).
  `charts/{ReactApexChart,chartConfig,ChartCard}` sont des **copies d'Iris**, maintenues à
  l'identique dans chaque dépôt (motif `suiteApps.ts`) — seule divergence assumée : `FONT_FAMILY`
  passe à Inter, la police du Socle. `DashboardCharts` est chargé en `React.lazy` : ApexCharts pèse
  ~130 Ko, et les tuiles de chiffres ne doivent pas l'attendre.
- Code : `src/features/dashboard/` — `dashboardStats.ts`, `audience.ts` (purs, **testés** :
  lecteurs tolérants, remplissage des jours, taux de dépôt), `useDashboard.ts`, `KpiCard.tsx`,
  `DashboardCharts.tsx`, `DashboardPage.tsx` (**testé**, graphiques doublés — jsdom ne dessine
  rien). Migration `portal_audience` ; changelog du 2026-09-12.
