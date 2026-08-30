-- Réparation des droits d'EXECUTE des fonctions de la charte graphique
-- (advisors 0028/0029), même correction que `resolve_smtp_settings_revoke_execute`
-- en son temps — et pour la même raison, qui mérite d'être écrite une bonne fois :
--
-- ⚠️ `revoke ... from public` NE SUFFIT PAS sur ce projet. Supabase pose des
-- DEFAULT PRIVILEGES qui accordent EXECUTE à `anon` et `authenticated`
-- **nommément** sur toute fonction créée dans `public` ; ces grants-là survivent
-- à une révocation du seul pseudo-rôle PUBLIC. Il faut donc citer les trois.
--
-- Conséquences de l'oubli, telles que constatées :
--  • `resolve_branding` était appelable par `anon` via /rest/v1/rpc/… alors
--    qu'elle traverse la hiérarchie **hors RLS** pour le compte du service_role ;
--  • `enforce_branding_root_no_inherit`, fonction *trigger*, gardait le grant
--    PUBLIC — sans effet sur son déclenchement (Postgres ne vérifie l'EXECUTE
--    qu'à la création du trigger), mais appelable à la main pour rien.

revoke all on function public.enforce_branding_root_no_inherit()
  from public, anon, authenticated;

revoke all on function public.resolve_branding(uuid) from public, anon, authenticated;
grant execute on function public.resolve_branding(uuid) to service_role;

revoke all on function public.parent_branding(uuid) from public, anon;
grant execute on function public.parent_branding(uuid) to authenticated, service_role;
