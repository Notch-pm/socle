-- 1) Contact / display columns + reversible obsolescence status
alter table public.organizations
  add column if not exists logo_url text,
  add column if not exists address  text,
  add column if not exists phone    text,
  add column if not exists email    text,
  add column if not exists status   text not null default 'active';

-- constrain status values (drop first for idempotency)
alter table public.organizations drop constraint if exists organizations_status_check;
alter table public.organizations
  add constraint organizations_status_check check (status in ('active', 'obsolete'));

-- 2) Admin power over the whole subtree: true when super admin, or when the
--    current user is 'admin' on the org itself OR any of its ancestors.
--    SECURITY DEFINER so the upward walk bypasses RLS (avoids recursion with
--    the SELECT policy that calls this very function).
create or replace function public.is_admin_of_self_or_ancestor(org_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cur   uuid := org_id;
  guard int  := 0;
begin
  if public.is_super_admin() then
    return true;
  end if;

  while cur is not null and guard < 100 loop
    if exists (
      select 1 from public.user_organizations uo
      where uo.user_id = auth.uid()
        and uo.organization_id = cur
        and uo.role = 'admin'
    ) then
      return true;
    end if;
    select parent_id into cur from public.organizations where id = cur;
    guard := guard + 1;
  end loop;

  return false;
end;
$$;

-- 3) Depth guard: root + 9 sub-levels = 10 levels max. Also rejects cycles.
create or replace function public.enforce_org_depth()
returns trigger
language plpgsql
as $$
declare
  depth int  := 1;      -- the row itself counts as level 1
  cur   uuid := new.parent_id;
begin
  while cur is not null loop
    depth := depth + 1;
    if cur = new.id then
      raise exception 'Cycle detecte dans la hierarchie des organisations';
    end if;
    if depth > 10 then
      raise exception 'Profondeur maximale de 10 niveaux depassee';
    end if;
    select parent_id into cur from public.organizations where id = cur;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_enforce_org_depth on public.organizations;
create trigger trg_enforce_org_depth
  before insert or update of parent_id on public.organizations
  for each row execute function public.enforce_org_depth();

-- 4) RLS rewrite
drop policy if exists "read organizations if member" on public.organizations;
create policy "read organizations if member"
  on public.organizations for select
  using (public.has_org_access(id) or public.is_admin_of_self_or_ancestor(id));

drop policy if exists "create org" on public.organizations;
create policy "create org"
  on public.organizations for insert
  with check (
    public.is_super_admin()
    or (parent_id is not null and public.is_admin_of_self_or_ancestor(parent_id))
  );

drop policy if exists "update org" on public.organizations;
create policy "update org"
  on public.organizations for update
  using (public.is_admin_of_self_or_ancestor(id))
  with check (public.is_admin_of_self_or_ancestor(id));

drop policy if exists "delete org" on public.organizations;
create policy "delete org"
  on public.organizations for delete
  using (public.is_super_admin() and parent_id is not null);
