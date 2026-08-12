-- Fix 1: org admins can list the membership rows of organizations they administer
-- (previously SELECT was restricted to user_id = auth.uid() OR is_super_admin(),
-- meaning an org admin could not see their own org's member list)
create policy "org admins can read org memberships"
on public.user_organizations
for select
using (is_org_admin(organization_id));

-- Fix 2: org admins can read the profile (email, etc.) of users who share an
-- organization they administer, so member_id -> name/email resolves for them
create policy "org admins can read member profiles"
on public.users
for select
using (
  exists (
    select 1 from public.user_organizations uo
    where uo.user_id = users.id
    and is_org_admin(uo.organization_id)
  )
);

-- Fix 3: tighten organizations UPDATE to actual org admins.
-- Previously used has_org_access(id), which allows ANY member (including
-- consultants) to update name/slug/type/parent_id of their organization.
drop policy if exists "update org" on public.organizations;
create policy "update org"
on public.organizations
for update
using (is_org_admin(id))
with check (is_org_admin(id));

-- Fix 4: creating a child organization now requires admin rights on the
-- specific parent_id supplied, instead of "is admin of any organization
-- anywhere". Root organization creation (parent_id null) keeps its existing
-- behaviour (any org-admin-anywhere, or super_admin).
drop policy if exists "create org" on public.organizations;
create policy "create org"
on public.organizations
for insert
with check (
  is_super_admin()
  or (parent_id is not null and is_org_admin(parent_id))
  or (
    parent_id is null
    and exists (
      select 1 from public.user_organizations uo
      where uo.user_id = auth.uid() and uo.role = 'admin'
    )
  )
);

-- Fix 5: a procedure can now also be read by members of an organization that
-- has activated it via organization_procedures, even if they are not members
-- of the owning organization (procedures.organization_id). This was blocking
-- the catalogue/activation model: a consuming org could not read the content
-- of a procedure it had enabled.
create policy "read procedures via activation"
on public.procedures
for select
using (
  exists (
    select 1 from public.organization_procedures op
    where op.procedure_id = procedures.id
    and has_org_access(op.organization_id)
  )
);

-- Hygiene: rls_auto_enable() is an event-trigger function, it does not need
-- to be callable directly via the exposed RPC endpoint by anon/authenticated.
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
