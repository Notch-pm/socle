# Référence : fonctionnalité « quartiers » de Clara (à porter dans le Socle)

Instantané pris le 2026-07-16, au moment où Clara a délégué son référentiel
d'usagers au Socle (`contacts-api`) et retiré la fonctionnalité quartiers de son
code. **Décision produit : les quartiers seront réintégrés côté Socle**
(propriétaire des contacts et de leurs adresses), et Clara les consommera via
l'API. Ces fichiers servent de référence d'implémentation/UX pour ce portage —
ils ne sont ni buildés ni maintenus.

## Contenu

- `20260616150000_quartiers.sql` — schéma et RPC d'origine : table `quartiers`
  (polygones GeoJSON par organisation), colonnes `quartier_id`/`quartier_auto`
  sur les usagers, `quartier_for_point` (point-dans-polygone),
  `recalculate_usager_quartiers`, `stats_usagers_by_quartier`,
  `usagers_outside_quartiers`, `create_quartier_from_geojson`,
  `list_quartiers_geojson`.
- `20260616160000_quartiers_batch_import.sql` — import GeoJSON par lots
  (`create_quartiers_batch`).
- `20260616120000_usagers_address_geocoding.sql` — colonnes `address_lat`/`address_lon`.
- `quartierService.ts` / `banAddressService.ts` — services client : quartiers,
  autocomplétion d'adresse via l'API BAN (géocodage).
- `QuartiersSettings.tsx` — UI de paramétrage (import GeoJSON, liste, comptes).
- `AddressAutocomplete.tsx` / `AddressMap.tsx` — saisie d'adresse géocodée + carte.
- `Usagers.tsx` — l'ancien annuaire Clara (filtres quartiers/anniversaires,
  fiche avec carte) : référence UX.
- `UsagersByQuartierChart.tsx` — graphique « usagers par quartier ».

## Cadrage du portage (phase 2)

État au 2026-07-17 : **étapes 1, 2 et 3 livrées côté Socle** — migrations
`quartiers_referentiel` + `assign_contact_quartier_recompute_on_null`,
`src/features/quartiers/`, endpoints déployés ; voir les features « Quartiers »,
« API publique » et « API usagers » de CLAUDE.md. Colonnes nommées
`address_lat`/`address_lon` (préfixe des champs d'adresse de `contacts`).
Reste l'étape 4 (Clara).

1. ✅ **Modèle Socle** : `address_lat`/`address_lon` sur `contacts`, table
   `quartiers` par org racine, `quartier_id`/`quartier_auto` sur `contacts`
   + rattachement automatique (trigger `assign_contact_quartier`).
2. ✅ **API** : lecture des quartiers via `GET /v1/quartiers` de **public-api**
   (option `geometry=true` → GeoJSON) ; dans **contacts-api** : `quartier_id`/
   `quartier_auto`/`address_lat`/`address_lon` dans la réponse `Contact` et en
   écriture, filtre `quartier_id` sur `GET /v1/contacts`, **géocodage BAN au
   create/patch** quand l'adresse change. Divergences du cadrage initial : pas
   de CRUD/import des quartiers par API (paramétrage = UI Socle) ; stats par
   quartier non exposées (RPC `stats_contacts_by_quartier` disponible au besoin).
3. ✅ **UI Socle** : paramétrage des quartiers (import GeoJSON, carte) —
   `/quartiers` (admin) + section de `OrgSettingsPage` (superadmin).
4. ⬜ **Clara** : filtre quartier sur la page Contacts + stats via l'API, sans
   stockage local.
