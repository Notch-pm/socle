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

1. **Modèle Socle** : `latitude`/`longitude` sur `contacts` (géocodage BAN au
   create/patch quand l'adresse change), table `quartiers` par org racine,
   `quartier_id`/`quartier_auto` sur `contacts` + rattachement automatique.
2. **API** : CRUD/import des quartiers (scope `contacts`), `quartier_id` dans la
   réponse `Contact`, filtre `quartier_id` sur `GET /v1/contacts`, stats par quartier.
3. **UI Socle** : paramétrage des quartiers (import GeoJSON, carte).
4. **Clara** : filtre quartier sur la page Contacts + stats via l'API, sans
   stockage local.
