-- resolve_smtp_settings sert le relais applicable **mot de passe compris** aux
-- edge functions (service role). `revoke ... from public` ne suffit pas : les
-- privilèges par défaut de Supabase accordent EXECUTE nommément à anon et
-- authenticated. On aligne l'ACL sur le motif org_subtree_ids.
revoke execute on function public.resolve_smtp_settings(uuid) from public, anon, authenticated;
grant execute on function public.resolve_smtp_settings(uuid) to service_role;

-- effective_smtp_settings est l'aperçu sans mot de passe destiné à l'interface :
-- exécutable par un utilisateur connecté (garde interne is_admin_of_self_or_ancestor),
-- jamais par un visiteur anonyme. (Remplacée par parent_smtp_settings dans la
-- migration suivante — l'aperçu doit partir du parent, pas de l'organisation.)
revoke execute on function public.effective_smtp_settings(uuid) from public, anon;
grant execute on function public.effective_smtp_settings(uuid) to authenticated, service_role;

-- Fonction trigger : motif advisors 0028/0029.
revoke execute on function public.enforce_smtp_no_inherit_on_root() from public, anon, authenticated;
