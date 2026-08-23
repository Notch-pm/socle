-- L'interface n'a besoin que d'une primitive : « de quoi cette organisation
-- hérite-t-elle ? », c'est-à-dire le relais applicable à son PARENT. Résoudre à
-- partir de l'organisation elle-même (effective_smtp_settings, remplacée ici et
-- jamais consommée) donnait un aperçu faux dès qu'on basculait le commutateur
-- sans enregistrer : on affichait sa propre configuration comme « héritée ».
drop function if exists public.effective_smtp_settings(uuid);

create or replace function public.parent_smtp_settings(p_org_id uuid)
returns table (
  source_organization_id uuid,
  source_organization_name text,
  configured boolean,
  host text,
  port integer,
  username text,
  from_email text,
  from_name text,
  use_tls boolean
)
    language plpgsql stable security definer
    set search_path to 'public'
as $$
declare
  parent uuid;
begin
  -- Garde portée par l'organisation configurée, pas par la source : l'admin
  -- d'une sous-organisation n'a aucun droit de lecture sur la ligne de son
  -- parent, il doit pourtant voir ce dont il hérite. Le mot de passe, lui, ne
  -- descend jamais (colonne absente du type de retour).
  if not public.is_admin_of_self_or_ancestor(p_org_id) then
    raise exception 'Acces refuse';
  end if;

  select o.parent_id into parent from public.organizations o where o.id = p_org_id;
  if parent is null then
    return; -- organisation principale : personne au-dessus
  end if;

  return query
  select
    s.organization_id,
    o.name,
    (btrim(s.host) <> '' and btrim(s.from_email) <> ''),
    s.host,
    s.port,
    s.username,
    s.from_email,
    s.from_name,
    s.use_tls
  from public.resolve_smtp_settings(parent) s
  join public.organizations o on o.id = s.organization_id;
end;
$$;

alter function public.parent_smtp_settings(uuid) owner to postgres;
revoke execute on function public.parent_smtp_settings(uuid) from public, anon;
grant execute on function public.parent_smtp_settings(uuid) to authenticated, service_role;
