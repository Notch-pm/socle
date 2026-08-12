-- Per-organization SMTP configuration, mirroring Clara's smtp_settings table.
-- One row per organization (UNIQUE), used by invite-user and auth-email-hook
-- edge functions to send emails on behalf of that organization instead of a
-- single global SMTP account.
create table public.smtp_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade not null unique,
  host text not null default '',
  port integer not null default 587,
  username text not null default '',
  password text not null default '',
  from_email text not null default '',
  from_name text not null default '',
  use_tls boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- rls_auto_enable() (existing event trigger) already turns RLS on for new
-- tables, but we enable it explicitly here for clarity/readability.
alter table public.smtp_settings enable row level security;

-- Read: org admins (of that org) and super_admin — reuses the existing
-- is_org_admin() helper instead of duplicating the EXISTS check.
create policy "org admins can read smtp settings"
on public.smtp_settings
for select
using (is_org_admin(organization_id));

-- Write: super_admin only. SMTP credentials (including a plaintext password)
-- are platform-level configuration, managed from the super-admin area — not
-- delegated to individual organization admins.
create policy "super admin can write smtp settings"
on public.smtp_settings
for all
using (is_super_admin())
with check (is_super_admin());

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_smtp_settings_updated_at
before update on public.smtp_settings
for each row execute function public.set_updated_at();
