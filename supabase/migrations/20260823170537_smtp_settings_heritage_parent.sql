-- Héritage du serveur d'envoi (SMTP) le long de la hiérarchie d'organisations.
--
-- Règle : une organisation utilise le relais de l'ancêtre le plus proche (elle
-- comprise) qui possède une configuration **propre**. Une sous-organisation n'a
-- une configuration propre que si elle en a explicitement demandé une : ligne
-- présente ET `inherit_parent = false`. Conséquence recherchée : modifier le
-- relais d'un parent modifie de facto celui de tous les enfants non spécifiques,
-- sans recopie (aucune dénormalisation à resynchroniser).

alter table public.smtp_settings
  add column if not exists inherit_parent boolean not null default false;

comment on column public.smtp_settings.inherit_parent is
  'true = ligne inerte : l''organisation utilise le relais de son ancêtre le plus proche. Les valeurs saisies sont conservées pour un retour en arrière (motif organizations.email_sender_override).';

-- Une organisation principale (racine) n'a personne de qui hériter.
create or replace function public.enforce_smtp_no_inherit_on_root() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
  parent uuid;
begin
  if not new.inherit_parent then
    return new;
  end if;
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is null then
    raise exception 'Une organisation principale (racine) ne peut pas heriter du relais SMTP d''un parent';
  end if;
  return new;
end;
$$;

alter function public.enforce_smtp_no_inherit_on_root() owner to postgres;
revoke all on function public.enforce_smtp_no_inherit_on_root() from anon, authenticated;

drop trigger if exists enforce_smtp_no_inherit_on_root on public.smtp_settings;
create trigger enforce_smtp_no_inherit_on_root
  before insert or update on public.smtp_settings
  for each row execute function public.enforce_smtp_no_inherit_on_root();

-- Résolution du relais applicable : première ligne non héritante en remontant
-- les parents. Renvoie 0 ou 1 ligne, mot de passe compris → réservée au
-- service_role (motif org_subtree_ids), consommée par les edge functions.
create or replace function public.resolve_smtp_settings(p_org_id uuid)
returns setof public.smtp_settings
    language sql stable
    set search_path to 'public'
as $$
  with recursive chain as (
    select o.id, o.parent_id, 0 as depth
    from public.organizations o
    where o.id = p_org_id
    union all
    select o.id, o.parent_id, c.depth + 1
    from public.organizations o
    join chain c on o.id = c.parent_id
    where c.depth < 20 -- garde-fou (10 niveaux max, cycles bloqués par enforce_org_depth)
  )
  select s.*
  from chain c
  join public.smtp_settings s on s.organization_id = c.id
  where s.inherit_parent = false
  order by c.depth
  limit 1;
$$;

alter function public.resolve_smtp_settings(uuid) owner to postgres;
revoke all on function public.resolve_smtp_settings(uuid) from public;
grant execute on function public.resolve_smtp_settings(uuid) to service_role;

-- Aperçu pour l'interface : le relais applicable **sans le mot de passe**, avec
-- l'organisation qui le porte. SECURITY DEFINER parce que l'admin d'une
-- sous-organisation n'a aucun droit de lecture sur la ligne de son parent — il
-- doit pourtant voir ce dont il hérite ; le secret, lui, ne descend pas.
create or replace function public.effective_smtp_settings(p_org_id uuid)
returns table (
  source_organization_id uuid,
  source_organization_name text,
  inherited boolean,
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
begin
  if not public.is_admin_of_self_or_ancestor(p_org_id) then
    raise exception 'Acces refuse';
  end if;

  return query
  select
    s.organization_id,
    o.name,
    s.organization_id <> p_org_id,
    (btrim(s.host) <> '' and btrim(s.from_email) <> ''),
    s.host,
    s.port,
    s.username,
    s.from_email,
    s.from_name,
    s.use_tls
  from public.resolve_smtp_settings(p_org_id) s
  join public.organizations o on o.id = s.organization_id;
end;
$$;

alter function public.effective_smtp_settings(uuid) owner to postgres;
revoke all on function public.effective_smtp_settings(uuid) from public;
grant execute on function public.effective_smtp_settings(uuid) to authenticated, service_role;

-- RLS : un admin règle le relais de tout son sous-arbre (motif organizations /
-- organization_procedures). Sans cela, l'admin d'une principale ne pourrait pas
-- décider de l'héritage de ses sous-organisations (403 à l'enregistrement).
drop policy if exists "org admins can read smtp settings" on public.smtp_settings;
create policy "org admins can read smtp settings" on public.smtp_settings
  for select using (public.is_admin_of_self_or_ancestor(organization_id));

drop policy if exists "org admins can write smtp settings" on public.smtp_settings;
create policy "org admins can write smtp settings" on public.smtp_settings
  using (public.is_admin_of_self_or_ancestor(organization_id))
  with check (public.is_admin_of_self_or_ancestor(organization_id));
