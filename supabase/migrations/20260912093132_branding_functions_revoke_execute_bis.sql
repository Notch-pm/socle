-- Rappel du piège de `branding_functions_revoke_execute` (2026-08-30), retombé
-- dedans le 2026-09-12 : **recréer une fonction lui rend les droits par défaut**.
--
-- `organizations_favicon` a dû DÉPOSER `resolve_branding` et `parent_branding`
-- (leur type de retour changeait), et les a recréées avec les mêmes lignes de
-- droits que la migration d'origine — c'est-à-dire `revoke all ... from public`,
-- dont on sait précisément qu'il ne suffit pas : Supabase pose des DEFAULT
-- PRIVILEGES qui accordent EXECUTE à `anon` et `authenticated` **nommément**,
-- et ces grants-là survivent à une révocation du seul pseudo-rôle PUBLIC.
-- Résultat mesuré aussitôt après : `resolve_branding`, qui traverse la
-- hiérarchie **hors RLS** pour le compte du service_role, était de nouveau
-- appelable par `anon` via /rest/v1/rpc/….
--
-- ⚠️ Toute migration qui recrée l'une de ces deux fonctions doit reposer les
-- droits en citant les TROIS rôles, pas seulement `public`.

revoke all on function public.resolve_branding(uuid) from public, anon, authenticated;
grant execute on function public.resolve_branding(uuid) to service_role;

revoke all on function public.parent_branding(uuid) from public, anon;
grant execute on function public.parent_branding(uuid) to authenticated, service_role;
