# Feature : types de pièce justificative (`document_types`)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Catalogue des types de pièce justificative, **multi-tenant strict** comme les démarches : chaque
type est rattaché à une **organisation principale (racine)** — imposé par le trigger DB
`enforce_document_type_root_org` (calqué sur `enforce_procedure_root_org`). Il **alimente le champ
pièce justificative** du form builder (`documentTypeId`, obligatoire — cf. feature démarches).

- Champs : `name` (**obligatoire**, **unique par organisation, insensible à la casse** via l'index
  `document_types_org_name_unique` sur `(organization_id, lower(name))`), `organization_id` (FK
  racine, `ON DELETE CASCADE`).
- RLS `document_types` (calqué sur `categories`) : lecture `has_org_access(organization_id)` ·
  écriture (ALL) `is_org_admin(organization_id)`. Pas de policy super_admin dédiée (`is_org_admin`
  court-circuite déjà le super admin).
- Unicité vérifiée côté client (feedback immédiat) **et** garantie en base (repli sur l'erreur
  Postgres `23505`).
- **Deux points d'entrée**, tous deux via le composant partagé `DocumentTypesManager` (liste + CRUD) :
  - **Admin** : écran **`/types-pieces`** dans l'app par organisation (comme `/categories`) — mode
    « toutes mes racines », le dialogue propose un sélecteur d'organisation (masqué s'il n'y en a qu'une).
  - **Superadmin** : section « Types de pièce justificative » de `OrgSettingsPage` (racine uniquement) —
    mode **org fixée** : `DocumentTypesManager organizationId=…`, le dialogue **verrouille** l'organisation
    (`fixedOrganizationId`) et la liste n'affiche que les types de cette organisation.
- Code : `src/features/document-types/` — `useDocumentTypes.ts` (`useDocumentTypesQuery(enabled?)`,
  `useDocumentTypesForOrg(orgId)`, mutations), `DocumentTypesManager`, `DocumentTypeFormDialog`,
  `DocumentTypesPage` (fin conteneur). Sélecteur d'organisation via `useWritableRootOrganizations`.
