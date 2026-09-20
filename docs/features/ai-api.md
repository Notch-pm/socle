# Feature : guichet IA (`ai-api`) — la clé du fournisseur et le décompte

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Troisième edge function, `{SUPABASE_URL}/functions/v1/ai-api/…`, `verify_jwt = false`. **Le
Socle détient la clé du fournisseur LLM, compte les jetons et refuse au-delà du plafond** ; les
applications de la gamme composent leur prompt et le lui confient (décision PO du 2026-08-29,
première consommatrice : Iris). Depuis le 2026-09-06, **le Socle en est lui-même consommateur**
(`consumer = 'socle'`, clé plateforme `SOCLE_AI_API_KEY`) pour la traduction automatique des
libellés — par `translate-labels`, jamais en appelant le fournisseur directement (voir la feature
« Langues et libellés traduits »).

**La frontière tombe là : l'application décide CE QUI EST DIT, le Socle décide SI ÇA PEUT
L'ÊTRE et CE QUE ÇA A COÛTÉ.** Le Socle ne sait pas ce qu'est une demande, un courrier ou un
dossier, et n'a pas à le savoir — il ne compose aucun prompt.

- **Pourquoi une troisième fonction** : `public-api` est contractuellement en lecture seule (sa
  garde `req.method !== "GET"` *est* son contrat) ; `contacts-api` est la surface des données
  personnelles, gardée par le scope `contacts`. Troisième domaine ⇒ troisième fonction ⇒
  troisième scope, ce qui est déjà la décision de la maison.
- **Auth** : clé `api_keys` + scope **`ai`** + **`api_keys.consumer` non nul**. L'imputation
  vient de la CLÉ, jamais du corps — sans quoi une application ferait porter sa dépense à une
  autre. Le périmètre suit `contacts-api` (`X-Organization-Id` + `resolveRootOrgId`) : le budget
  étant celui d'une **collectivité**, l'appel d'une sous-organisation débite sa racine.
- **Routes** : `POST /v1/completions` (l'appel), `GET /v1/usage?period=AAAA-MM` (plafond,
  consommation, ventilation par application), `/` et `/openapi.json` publiques.
- ⚠️ **Ce que l'appelant NE décide PAS** (400, message français) : `model` et `agent_id` — le
  Socle reste l'**autorité sur le coût**, l'appelant passe un **alias** `agent` résolu en secret ;
  `consumer` et `organization_id` (dérivés de la clé) ; `tools`/`tool_choice` (chaque outil est
  un second chemin d'accès aux données, non audité) ; `stream` (le `usage` n'arrive qu'au dernier
  événement SSE) ; `temperature` et consorts ; `role: "system"` dans `messages` — le prompt
  système a son propre champ.
- ⚠️ **PASSE-PLAT : le Socle voit le prompt, il ne le garde pas.** Ce n'est pas une déclaration
  mais une propriété **vérifiable**, par ordre de force : (1) aucune colonne du journal ne peut
  porter un contenu — un test épingle l'ensemble exact des 17 colonnes ; (2) les signatures de
  RPC ne portent que des bigints, des uuid et deux énumérés ; (3) l'appel fournisseur est isolé
  dans `_shared/provider.ts`, qui ne reçoit **ni client Supabase, ni logger** ; (4) un test **lit
  le source** pour interdire tout `console.*` mentionnant le contenu et l'URL
  `/v1/conversations`, qui stockerait le fil chez le fournisseur. La limite est écrite partout :
  la promesse porte sur la **persistance**, pas sur l'exposition.
- ⚠️ **Chaîne de délais, à ne pas inverser** : fournisseur 55 s < Socle 60 s < consommateur.
  Inversée, le consommateur abandonne des appels que le Socle termine et **facture**. Il n'y a
  pas de clé d'idempotence — elle exigerait de stocker la réponse, ce que le passe-plat interdit.
- **Réserver → appeler → solder** dans une seule fonction, sans frontière réseau au milieu :
  `reserve_ai_usage` fait UN `UPDATE` conditionnel (zéro ligne ⇒ refus **sans jamais appeler le
  fournisseur**), `settle_ai_usage` corrige avec la consommation réelle. Un échec ne consomme
  rien. Détail : [`docs/data-model.md`](../data-model.md) § « Plafond et journal d'utilisation IA ».
- ⚠️ **Sous-plafond par application** (2026-09-20) — le plafond reste **commun** à toutes les
  applications d'une collectivité (« l'application discrimine le journal, jamais le compteur »),
  et cette règle est **amendée, pas abandonnée** : une application peut porter en plus une borne
  **propre** (`ai_usage_consumer_quotas`). Née avec l'assistant du portail usagers (`nora`), ouvert
  à des visiteurs **anonymes**, qui sans elle pourrait épuiser le crédit des agents. `reserve_ai_usage`
  a désormais **trois portes** — cadence, **sous-plafond**, plafond — et **rend** la réservation du
  sous-compteur quand le plafond commun refuse ensuite. Sans sous-plafond posé, **rien ne change**
  (assertions S1). ⚠️ Pour l'appelant, le refus est le **même** `429 ai_quota_exceeded`, avec les
  chiffres du sous-plafond dans `quota` : le geste attendu est identique, et un consommateur n'a pas
  à connaître la politique commerciale d'une collectivité. ⚠️ Le journal gagne `consumer_counted`
  (booléen — le passe-plat tient, test Q9). Réglage : fiche du client › « Assistant du portail
  usagers » (`PortalAssistantBudget`), RPC `set_/delete_ai_usage_consumer_quota`, super admin seul.
  Suite SQL : `supabase/tests/plafond-ia.test.sql`, section S (11 règles) — elle se joue **à blanc**
  avec la migration, dans une transaction annulée, avant toute application.
- **Écrans** : `/superadmin/ia` (inter-clients : qui coûte quoi, qui n'est pas bordé — **lecture
  seule**), Organisations › « Assistant IA » (plafond, consommation par application, 20
  derniers appels — **le seul écran qui écrit**, par les RPC) et, dans l'app par organisation,
  **`/consommation-ia`** (`AiUsagePage`, **consultation seule** pour l'admin de la collectivité).
  Les sections d'`OrgSettingsPage` sont adressables (`?section=ia`), ce qui rend la table
  inter-clients cliquable.
- Les trois cartes (jauge, ventilation par application, derniers appels) sont **un seul
  composant**, `src/features/ai-usage/AiUsageOverview.tsx`, qui **n'écrit rien** : la commande de
  réglage lui est glissée par `action`, que seul l'écran superadmin fournit. Le client n'a donc
  aucun chemin vers l'écriture dans l'arbre rendu (**testé**), et le serveur dit la même chose —
  RLS en SELECT seul, garde `is_super_admin()` **dans** les RPC de réglage. ⚠️ Un plafond que son
  porteur pourrait lever ne serait pas un plafond : ouvrir la **lecture** (migration
  `ai_usage_lecture_admin`, `is_admin_of_self_or_ancestor`) n'ouvre pas le réglage.
- Code : `src/features/ai-usage/` — `aiQuota.ts` (pur, **testé** : jauge, formats, période),
  `useAiUsage.ts` (lecture + les deux mutations superadmin), `AiUsageOverview.tsx`,
  `AiUsagePage.tsx`, `useAdminRootOrganizations.ts` (⚠️ racines **administrées**, pas simplement
  visibles : un membre ordinaire y lirait un « 0 jeton » faux, produit par le RLS). Côté
  superadmin : `SuperAdminAiUsagePage` + `aiUsageAll.ts` (pur, testé) et
  `organizations/sections/AiUsageSection.tsx` (la part qui écrit).
- **Garde-fou de DÉBIT** (`ai_usage_rate`, 2026-08-29) — un plafond mensuel n'est pas un
  rate-limit : il dit *combien*, jamais *à quelle vitesse*, et une boucle brûlerait le mois en
  quelques minutes. `reserve_ai_usage` a donc **deux portes** : la cadence **puis** le plafond.
  Les seuils dépendent de la NATURE de l'appel — conversationnel 20/minute par agent (120 sans
  agent), lot d'OCR 60 (360) : un humain qui lit 150 mots entre deux questions n'a pas le
  rythme d'une machine qui enchaîne des documents. Les deux natures ont des compteurs
  **SÉPARÉS** (`bucket` dans la clé) : sans quoi un lot de courrier mangerait le budget de
  questions du même agent. La nature vient de `p_resource_type`, **dérivé côté serveur** —
  un appelant ne peut pas se déclarer « lot ». Type inconnu ⇒ seuil conversationnel, le plus
  strict. Refus = `429 ai_rate_limited`
  + `Retry-After` — distinct du plafond, parce que le crédit est intact et que le geste attendu
  est d'attendre, pas de demander un relèvement.
  ⚠️ **Le compteur retient les TENTATIVES, refus de plafond compris** : sans cela, une boucle
  déjà refusée pour crédit épuisé ne serait jamais coupée — c'est-à-dire précisément dans le cas
  où le garde-fou sert. C'est aussi ce qui permet de le vérifier **sans dépenser un jeton**.
  ⚠️ La porte de cadence passe **avant** celle du plafond : elle doit couvrir les collectivités
  **sans plafond**, qui sortent par un `return` anticipé.
  ⚠️ Le seuil **n'est pas réglable** (décision PO) : un garde-fou de sécurité n'est pas un
  paramètre commercial, et le rendre négociable, c'est le voir négocié le jour où il gêne — or
  il ne gêne que les boucles.
