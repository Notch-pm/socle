-- Hygiène advisor (0028/0029) : les fonctions trigger SECURITY DEFINER ne
-- doivent pas être appelables via /rest/v1/rpc par anon/authenticated.
-- Généralise le motif de contacts_trigger_functions_revoke_execute aux
-- fonctions trigger restantes (l'exécution par trigger n'est pas affectée :
-- Postgres ne vérifie l'EXECUTE qu'à la création du trigger).

revoke execute on function public.enforce_api_key_root_org() from public, anon, authenticated;
revoke execute on function public.enforce_document_type_root_org() from public, anon, authenticated;
revoke execute on function public.enforce_procedure_root_org() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
