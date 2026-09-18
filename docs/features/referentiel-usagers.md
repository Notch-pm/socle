# Feature : référentiel des usagers (`contacts`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Référentiel **partagé par toute la gamme** (Ariane, Clara, Iris, portail citoyen), **multi-tenant
strict** : un contact est rattaché à une **organisation principale (racine)** — trigger
`enforce_contact_root_org` (motif habituel) ; les sous-organisations partagent le même référentiel.
⚠️ **Écriture uniquement via l'API dédiée `contacts-api`** (voir feature ci-dessous) :
**aucune policy RLS d'écriture** côté client sur les fiches ; pas d'UI Socle pour l'instant.

- **`contacts`** (une seule table pour les 4 types) : `contact_type`
  (`personne`/`entreprise`/`association`/`administration`), identité personne (`civility`
  madame/monsieur, `first_name`, `last_name`, `usage_name` nom d'usage, `birth_date`), structure
  (`legal_name`, `siret` 14 chiffres), coordonnées (`email`, `mobile_phone`, `landline_phone`),
  adresse à plat (`address_line1/2`, `postal_code`, `city`, `country` défaut France),
  `preferred_channel` (`email`/`telephone`/`courrier`), `consent_email`/`consent_sms`,
  `internal_notes` (**agents uniquement — à exclure de toute sérialisation publique**), `status`
  (`active`/`archived`, réversible), `display_name` **colonne générée** (nom d'usage/nom + prénom,
  ou raison sociale). **Invariants par type via CHECK** : civilité obligatoire ⟺ personne ;
  raison sociale obligatoire ⟺ structure ; SIRET et champs personne interdits sur le type opposé.
  **Unicité** : SIRET unique par org (index partiel) ; **pas de contrainte dure** sur l'identité
  pivot des personnes (homonymes réels — l'app avertira, choix validé).
- **`contact_roles`** : catalogue de rôles **par racine** (motif `document_types`), nom unique par
  org insensible à la casse. **Seed** : 8 rôles d'exemple insérés pour les racines existantes
  (Habitant, Représentant d'entreprise, Président d'association, Élu, Agent, Propriétaire,
  Demandeur, Bénéficiaire). Seule table du référentiel **modifiable côté client** (admins d'org).
- **`contact_role_assignments`** : n-n contact↔rôle, unique `(contact_id, role_id)`, trigger
  `enforce_contact_role_same_org` (contact et rôle de la même racine).
- **`contact_external_references`** : identifiants tiers (`source` libre : `portail_citoyen`,
  `logiciel_population`…). `organization_id` **dénormalisée par trigger**
  (`sync_contact_external_ref_org`) pour porter l'unicité `(org, source, external_id)` ; unique
  aussi `(contact_id, source)`.
- **`contact_relations`** : relations **dirigées** contact→contact (« X est *rôle* de Y »),
  typées par un rôle du catalogue : `contact_id`, `related_contact_id`, `role_id` (FK
  `contact_roles` **sans ON DELETE** — un rôle utilisé dans une relation bloque sa suppression),
  unique `(contact_id, related_contact_id, role_id)`, CHECK anti-auto-relation. Trigger
  `sync_contact_relation_org` (SECURITY DEFINER) : dénormalise `organization_id` depuis le
  contact porteur, impose la même racine (deux contacts + rôle) et **interdit de cibler une
  personne physique** (cible = entreprise/association/administration uniquement). RLS : SELECT
  `has_org_access` ; écriture via `contacts-api` seulement (payload `relations`, remplacement
  d'ensemble) ; la fiche expose `relations` (sortantes) et `reverse_relations` (entrantes).
- **RLS** : SELECT `has_org_access(organization_id)` partout (assignments via `EXISTS` sur le
  contact) ; écriture seulement `contact_roles` (`is_org_admin`). Les 4 fonctions trigger sont
  `SECURITY DEFINER` avec **`EXECUTE` révoqué** de `anon`/`authenticated` (advisor).
  **Étanchéité inter-tenants vérifiée de bout en bout** (2026-07-15) : test SQL simulant deux
  racines + `auth.uid()` de chaque tenant + anonyme — visibilité croisée nulle, écritures client
  refusées, unicité des refs externes bien scopée par org (transaction de test annulée).
  Nuance : `has_org_access` exige l'appartenance à la **racine** — un membre d'une sous-org ne
  voit aucun contact (comme `categories`).
- Volontairement exclus (validé) : alias, historique, documents, workflow, dédoublonnage/fusion
  automatique, données sensibles (NIR, CNI, IBAN), modèle d'adresses complexe.
- Migrations : `contacts_referentiel_usagers`, `contacts_trigger_functions_revoke_execute`.
