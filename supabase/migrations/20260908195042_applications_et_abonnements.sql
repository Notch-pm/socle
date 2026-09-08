-- Applications de la gamme et abonnements des collectivités.
--
-- Jusqu'ici une clé PLATEFORME (organization_id NULL) voyait TOUTES les
-- organisations, et `consumer` était un texte libre : rien au Socle ne disait
-- quelles collectivités une application servait, ni même quelles applications
-- existaient. L'isolation par tenant vivait dans le code de chaque application
-- (risque R-M4 noté par Iris), et une faute de frappe créait un consommateur
-- fantôme dans le journal IA.
--
-- Désormais :
--   • `applications` — le REGISTRE : nora, iris, clara, socle. `consumer` de
--     `api_keys` y devient une clé étrangère.
--   • `organization_applications` — l'ABONNEMENT : quelles applications une
--     collectivité (racine) a souscrites. Coché par le super administrateur sur
--     la fiche du client ; c'est le seul geste d'onboarding côté clés.
--   • `application_scope_ids(app)` — le PÉRIMÈTRE d'une clé plateforme : les
--     sous-arbres des racines abonnées à son application. Une clé de scope
--     `plateforme` (le Socle lui-même) voit tout.
--
-- Une clé par application, émise une fois, posée une fois dans son projet :
-- plus aucun secret ne circule à l'arrivée d'un client. Et une application
-- compromise ne lit que ses clients.
--
-- ⚠️ RUPTURE pour les clés plateforme (contrat 1.18.0) : leur périmètre n'est
-- plus « tout », et une clé plateforme sans application est refusée. Rien
-- n'est en production ; les racines existantes sont abonnées à toutes les
-- applications par cette migration (aucune régression le jour du déploiement),
-- les suivantes sont opt-in.

-- --------------------------------------------------------------------------
-- 1. Le registre
-- --------------------------------------------------------------------------
create table public.applications (
  id         text primary key,
  name       text not null,
  scope      text not null default 'abonnement',
  created_at timestamptz not null default now(),
  -- Même forme que `api_keys_consumer_format` : c'est la même valeur.
  constraint applications_id_format check (id ~ '^[a-z][a-z0-9_-]{1,31}$'),
  constraint applications_scope_check check (scope in ('abonnement', 'plateforme'))
);

comment on table public.applications is
  'Registre des applications qui consomment le Socle (nora, iris, clara, socle…). `api_keys.consumer` y pointe. `scope` : abonnement (ne voit que les racines abonnées) ou plateforme (voit tout — le Socle lui-même).';
comment on column public.applications.scope is
  'abonnement = le périmètre d''une clé plateforme est la liste des racines abonnées (organization_applications) ; plateforme = toutes les organisations, réservé au Socle.';

insert into public.applications (id, name, scope) values
  ('nora',  'Nora — portail usagers',        'abonnement'),
  ('iris',  'Iris — gestion des demandes',   'abonnement'),
  ('clara', 'Clara — gestion de courrier',   'abonnement'),
  ('socle', 'Socle — traduction automatique', 'plateforme')
on conflict (id) do nothing;

-- La clé de traduction avait été créée sous « socle-traduction ». C'est le
-- Socle, et la doc (operations.md) le nomme `socle` : on aligne. Le journal
-- IA garde ses lignes passées sous l'ancien nom (colonne propre), les
-- suivantes s'imputent à `socle`.
update public.api_keys set consumer = 'socle' where consumer = 'socle-traduction';

-- Garde : tout consommateur encore inconnu devient une application, plutôt
-- que de faire échouer la clé étrangère. Aucun attendu aujourd'hui.
insert into public.applications (id, name, scope)
select distinct k.consumer, k.consumer, 'abonnement'
from public.api_keys k
where k.consumer is not null
on conflict (id) do nothing;

alter table public.api_keys
  add constraint api_keys_consumer_fkey
  foreign key (consumer) references public.applications(id);

-- Une clé plateforme vivante porte une application : sans elle, son périmètre
-- ne se calcule pas. Une clé RÉVOQUÉE est dispensée — elle est morte, et les
-- clés plateforme d'avant le registre le sont toutes.
alter table public.api_keys
  add constraint api_keys_platform_requires_consumer
  check (organization_id is not null or consumer is not null or revoked_at is not null);

-- Les quatre scopes que les fonctions connaissent. Un cinquième s'ajoute ici
-- ET dans les fonctions — jamais dans l'UI seule.
alter table public.api_keys
  add constraint api_keys_scopes_known
  check (scopes <@ array['read', 'contacts', 'smtp', 'ai']::text[]);

alter table public.applications enable row level security;

-- Lisible par tout utilisateur authentifié : la fiche d'une collectivité
-- affiche ses applications, et le dialogue de clé en propose la liste.
create policy "read applications" on public.applications
  for select to authenticated using (true);

create policy "write applications" on public.applications
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- --------------------------------------------------------------------------
-- 2. L'abonnement
-- --------------------------------------------------------------------------
create table public.organization_applications (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id  text not null references public.applications(id) on delete cascade,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.users(id) on delete set null,
  primary key (organization_id, application_id)
);

comment on table public.organization_applications is
  'Applications souscrites par une collectivité (organisation principale). Détermine le périmètre des clés plateforme de chaque application. Écrit par le super administrateur seul.';

-- Une souscription est une affaire de collectivité — motif `enforce_api_key_root_org`.
create or replace function public.enforce_organization_application_root_org() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
  parent uuid;
begin
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Une application se souscrit pour une organisation principale (racine).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function public.enforce_organization_application_root_org() owner to postgres;
revoke all on function public.enforce_organization_application_root_org() from public, anon, authenticated;

create trigger trg_enforce_organization_application_root_org
  before insert or update of organization_id on public.organization_applications
  for each row execute function public.enforce_organization_application_root_org();

alter table public.organization_applications enable row level security;

create policy "read organization_applications" on public.organization_applications
  for select to authenticated
  using (public.has_org_access(organization_id) or public.is_admin_of_self_or_ancestor(organization_id));

-- Souscrire est une décision commerciale : le super administrateur seul.
create policy "insert organization_applications" on public.organization_applications
  for insert to authenticated
  with check (public.is_super_admin());

create policy "delete organization_applications" on public.organization_applications
  for delete to authenticated
  using (public.is_super_admin());

-- Transition : les collectivités déjà servies restent servies. Le périmètre
-- des clés plateforme se réduit aux abonnées — qui sont donc, ce jour, toutes
-- les racines existantes. Les racines créées ensuite sont opt-in.
insert into public.organization_applications (organization_id, application_id)
select o.id, a.id
from public.organizations o
cross join public.applications a
where o.parent_id is null and a.scope = 'abonnement'
on conflict do nothing;

-- --------------------------------------------------------------------------
-- 3. Le périmètre d'une clé plateforme
-- --------------------------------------------------------------------------
-- SECURITY INVOKER, EXECUTE réservé au service role (motif `org_subtree_ids`,
-- migration `org_subtree_ids_revoke_execute`) : seules les edge functions
-- calculent un périmètre. Une application inconnue ne voit rien.
create or replace function public.application_scope_ids(p_application text) returns uuid[]
    language plpgsql stable
    set search_path to 'public'
as $$
declare
  v_scope text;
  v_ids   uuid[];
begin
  select a.scope into v_scope from public.applications a where a.id = p_application;
  if v_scope is null then
    return '{}'::uuid[];
  end if;
  if v_scope = 'plateforme' then
    select coalesce(array_agg(o.id), '{}'::uuid[]) into v_ids from public.organizations o;
    return v_ids;
  end if;
  select coalesce(array_agg(distinct s), '{}'::uuid[]) into v_ids
  from public.organization_applications oa
  cross join lateral unnest(public.org_subtree_ids(oa.organization_id)) as s
  where oa.application_id = p_application;
  return v_ids;
end;
$$;

comment on function public.application_scope_ids(text) is
  'Périmètre d''une clé plateforme : toutes les organisations pour une application de scope plateforme, les sous-arbres des racines abonnées sinon. Service role uniquement.';

alter function public.application_scope_ids(text) owner to postgres;
revoke all on function public.application_scope_ids(text) from public, anon, authenticated;
grant execute on function public.application_scope_ids(text) to service_role;

-- --------------------------------------------------------------------------
-- 4. La check-list apprend les applications
-- --------------------------------------------------------------------------
create or replace function public.root_onboarding_status(p_org_id uuid) returns jsonb
    language plpgsql stable security definer
    set search_path to 'public'
as $$
declare
  v_org     public.organizations%rowtype;
  v_subtree uuid[];
begin
  if not (public.is_super_admin() or public.is_admin_of_self_or_ancestor(p_org_id)) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  select * into v_org from public.organizations where id = p_org_id;
  if not found then
    raise exception 'Organisation introuvable.' using errcode = '23503';
  end if;
  if v_org.parent_id is not null then
    raise exception 'La mise en service se lit sur une organisation principale (racine).'
      using errcode = '22023';
  end if;
  v_subtree := public.org_subtree_ids(p_org_id);

  return jsonb_build_object(
    'smtp_configured', exists (select 1 from public.resolve_smtp_settings(p_org_id)),
    'admin_count', (
      select count(*) from public.user_organizations uo
      where uo.organization_id = p_org_id and uo.role = 'admin'
    ),
    'application_count', (
      select count(*) from public.organization_applications oa where oa.organization_id = p_org_id
    ),
    'category_count', (
      select count(*) from public.categories c where c.organization_id = p_org_id
    ),
    'procedure_count', (
      select count(*) from public.procedures p where p.organization_id = p_org_id
    ),
    'procedure_production_count', (
      select count(*) from public.procedures p
      where p.organization_id = p_org_id and p.status = 'production'
    ),
    'activation_count', (
      select count(*) from public.organization_procedures op
      where op.organization_id = any (v_subtree) and op.is_enabled
    ),
    'domain_count', (
      select count(*) from public.organization_domains d
      where d.organization_id = any (v_subtree)
    ),
    'portal_published', exists (
      select 1 from public.portal_pages pp
      where pp.organization_id = p_org_id and pp.slug = 'accueil' and pp.published is not null
    ),
    'ai_quota_decided', exists (
      select 1 from public.ai_usage_quotas q
      where q.organization_id = p_org_id and q.provider = '__global__'
    ),
    'ai_quota_active', exists (
      select 1 from public.ai_usage_quotas q
      where q.organization_id = p_org_id and q.provider = '__global__' and q.is_active
    ),
    'logo_present', v_org.logo_url is not null,
    'contact_role_count', (
      select count(*) from public.contact_roles cr where cr.organization_id = p_org_id
    )
  );
end;
$$;
