# Feature : API usagers (lecture/écriture) — `contacts-api`

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Edge Function Deno **séparée de `public-api`** (qui reste contractuellement en lecture seule),
servie sous `{SUPABASE_URL}/functions/v1/contacts-api/…`, déployée `verify_jwt = false` (l'auth
est portée par la fonction). Permet de **consulter, créer, modifier, archiver** un usager —
**aucune suppression** (pas de DELETE, méthode → 405).

- **Auth = clé `api_keys`** (Bearer, SHA-256) comme `public-api`, **mais scope `contacts` requis**
  (colonne `scopes` ; les clés `read` → 403 : les usagers sont des données personnelles).
  Depuis le 2026-08-12, `public-api` vérifie symétriquement le scope `read` — l'asymétrie
  historique (toute clé valide lisait le référentiel) est corrigée et déployée. Les
  scopes se choisissent à la création de clé (`ApiKeyFormDialog`, switches « Référentiel
  (lecture) » / « Usagers (lecture + écriture) ») et s'affichent en badges (`ApiKeysSection`).
- **Isolation** : service role (hors RLS) mais chaque requête bornée à une organisation **racine**
  (les contacts y sont rattachés) — égalité stricte, pas de sous-arbre. Clé liée :
  `organization_id = organisation de la clé`. Clé **plateforme** : la racine servie est celle de
  l'organisation portée par l'en-tête **`X-Organization-Id`** (requis, 400 sinon ;
  `resolveRootOrgId` remonte les `parent_id`, protégé des cycles). **Vérifiée bout en bout** (2026-07-15, 32 assertions :
  cross-tenant 404/liste vide, 401/403, conflits 409, invariants 400, archive/restore, données de
  test nettoyées).
- **Endpoints** (préfixe `/v1`) : `contacts` GET (filtres `type`, `status`, `search` sur
  `display_name`, `email` exact, `phone` — égalité sur chiffres significatifs, mobile ET fixe,
  `quartier_id` — UUID ou littéral `null` pour les sans-quartier,
  lookup `source`+`external_id`, pagination `limit`/`offset` max 500) + POST ·
  `contacts/match` POST (rapprochement d'identités, voir ci-dessous) ·
  `contacts/{id}` GET + PATCH (partiel ; `contact_type` immuable ; `status` refusé) ·
  `contacts/{id}/archive` et `/restore` POST (obsolescence réversible, idempotent) ·
  `contact-roles` GET (catalogue → `role_ids`). Racine `/` + `openapi.json` publics.
- **Rapprochement d'identités (détection de doublons)** : `POST /v1/contacts/match` — **lecture
  seule** malgré le POST (identité trop riche pour une query string). Requête = identité
  partielle (tous champs optionnels, au moins un critère ; un prénom seul ne suffit pas) ;
  réponse = candidats classés `[{contact, score, reasons}]`, `contact` = **même sérialiseur**
  que la liste. Motifs : `email`/`phone`/`siret` (égalités normalisées), `name_exact` /
  `name_similar` (normalisation sans accents/casse/ponctuation ; similarité **pg_trgm ≥ 0.5**
  sur le nom complet + **garde-fou prénom ≥ 0.1** quand les deux prénoms sont connus — un
  homonyme de nom de famille seul, « Marie Dupont » pour « Jean Dupont », n'est **pas** proposé ;
  noms de naissance ET d'usage comparés des deux côtés), `birth_date` (renfort, jamais suffisant
  seul). Score (classement uniquement, documenté OpenAPI) : email +100 · phone +80 · siret +120 ·
  name_exact +60 · name_similar +arrondi(40×sim) · birth_date +20. Archivées exclues par défaut
  (`status: null` = tous). Le rapprochement vit dans la **RPC `match_contacts`** (SECURITY
  INVOKER, `EXECUTE` réservé à service_role — motif `org_subtree_ids`), bornée à l'org de la clé.
  Support (tient à 10⁵ contacts) : extensions `pg_trgm` + `unaccent` (schéma `extensions`),
  colonnes **générées** `mobile_phone_normalized`/`landline_phone_normalized` (fonction
  `normalize_phone` : chiffres seuls, +33/0033 et 0 initial retirés — mêmes règles que
  `normalizePhoneNumber` TS, miroir testé) + index b-tree partiels, index **GIN trigram** sur
  `match_full_name(last_name|usage_name, first_name)` et `normalize_name(legal_name)`
  (`immutable_unaccent` fige le dictionnaire pour l'indexabilité). Migrations :
  `match_extensions_pg_trgm_unaccent`, `contacts_match_identites`. **Vérifié bout en bout**
  (2026-07-17) : les 10 critères d'acceptation Clara + sérialiseur identique, filtre `phone`,
  400/405, OpenAPI — données de test nettoyées.
- **Géocodage & quartier** : quand l'adresse change (`address_line1`/`postal_code`/`city`)
  sans coordonnées fournies, l'API **géocode côté serveur** via la BAN (Géoplateforme IGN,
  `_shared/geocoding.ts` pur/testé + `fetch` best-effort 5 s dans `index.ts` : échec → coordonnées
  nulles, jamais d'erreur d'écriture ; score < 0.4 rejeté). Un consommateur peut fournir
  `address_lat`/`address_lon` directement (paire exigée sur l'état fusionné). `quartier_id`
  dans le payload = rattachement **manuel** (`quartier_auto` passe à false, vérif d'appartenance
  à l'org → 400) ; `quartier_id: null` = retour à l'**auto** (recalcul immédiat par le trigger).
  La fiche expose `address_lat`, `address_lon`, `quartier_id`, `quartier_auto`, plus (2026-07-18)
  l'objet **`quartier`** (`id`, `name`, `color`) — le quartier **résolu**, pour que le consommateur
  l'affiche sans second appel (`GET /v1/quartiers` porte les géométries : hors de proportion pour
  un libellé). Il vient d'un embed PostgREST `quartier:quartiers(id, name, color)` centralisé dans
  la constante **`CONTACT_SELECT`** : ⚠️ toute nouvelle requête dont le résultat part dans
  `serializeContact` doit l'utiliser — un `select("*")` laisserait `quartier` à `null` sans erreur.
  (Le `select("*")` du PATCH est volontairement resté nu : il sert au merge, pas à la sérialisation.)
- **Payloads** : whitelist stricte des clés (clé inconnue → 400), chaînes normalisées (trim,
  `""`→`null`), invariants par type vérifiés sur l'**état fusionné** au PATCH (messages français ;
  les CHECK DB restent le garde-fou). `role_ids` / `external_references` / `relations` fournis
  **remplacent** l'ensemble (omis = intouchés ; remplacement par différence/upsert, pas de
  delete-all). Relations : pas d'auto-relation, cible jamais une personne physique. Création :
  compensation (delete) si rôles/refs/relations échouent après l'insert. Erreurs `{error:{code,message}}`
  + **409 `conflict`** (SIRET dupliqué, réf externe prise — mappage des contraintes 23505).
- ⚠️ `internal_notes` **est exposée** (API serveur-à-serveur pour les apps agents) : un
  consommateur servant des usagers finaux ne doit jamais la retransmettre — documenté dans l'OpenAPI.
- **Docs** : `/api-doc-usagers` (route publique, `ApiDocsPage api="contacts-api"` — Redoc pointé
  sur `…/contacts-api/openapi.json`) ; liens depuis la section « APIs de la gamme » de
  `OrgSettingsPage`.
- Code : `supabase/functions/contacts-api/` — `index.ts` + `_shared/{dto,errors,validation,
  serializers,openapi}.ts` (logique pure **testée** par vitest, sans dépendance Deno, déployée avec
  la fonction). Le déploiement (`deploy_edge_function`) doit inclure `index.ts` + tout `_shared/*.ts`.
