-- Provisions a public.users row whenever someone signs up via Supabase Auth.
-- Without this, a new auth.users row has no matching public.users row, so
-- global_role is never set and every RLS helper function (is_super_admin,
-- is_org_admin, has_org_access) evaluates false for that person.
-- Bootstrap rule (explicit product decision): the very first person to sign
-- up becomes super_admin; everyone after that starts as consultant.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, global_role)
  values (
    new.id,
    new.email,
    case when (select count(*) from public.users) = 0 then 'super_admin' else 'consultant' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
