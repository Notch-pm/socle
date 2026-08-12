-- org_subtree_ids calcule le périmètre (sous-arbre) des clés API dans les edge
-- functions, appelée avec la service role. Elle n'a jamais vocation à être
-- appelée via /rest/v1/rpc/ par un client : on aligne son ACL sur le motif des
-- fonctions trigger (EXECUTE réservé à service_role). Impact limité en pratique
-- (SECURITY INVOKER => RLS de l'appelant), mais l'ACL doit refléter l'usage.
revoke execute on function public.org_subtree_ids(uuid) from public, anon, authenticated;
grant execute on function public.org_subtree_ids(uuid) to service_role;
