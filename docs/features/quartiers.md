# Feature : quartiers (découpage du territoire)

> Fiche de feature — l'index est dans [CLAUDE.md](../../CLAUDE.md). Invariants, pièges (⚠️)
> et pointeurs de code : **à lire avant de toucher la feature, à mettre à jour dans la même PR.**

Portage de la fonctionnalité quartiers de Clara (instantané dans `references/clara-quartiers/`),
décidé quand Clara a délégué ses usagers au Socle. **Multi-tenant strict** : un quartier est
rattaché à une **organisation principale (racine)** — trigger `enforce_quartier_root_org` (motif
habituel). Livré : modèle DB + UI Socle + **exposition API** (catalogue dans `public-api`,
géocodage/rattachement dans `contacts-api` — voir les deux features API). Clara **affiche** le
quartier depuis le 2026-07-18 (objet `quartier` résolu dans la fiche contact). Reste : le
**filtre** par quartier côté Clara, et les **stats par quartier**, pas encore exposées par
l'API (RPC `stats_contacts_by_quartier` disponible).

- **`quartiers`** : `name` (unique par org, insensible à la casse — index
  `quartiers_org_name_unique`), `color`, `geom geometry(MultiPolygon, 4326)` (**PostGIS**,
  extension installée dans le schéma `extensions` ; index GIST). Pas de dessin dans l'app :
  **import GeoJSON uniquement** (`ST_MakeValid` répare les polygones auto-intersectants).
  RLS : SELECT `has_org_access` · écriture (ALL) `is_org_admin` — table modifiable côté
  client, comme `contact_roles`.
- ⚠️ **L'import GeoJSON remplace le découpage** (depuis le 2026-07-18) : le fichier fait foi,
  les quartiers de l'organisation sont **supprimés puis recréés dans la même transaction**
  (paramètre `p_replace` de `create_quartiers_batch`) — un import qui échoue ne laisse donc
  jamais l'organisation sans découpage, et les noms ne se retrouvent plus suffixés « (2) » par
  collision avec l'ancien jeu (seuls les doublons **internes au fichier** le sont). Remplacer
  par un lot **vide** est refusé (ce serait une suppression, qui a son propre bouton). L'UI
  avertit et fait confirmer par `AlertDialog` quand des quartiers existent.
- **`contacts`** : + `address_lat`/`address_lon` (géocodage BAN prévu en phase API),
  `quartier_id` (FK `ON DELETE SET NULL`), `quartier_auto` (passe à false quand une valeur est
  forcée manuellement, pour la protéger du recalcul de masse). **Rattachement automatique par
  trigger** `assign_contact_quartier` (BEFORE INSERT/UPDATE) : en mode auto, recalcule
  `quartier_id` quand les coordonnées changent, quand `quartier_auto` repasse à true, ou quand
  `quartier_id` arrive à NULL avec des coordonnées présentes (un PATCH `quartier_id: null`
  réassigne immédiatement — migration `assign_contact_quartier_recompute_on_null`) ; purge si
  coordonnées nulles ; en mode manuel, vérifie que le quartier appartient à la même racine que
  le contact.
- **RPC** (`SECURITY INVOKER` sauf mention ; `EXECUTE` accordé à authenticated + service_role,
  révoqué d'anon) : `quartier_for_point` (point-dans-polygone), `create_quartier_from_geojson` et
  `create_quartiers_batch` (import **atomique** en un appel, noms dédoublonnés « (n) » côté
  serveur), `list_quartiers_geojson` (cast `ST_AsGeoJSON` serveur — PostGIS stocke en binaire,
  illisible par Leaflet sinon), `stats_contacts_by_quartier` (+ ligne « Sans quartier »),
  `contacts_outside_quartiers` (géolocalisés hors de tout polygone),
  `recalculate_contact_quartiers` (**SECURITY DEFINER** — les contacts n'ont aucune policy
  d'écriture client ; garde interne `is_org_admin(p_org_id)` ou service_role),
  `reset_orphan_manual_quartiers` (même motif SECURITY DEFINER + garde) : après un import en
  remplacement, un usager rattaché **manuellement** à un quartier disparu (`quartier_id` mis à
  NULL par la FK, `quartier_auto = false`) serait **ignoré à jamais** par le recalcul — on le
  repasse donc en automatique. Appelée depuis `create_quartiers_batch` en mode remplacement.
- **UI** : carte **Leaflet** (deps `leaflet` + `react-leaflet@4` — la v5 exige React 19) via le
  composant partagé `QuartiersManager` : carte cadrée sur l'emprise, liste avec nombre d'usagers
  par quartier, import GeoJSON (noms devinés depuis les propriétés, couleurs cyclées), édition
  nom/couleur, suppression, recalcul des assignations. Deux points d'entrée (motif
  `document_types`) : page admin **`/quartiers`** (sélecteur de racine si plusieurs) et section
  « Quartiers » de `OrgSettingsPage` (racine uniquement). Les droits d'écriture sont portés par
  le RLS (l'UI ne masque pas les actions).
- Code : `src/features/quartiers/` — `useQuartiers.ts` (hooks + mutations ; l'import enchaîne
  le recalcul), `quartiersGeojson.ts` (logique pure **testée** : extraction des polygones d'un
  GeoJSON quelconque, noms devinés/dédoublonnés, palette, `readableTextColor`), `QuartiersMap`,
  `ImportQuartiersDialog`, `QuartierEditDialog`, `QuartiersManager`, `QuartiersPage`.
- Migrations : `quartiers_referentiel`, `assign_contact_quartier_recompute_on_null`,
  `quartiers_import_remplacement`. Vérifié de
  bout en bout (2026-07-17) : test SQL transactionnel annulé (assignation auto, dédoublonnage,
  invariants tenant/racine), parcours navigateur complet (import → stats → recalcul → renommage →
  suppression), et parcours API réel (géocodage BAN d'une adresse → quartier assigné, filtre,
  re-géocodage au changement d'adresse, manuel/auto, 400 sur paire de coordonnées incomplète et
  quartier inconnu).
