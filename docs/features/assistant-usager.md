# Feature : assistant du portail usagers — l'interrupteur, et ce que le Socle n'en sait pas

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Le site de démarches (Nora) peut proposer un **assistant conversationnel** : il renseigne l'usager,
l'oriente vers la bonne démarche et, si la collectivité l'a ouvert, recueille dans la conversation
les réponses du formulaire — l'usager relit et envoie lui-même. Décision PO du 2026-09-20 ; plan
d'ensemble (lots, sécurité, coût) hors dépôt, résumé en fin de fiche.

**La frontière est celle du guichet IA, inchangée : Nora décide CE QUI EST DIT, le Socle décide SI
ÇA PEUT L'ÊTRE et CE QUE ÇA A COÛTÉ.** Le Socle ne compose aucun prompt et ne voit aucune
conversation. Sa part tient en trois choses : **l'interrupteur**, **le corpus** (déjà servi), **le
crédit** (déjà compté).

- **L'interrupteur** : table `portal_assistant_settings`, une ligne par racine — `enabled`
  (renseigner, orienter), `deposit_enabled` (recueillir un formulaire) et `voice_enabled`
  (2026-10-09 : le **mode dialogue** — l'assistant prononce ses réponses, l'usager répond de vive
  voix). Aucune ligne = fermé.
  Détail : [`docs/data-model.md`](../data-model.md) § « `portal_assistant_settings` ».
- ⚠️ **Écriture réservée au super admin** (RLS `is_super_admin()`, motif
  `organization_applications`), écran **Organisations › « Assistant du portail usagers »**
  (`?section=assistant-portail`). Un assistant public dépense le crédit IA que les agents de la
  collectivité partagent (Iris, Clara) : l'ouvrir est une décision de mise en service, prise avec
  le plafond — la section y renvoie. La collectivité **lit** le réglage (`has_org_access`), elle ne
  l'écrit pas.
- ⚠️ **Ni dans `portal_themes`, ni sur `organizations`.** Le thème attend « Publier » — un
  interrupteur qu'on doit pouvoir couper, non ; l'effet est **immédiat** (borné par le cache de
  60 s du portail). Et une colonne d'`organizations` serait à la portée de l'admin d'organisation.
- ⚠️ **Le réglage gouverne l'usage, pas la donnée** (motif `email_sender_name`) : couper `enabled`
  **conserve** `deposit_enabled` et `voice_enabled`. C'est la **frontière** qui l'applique —
  `readPortalAssistant` (`public-api/_shared/serializers.ts`) ne les sert `true` que sous un assistant
  ouvert. Un consommateur lit donc chaque booléen tel quel (motif `declaration_link`).
- **Servi** dans `GET /v1/portal/tenant` → `assistant` (contrat **1.28.0**), héritage résolu par
  la RPC `resolve_portal_assistant` (service role seul). ⚠️ **Toujours présent, jamais `null`** ;
  lecture en échec ou forme inattendue ⇒ **fermé** : au doute, on ne dépense pas le crédit d'une
  collectivité. ⚠️ `TenantDto` est lu par tout visiteur : **trois booléens, rien d'autre** — ni
  prompt, ni alias d'agent, ni plafond (tests sur le sérialiseur et sur l'OpenAPI).
- ⚠️ **Le corpus est ce que `/v1/portal/*` sert déjà, et rien d'autre** : `user_description`,
  `user_communication`, `form_schema`, `requester_config`, page et contenus publiés, et — depuis
  le 2026-09-24 — les **informations usagers des organismes** (descriptif, **horaires
  d'accueil**, FAQ : `GET /v1/portal/organizations`, onglet « Informations usagers »), avec le
  **téléphone et le courriel** de la fiche de chaque organisme (1.31.0). C'est là
  qu'une collectivité écrit ce que l'assistant doit savoir d'elle-même ; ⚠️ le champ « accueil
  physique » des recommandations aux agents, lui, n'y entre jamais (incident du 2026-09-24 :
  l'assistant disait ne pas connaître des horaires qui n'étaient écrits que là).
  `knowledge_base`, `agent_description`, les recommandations aux agents et les **attributions**
  des organismes (`GET /v1/organizations/attributions`, internes) **ne doivent jamais**
  entrer dans le prompt de l'assistant — la clé `read` de Nora peut techniquement lire
  `GET /v1/procedures/{id}`, qui les sert : c'est à Nora de ne composer qu'à partir des routes
  portail, et un test l'y épingle.
- ⚠️ **La voix est un interrupteur à part** (contrat **1.37.0**), et non un effet de
  l'ouverture : elle coûte davantage que le texte (chaque tour est aussi transcrit et prononcé —
  **≈ 1,5 fois un tour écrit**, mesuré le 2026-10-09 : 4 740 + 2 090 + 475 jetons ; l'estimation
  « ≈ 5 fois » du plan supposait des réponses de 350 caractères) et fait traiter la **voix de l'usager** par le
  fournisseur (AIPD et DPA à vérifier avant ouverture au public). Elle ne dépend pas du recueil :
  on peut parler à un assistant qui ne fait que renseigner. L'écran avertit du coût dès qu'elle
  est ouverte. La transcription et la synthèse passent par `ai-api` (`/v1/transcriptions`,
  `/v1/speech` — voir [`ai-api.md`](ai-api.md)) ; seuls le **français et l'anglais** se
  prononcent, les autres langues restent en texte — c'est au portail de le savoir, pas au booléen.
- ⚠️ **Conformité de la voix, à régler AVANT toute ouverture au public** (relevé du 2026-10-09,
  à confirmer sur le DPA signé — ce ne sont pas des avis juridiques) :
  - **Conservation chez le fournisseur.** Sans option, Mistral garderait les entrées et sorties
    de l'API **30 jours** pour la lutte contre les abus (sources tierces — sa page officielle ne
    chiffre pas le défaut). La **conservation nulle** (« zero data retention ») s'obtient sur
    demande motivée, plans payants, et couvre `/v1/audio/transcriptions`, `/v1/audio/speech` et
    `/v1/chat/completions` — ⚠️ **pas les agents** (`/v1/agents/completions`). Or l'assistant passe
    par l'agent `assistant-usager` quand `MISTRAL_AGENT_ASSISTANT_USAGER` est posé. Pour couvrir
    TOUT le fil, il faudrait retirer ce secret : `ai-api` retombe alors sur `chat/completions`
    (modèle par défaut, température 0,2), et le prompt de Nora porte déjà `BASE_RULES` en entier
    — on perd seulement le pilotage du modèle depuis la console.
  - **Ce qu'on dit à l'usager** : « ni la collectivité ni ce site n'enregistrent » sa voix — vrai
    chez nous, et rien de plus. Ne jamais écrire « rien n'est enregistré » tant que la
    conservation nulle n'est pas acquise (texte corrigé le 2026-10-09, Nora et Socle).
  - **AIPD** : la voix est une donnée personnelle (pas biométrique : aucune identification) ;
    finalité (déposer ou se renseigner à la voix), base légale de la collectivité, sous-traitant
    (Mistral, UE), durée (aucune chez Edilumen ; 30 jours ou zéro chez Mistral), information
    (mention sous le bouton, permanente pendant le dialogue), et le droit de ne pas l'utiliser
    (le texte reste toujours possible).
  - **DPA Mistral** : vérifier qu'il couvre l'audio, la localisation UE et la liste des
    sous-traitants ultérieurs.
- **Le crédit** : Nora appelle `ai-api` avec une **clé dédiée** (scope `ai` seul, application
  `nora` — précédent `SOCLE_AI_API_KEY`), alias d'agent **`assistant-usager`** →
  secret `MISTRAL_AGENT_ASSISTANT_USAGER` (voir [`docs/operations.md`](../operations.md) ; absent,
  repli sur le modèle par défaut). `actor_id` = identifiant de **conversation**, jamais un haché
  d'IP (il est persisté au journal). La consommation se lit par application sur `/consommation-ia`.
- ⚠️ **Avant toute ouverture au public : réserver une part à l'assistant.** Le plafond mensuel est
  commun à toutes les applications d'une collectivité ; sans part propre, l'assistant — ouvert à
  des visiteurs anonymes — peut affamer les agents. La **part réservée** (livrée le 2026-09-20,
  **partage du plafond** le 2026-09-22 : en jetons ou en pourcentage vivant, les agents disposent du
  reste et y sont bornés — voir [`ai-api.md`](ai-api.md)) se **règle dans la section « Assistant
  IA »** (bouton « Répartir », avec le plafond qu'elle partage — le seul écran qui écrit) et se
  **montre dans cette section**, à côté de l'interrupteur (`PortalAssistantBudget`, résumé en
  lecture seule + lien « Régler la part ») : on ne devrait pas pouvoir ouvrir l'un sans voir
  l'autre. L'écran **avertit** quand l'assistant est ouvert sans part, ou quand la part est sans
  effet (pourcentage sans plafond) ; il ne l'interdit pas — une collectivité de démonstration peut
  s'en passer. Lever la part en **conserve** valeur et mode. Repère : une conversation ≈ 25 000
  jetons (mesuré : ≈ 3 250 par appel).
- ⚠️ **`assistant` est un slug d'organisation RÉSERVÉ** (contrainte `organizations_slug_url_form`,
  miroir `SLUG_RESERVED` dans `organizationSlug.ts`) : Nora sert l'assistant à `/assistant`, et
  `/<slug>` y ouvre la page d'un organisme. Toute nouvelle adresse de premier niveau chez Nora se
  réserve ici **avant** d'être servie là-bas.
- Code : `src/features/superadmin/organizations/usePortalAssistant.ts`,
  `sections/PortalAssistantSection.tsx` et `sections/PortalAssistantBudget.tsx` (+ tests), la part
  dans `src/features/ai-usage/useAiUsage.ts` (`shares`, `split`, `useSetAiShare`) et
  `sections/AiShareDialog.tsx`, migrations `portal_assistant_settings`,
  `ai_usage_sous_plafond_par_application` et `ai_usage_partage_du_plafond`.

**Plan d'ensemble** (2026-09-20) — lot 0 : moteur de formulaire de Nora partagé avec son serveur ;
lot 1 : renseigner et orienter (cette fiche + route `POST /v1/assistant` de Nora) ; lot 2 : collecte
et dépôt par le chemin existant, identité et pièces en **cartes hors LLM**, frein anti-robot par
preuve de travail auto-hébergée ; lot 3 : sous-plafond par application ; lot 4 : langues et
compteurs anonymes via `audience-api`. Corpus **strict** : sans texte de la collectivité,
l'assistant dit qu'il ne sait pas. Hors périmètre : le suivi par référence (projet Iris).
