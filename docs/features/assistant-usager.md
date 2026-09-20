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
  (renseigner, orienter) et `deposit_enabled` (recueillir un formulaire). Aucune ligne = fermé.
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
  **conserve** `deposit_enabled`. C'est la **frontière** qui l'applique — `readPortalAssistant`
  (`public-api/_shared/serializers.ts`) ne sert `deposit_enabled: true` que sous un assistant
  ouvert. Un consommateur lit donc chaque booléen tel quel (motif `declaration_link`).
- **Servi** dans `GET /v1/portal/tenant` → `assistant` (contrat **1.28.0**), héritage résolu par
  la RPC `resolve_portal_assistant` (service role seul). ⚠️ **Toujours présent, jamais `null`** ;
  lecture en échec ou forme inattendue ⇒ **fermé** : au doute, on ne dépense pas le crédit d'une
  collectivité. ⚠️ `TenantDto` est lu par tout visiteur : **deux booléens, rien d'autre** — ni
  prompt, ni alias d'agent, ni plafond (tests sur le sérialiseur et sur l'OpenAPI).
- ⚠️ **Le corpus est ce que `/v1/portal/*` sert déjà, et rien d'autre** : `user_description`,
  `user_communication`, `form_schema`, `requester_config`, page et contenus publiés.
  `knowledge_base`, `agent_description` et les recommandations aux agents **ne doivent jamais**
  entrer dans le prompt de l'assistant — la clé `read` de Nora peut techniquement lire
  `GET /v1/procedures/{id}`, qui les sert : c'est à Nora de ne composer qu'à partir des routes
  portail, et un test l'y épingle.
- **Le crédit** : Nora appelle `ai-api` avec une **clé dédiée** (scope `ai` seul, application
  `nora` — précédent `SOCLE_AI_API_KEY`), alias d'agent **`assistant-usager`** →
  secret `MISTRAL_AGENT_ASSISTANT_USAGER` (voir [`docs/operations.md`](../operations.md) ; absent,
  repli sur le modèle par défaut). `actor_id` = identifiant de **conversation**, jamais un haché
  d'IP (il est persisté au journal). La consommation se lit par application sur `/consommation-ia`.
- ⚠️ **Avant toute ouverture au public : un sous-plafond par application.** Le plafond mensuel est
  commun à toutes les applications d'une collectivité ; sans sous-plafond, l'assistant public peut
  affamer les agents. **Pas encore livré** — tant qu'il ne l'est pas, n'ouvrir l'assistant que sur
  des environnements de démonstration.
- Code : `src/features/superadmin/organizations/usePortalAssistant.ts`,
  `sections/PortalAssistantSection.tsx` (+ test), migration `portal_assistant_settings`.

**Plan d'ensemble** (2026-09-20) — lot 0 : moteur de formulaire de Nora partagé avec son serveur ;
lot 1 : renseigner et orienter (cette fiche + route `POST /v1/assistant` de Nora) ; lot 2 : collecte
et dépôt par le chemin existant, identité et pièces en **cartes hors LLM**, frein anti-robot par
preuve de travail auto-hébergée ; lot 3 : sous-plafond par application ; lot 4 : langues et
compteurs anonymes via `audience-api`. Corpus **strict** : sans texte de la collectivité,
l'assistant dit qu'il ne sait pas. Hors périmètre : le suivi par référence (projet Iris).
