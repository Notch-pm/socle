# Journal des évolutions des API publiques

> **Public** : équipes consommatrices (Ariane, Clara, Iris, partenaires) · **Question traitée** :
> quand un contrat d'API a-t-il changé, et comment ? · **Dernière mise à jour** : 2026-08-29

Journal **append-only** : chaque évolution de la surface de contrat des API publiques
(`public-api`, `contacts-api`, `ai-api`) — endpoint, paramètre, champ de réponse, comportement
d'authentification — ajoute une entrée datée en tête de liste. Une entrée n'est jamais réécrite ;
une correction s'ajoute sous une nouvelle date. Politique de compatibilité et obligations
consommateur : [integration.md](./integration.md#politique-de-compatibilité-v1).

Format d'une entrée : `## AAAA-MM-JJ — <api> — ajout|correctif|rupture`

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
et le refus n'arriverait qu'une fois l'argent dépensé. `POST /v1/completions` refuse désormais
au-delà de **20 appels par minute et par agent** (`actor_id`) — ou 120 par minute pour une
application qui n'identifie aucun agent.

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
