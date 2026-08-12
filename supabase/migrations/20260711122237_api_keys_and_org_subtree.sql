-- Clés API pour l'API publique en lecture seule (rattachées à une organisation
-- principale ; gérées par le super admin ; secret stocké haché).
create table if not exists public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  key_prefix      text not null,
  key_hash        text not null unique,
  scopes          text[] not null default '{read}',
  last_used_at    timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists api_keys_organization_id_idx on public.api_keys(organization_id);

-- Une clé doit être rattachée à une organisation PRINCIPALE (racine). Calqué sur
-- enforce_procedure_root_org.
create or replace function public.enforce_api_key_root_org()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  parent uuid;
begin
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Une cle API doit etre rattachee a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_api_key_root_org on public.api_keys;
create trigger trg_enforce_api_key_root_org
  before insert or update of organization_id on public.api_keys
  for each row execute function public.enforce_api_key_root_org();

-- RLS : gestion réservée au super admin (le client normal ne voit rien ;
-- l'edge function lit avec la service role, hors RLS).
alter table public.api_keys enable row level security;

drop policy if exists "api_keys super admin all" on public.api_keys;
create policy "api_keys super admin all" on public.api_keys
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Ensemble des organization_id d'un sous-arbre (racine incluse). SECURITY
-- INVOKER (défaut) → le RLS de organizations s'applique à l'appelant ; l'edge
-- function (service role) contourne le RLS et obtient tout le sous-arbre.
-- Execute réservé à service_role : non exposé aux clients PostgREST.
create or replace function public.org_subtree_ids(root uuid)
returns uuid[]
language sql
stable
set search_path to 'public'
as $$
  with recursive sub as (
    select id from public.organizations where id = root
    union all
    select o.id from public.organizations o join sub on o.parent_id = sub.id
  )
  select coalesce(array_agg(id), '{}')::uuid[] from sub;
$$;

revoke all on function public.org_subtree_ids(uuid) from public;
grant execute on function public.org_subtree_ids(uuid) to service_role;
