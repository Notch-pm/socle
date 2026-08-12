-- Mirrors the "org admins can read member profiles" SELECT policy added
-- earlier: without this, editing a member's first_name/last_name from the
-- Users management screen silently affects 0 rows under RLS (an org admin
-- updating someone else's `users` row didn't match the existing
-- "users can update own profile" policy, which only allows id = auth.uid()).
create policy "org admins can update member profiles"
on public.users
for update
using (
  exists (
    select 1 from public.user_organizations uo
    where uo.user_id = users.id
    and is_org_admin(uo.organization_id)
  )
)
with check (
  exists (
    select 1 from public.user_organizations uo
    where uo.user_id = users.id
    and is_org_admin(uo.organization_id)
  )
);
