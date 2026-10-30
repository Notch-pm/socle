-- Annuaire des agents et accès aux applications de la gamme (lot 1).
--
-- Le Socle devient le lieu où le DSI décide QUI a accès à QUELLE application,
-- sur QUEL organisme, avec QUEL rôle de base. Les droits fins (profils Iris par
-- démarche, signataire / viseur Clara…) restent dans chaque application.
--
-- Le Socle lui-même reste piloté par `user_organizations` : ni ses policies ni
-- les quatre fonctions d'aide RLS ne changent. `user_application_access` ne
-- concerne que les AUTRES applications.

-- --------------------------------------------------------------------------
-- 0. Écriture du navigateur sur `users` : prénom et nom seulement.
--
-- `users` était en GRANT ALL pour anon / authenticated, et la policy « users
-- can update own profile » ne contrôle que `id = auth.uid()` : un compte
-- connecté pouvait s'écrire `global_role = 'super_admin'`. Les privilèges de
-- colonne ferment la porte : le RLS dit QUELLES lignes, les privilèges QUELLES
-- colonnes. `global_role` et `status` ne s'écrivent plus que par le service
-- role ou une fonction SECURITY DEFINER.
-- --------------------------------------------------------------------------
revoke insert, update, delete, truncate on table public.users from anon, authenticated;
grant update (first_name, last_name) on table public.users to authenticated;

-- --------------------------------------------------------------------------
-- 1. Statut de l'agent : suspendre coupe TOUS ses accès d'un geste.
--    Le réglage gouverne l'usage, pas la donnée : les lignes d'accès sont
--    conservées, et rendues inactives à la lecture (API, applications).
-- --------------------------------------------------------------------------
alter table public.users
  add column status text not null default 'active',
  add column updated_at timestamptz not null default now(),
  add constraint users_status_known check (status in ('active', 'suspended'));

comment on column public.users.status is
  'active | suspended. Suspendu = aucun accès à aucune application, lignes d''accès conservées. Écrit par set_user_status() seulement.';

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- 2. Rôles de base déclarés par chaque application.
-- --------------------------------------------------------------------------
create table public.application_roles (
  application_id text not null references public.applications(id) on delete cascade,
  code           text not null check (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  label          text not null check (length(btrim(label)) between 1 and 60),
  is_admin       boolean not null default false,
  sort_order     integer not null default 0,
  primary key (application_id, code)
);

comment on table public.application_roles is
  'Rôles de base qu''une application de la gamme reconnaît. Une application sans rôle n''a pas d''agents gérés par le Socle (Nora). Le Socle n''y figure pas : ses rôles vivent dans user_organizations.';

alter table public.application_roles enable row level security;

create policy "read application_roles" on public.application_roles
  for select to authenticated using (true);

create policy "write application_roles" on public.application_roles
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Les rôles en usage aujourd'hui dans chaque application (Iris :
-- organization_members.role ; Clara : docs/permissions.md).
insert into public.application_roles (application_id, code, label, is_admin, sort_order)
select v.application_id, v.code, v.label, v.is_admin, v.sort_order
from (values
  ('iris',  'admin',          'Administrateur', true,  10),
  ('iris',  'superviseur',    'Superviseur',    false, 20),
  ('iris',  'agent',          'Agent',          false, 30),
  ('iris',  'lecteur',        'Lecteur',        false, 40),
  ('clara', 'administrateur', 'Administrateur', true,  10),
  ('clara', 'superviseur',    'Superviseur',    false, 20),
  ('clara', 'gestionnaire',   'Gestionnaire',   false, 30),
  ('clara', 'elu',            'Élu',            false, 40),
  ('clara', 'consultant',     'Consultant',     false, 50)
) as v(application_id, code, label, is_admin, sort_order)
where exists (select 1 from public.applications a where a.id = v.application_id)
on conflict do nothing;

-- --------------------------------------------------------------------------
-- 3. Accès d'un agent à une application, sur un organisme.
-- --------------------------------------------------------------------------
create table public.user_application_access (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  application_id  text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_code       text not null,
  -- Retirer un accès le rend inactif, il ne l'efface pas : l'application doit
  -- apprendre le retrait pour bannir le compte (et le rôle revient gratuitement).
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (user_id, application_id, organization_id),
  foreign key (application_id, role_code)
    references public.application_roles(application_id, code) on update cascade
);

comment on table public.user_application_access is
  'Accès d''un agent à une application de la gamme, sur un organisme, avec un rôle de base. Exige l''abonnement de la racine à l''application. is_active = false : accès retiré, conservé pour que l''application bannisse le compte.';

create index user_application_access_org_idx on public.user_application_access (organization_id);
create index user_application_access_app_idx on public.user_application_access (application_id, updated_at);

create trigger trg_user_application_access_updated_at
  before update on public.user_application_access
  for each row execute function public.set_updated_at();

-- Un accès suppose l'abonnement de la collectivité (motif
-- `enforce_organization_application_root_org`). Vérifié à la pose seulement :
-- un désabonnement ultérieur coupe l'API (périmètre de la clé), sans toucher
-- aux lignes — le réabonnement les retrouve.
create or replace function public.enforce_user_application_access_subscription() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.organization_applications oa
    where oa.organization_id = public.organization_root_id(new.organization_id)
      and oa.application_id = new.application_id
  ) then
    raise exception 'La collectivité n''est pas abonnée à cette application.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function public.enforce_user_application_access_subscription() owner to postgres;
revoke all on function public.enforce_user_application_access_subscription() from public, anon, authenticated;

create trigger trg_enforce_user_application_access_subscription
  before insert or update of application_id, organization_id on public.user_application_access
  for each row execute function public.enforce_user_application_access_subscription();

alter table public.user_application_access enable row level security;

-- Même périmètre que l'écran des utilisateurs et `invite-user` : l'admin d'un
-- organisme ou de l'un de ses ancêtres (super admin compris).
create policy "read user_application_access" on public.user_application_access
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_of_self_or_ancestor(organization_id));

create policy "insert user_application_access" on public.user_application_access
  for insert to authenticated
  with check (public.is_admin_of_self_or_ancestor(organization_id));

create policy "update user_application_access" on public.user_application_access
  for update to authenticated
  using (public.is_admin_of_self_or_ancestor(organization_id))
  with check (public.is_admin_of_self_or_ancestor(organization_id));

create policy "delete user_application_access" on public.user_application_access
  for delete to authenticated
  using (public.is_admin_of_self_or_ancestor(organization_id));

-- --------------------------------------------------------------------------
-- 4. Un agent qui n'a d'accès qu'à d'autres applications reste lisible (et
--    renommable) par les administrateurs de son organisme.
-- --------------------------------------------------------------------------
create policy "org admins can read agents with application access" on public.users
  for select to authenticated
  using (exists (
    select 1 from public.user_application_access uaa
    where uaa.user_id = users.id and public.is_admin_of_self_or_ancestor(uaa.organization_id)
  ));

create policy "org admins can update agents with application access" on public.users
  for update to authenticated
  using (exists (
    select 1 from public.user_application_access uaa
    where uaa.user_id = users.id and public.is_admin_of_self_or_ancestor(uaa.organization_id)
  ))
  with check (exists (
    select 1 from public.user_application_access uaa
    where uaa.user_id = users.id and public.is_admin_of_self_or_ancestor(uaa.organization_id)
  ));

-- --------------------------------------------------------------------------
-- 5. Suspendre / réactiver un agent.
--
-- Le statut vaut pour TOUTE la gamme : seul peut le changer le super admin, ou
-- un administrateur dont le périmètre couvre TOUS les rattachements de l'agent
-- (Socle et applications). Un agent partagé entre deux collectivités ne se
-- suspend pas depuis l'une d'elles : on lui retire alors ses accès un à un.
-- --------------------------------------------------------------------------
create or replace function public.set_user_status(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  orgs uuid[];
begin
  if p_status not in ('active', 'suspended') then
    raise exception 'Statut inconnu : %', p_status using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Vous ne pouvez pas changer votre propre statut.' using errcode = '42501';
  end if;

  if not public.is_super_admin() then
    select array_agg(distinct org_id) into orgs
    from (
      select uo.organization_id as org_id from public.user_organizations uo where uo.user_id = p_user_id
      union
      select uaa.organization_id from public.user_application_access uaa where uaa.user_id = p_user_id
    ) s
    where org_id is not null;

    if orgs is null
       or exists (select 1 from unnest(orgs) o where not public.is_admin_of_self_or_ancestor(o)) then
      raise exception 'Cet agent est rattaché hors de votre périmètre : retirez-lui ses accès un à un.'
        using errcode = '42501';
    end if;
  end if;

  update public.users set status = p_status where id = p_user_id;

  -- Le Socle est une application comme les autres : un agent suspendu ne s'y
  -- connecte plus (Supabase Auth refuse connexion et rafraîchissement de jeton
  -- d'un compte banni ; le jeton en cours expire de lui-même). Une date
  -- lointaine plutôt que 'infinity', que Supabase Auth (Go) ne sait pas lire.
  update auth.users
    set banned_until = case when p_status = 'suspended' then now() + interval '100 years' else null end
    where id = p_user_id;
end;
$$;

comment on function public.set_user_status(uuid, text) is
  'Suspend ou réactive un agent dans toute la gamme. Super admin, ou administrateur couvrant tous les rattachements de l''agent.';

-- Les trois rôles nommément (DEFAULT PRIVILEGES de Supabase), puis le seul
-- appelant légitime.
revoke all on function public.set_user_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_user_status(uuid, text) to authenticated;
