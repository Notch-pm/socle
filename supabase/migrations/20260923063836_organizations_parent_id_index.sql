-- Index sur organizations(parent_id) — audit purge / performance de la gamme du
-- 2026-09-23.
--
-- Aucun index n'existait sur parent_id, alors que toutes les descentes de
-- hiérarchie joignent dessus (`join … on o.parent_id = sub.id`) :
-- org_subtree_ids (appelée par scopeRequest sur CHAQUE requête des quatre API
-- externes, et par record_portal_page_view / record_portal_deposit sur chaque
-- vue de page du portail public), ainsi que les CTE récursives de
-- organizations_service_interne, langues_et_traductions, charte graphique,
-- favicon, agent_guidance, portal_assistant_settings. Sans index, chaque niveau
-- de récursion (jusqu'à 10, enforce_org_depth) balaie toute la table.
--
-- Pas de CONCURRENTLY : les migrations passent dans une transaction, et la
-- table est petite — le verrou dure quelques millisecondes. Rejouable.

create index if not exists organizations_parent_id_idx
  on public.organizations (parent_id);
