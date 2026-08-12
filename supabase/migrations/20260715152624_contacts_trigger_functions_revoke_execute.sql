-- Durcissement : les fonctions trigger du référentiel usagers n'ont pas besoin d'être
-- exécutables via l'API REST (un trigger se déclenche sans privilège EXECUTE).
-- Répond à l'advisor « Public Can Execute SECURITY DEFINER Function » pour les nouvelles fonctions.
revoke execute on function public.enforce_contact_root_org() from public, anon, authenticated;
revoke execute on function public.enforce_contact_role_root_org() from public, anon, authenticated;
revoke execute on function public.enforce_contact_role_same_org() from public, anon, authenticated;
revoke execute on function public.sync_contact_external_ref_org() from public, anon, authenticated;
