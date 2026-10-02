-- Catalogue des intégrations partenaires, et leur configuration par collectivité.
--
-- Deux choses distinctes, jamais mélangées :
--   • le CATALOGUE — ce que propose Edilumen : un partenaire (Arpège), le type
--     de connexion (application GRU), les applications de la gamme concernées
--     (Clara). Aucune donnée de collectivité, aucun secret.
--   • la CONFIGURATION — ce qu'une collectivité (racine) en fait : URL, identifiants,
--     activation, résultat du dernier test de connexion.
--
-- Le Socle CONFIGURE, l'application EXÉCUTE : la création de demande, la
-- synchronisation et le suivi de statut restent dans Clara (et Ariane). Le Socle
-- ne fait qu'un test de connexion (`integration-test`) pour afficher un statut
-- fiable. Lot 1 : aucune application ne lit encore cette configuration — la
-- route public-api et la bascule de Clara sont un second lot (roadmap).
--
-- ⚠️ SECRETS : une table à part, `organization_integration_secrets`, RLS sans
-- AUCUNE policy et privilèges révoqués pour anon/authenticated. Aucun navigateur
-- ne lit jamais un secret, pas même celui du super administrateur — à la
-- différence de `smtp_settings` (modèle à ne pas recopier) et des tables
-- `organization_integrations` de Clara et d'Ariane. Écriture par RPC, lecture
-- par le service role seul.

-- --------------------------------------------------------------------------
-- 1. Types d'intégration — extensibles par simple insertion
-- --------------------------------------------------------------------------
create table public.integration_types (
  id         text primary key,
  name       text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  -- Même forme que `applications.id` : un code de contrat, pas un libellé.
  constraint integration_types_id_format check (id ~ '^[a-z][a-z0-9_]{1,63}$')
);

comment on table public.integration_types is
  'Types d''intégration partenaire (parapheur, signature, GRU…). `id` = code stable (contrat), `name` = libellé français. Ajouter un type = insérer une ligne.';

insert into public.integration_types (id, name, position) values
  ('parapheur_electronique',          'Parapheur électronique',             10),
  ('signature_electronique',          'Signature électronique',             20),
  ('application_services_techniques', 'Application de services techniques', 30),
  ('application_gru',                 'Application GRU',                    40)
on conflict (id) do nothing;

alter table public.integration_types enable row level security;

create policy "read integration_types" on public.integration_types
  for select to authenticated using (true);

create policy "write integration_types" on public.integration_types
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- --------------------------------------------------------------------------
-- 2. Le catalogue
-- --------------------------------------------------------------------------
-- Identité du partenaire et offre de connexion dans UNE table : un partenaire,
-- une offre, aujourd'hui. Le jour où un éditeur en proposera deux, on extraira
-- `partners` sans casser le contrat, qui sort par `slug`.
create table public.integrations (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text not null default '',
  logo_url     text,
  type_id      text not null references public.integration_types(id),
  -- Clé de l'adaptateur dans le code (front ET edge). NULL = pas encore
  -- configurable : la carte s'affiche « Bientôt disponible ».
  adapter      text,
  -- Proposée par Edilumen. `false` retire l'offre sans effacer les
  -- configurations existantes (le réglage gouverne l'usage, pas la donnée).
  is_available boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint integrations_slug_format check (slug ~ '^[a-z][a-z0-9-]{1,63}$'),
  constraint integrations_name_not_blank check (btrim(name) <> ''),
  constraint integrations_description_length check (char_length(description) <= 1000),
  -- Même règle que la charte : URL https absolue, sinon rien.
  constraint integrations_logo_url_https check (logo_url is null or logo_url ~ '^https://[^\s]+$'),
  constraint integrations_adapter_format check (adapter is null or adapter ~ '^[a-z][a-z0-9_]{1,63}$')
);

comment on table public.integrations is
  'Catalogue des intégrations partenaires proposées par Edilumen. Aucune donnée de collectivité ni aucun secret : voir organization_integrations.';
comment on column public.integrations.adapter is
  'Clé de l''adaptateur (src/features/integrations/adapters.ts et supabase/functions/integration-test/_shared/adapters.ts). NULL = non configurable (bientôt disponible).';

create trigger set_integrations_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();

alter table public.integrations enable row level security;

create policy "read integrations" on public.integrations
  for select to authenticated using (true);

create policy "write integrations" on public.integrations
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Applications de la gamme concernées — plusieurs par intégration.
create table public.integration_applications (
  integration_id uuid not null references public.integrations(id) on delete cascade,
  application_id text not null references public.applications(id) on delete cascade,
  primary key (integration_id, application_id)
);

comment on table public.integration_applications is
  'Applications de la gamme concernées par une intégration partenaire (registre `applications`).';

alter table public.integration_applications enable row level security;

create policy "read integration_applications" on public.integration_applications
  for select to authenticated using (true);

create policy "write integration_applications" on public.integration_applications
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Arpège : plateforme GRU / démarches en ligne « Espace Citoyens »
-- (Interop.Api v2, authentification Hawk). Connecteur existant dans Clara.
-- Seule intégration posée : pas de partenaire fictif.
insert into public.integrations (slug, name, description, type_id, adapter)
values (
  'arpege',
  'Arpège',
  'Connexion entre Clara et la plateforme de démarches en ligne Arpège (Espace Citoyens) : création de demandes à partir des courriers, pièces jointes comprises, et suivi de leur statut.',
  'application_gru',
  'arpege'
)
on conflict (slug) do nothing;

insert into public.integration_applications (integration_id, application_id)
select i.id, 'clara' from public.integrations i where i.slug = 'arpege'
on conflict do nothing;

-- --------------------------------------------------------------------------
-- 3. Configuration par collectivité (racine)
-- --------------------------------------------------------------------------
create table public.organization_integrations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_id  uuid not null references public.integrations(id) on delete cascade,
  -- Paramètres NON secrets, clés déclarées par l'adaptateur.
  settings        jsonb not null default '{}'::jsonb,
  is_active       boolean not null default false,
  last_tested_at  timestamptz,
  last_test_ok    boolean,
  last_test_error text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, integration_id),
  constraint organization_integrations_settings_object check (jsonb_typeof(settings) = 'object'),
  constraint organization_integrations_test_error_length check (char_length(last_test_error) <= 500)
);

comment on table public.organization_integrations is
  'Configuration d''une intégration partenaire pour une collectivité (racine) : paramètres non secrets, activation, dernier test. Secrets dans organization_integration_secrets. Super admin seul.';
comment on column public.organization_integrations.last_test_error is
  'Message court du dernier test en échec. Jamais de secret (écrit par la fonction integration-test).';

create trigger set_organization_integrations_updated_at
  before update on public.organization_integrations
  for each row execute function public.set_updated_at();

-- Une intégration est une affaire de collectivité — motif
-- `enforce_organization_application_root_org`.
create or replace function public.enforce_organization_integration_root_org() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
  parent uuid;
begin
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Une intégration se configure pour une organisation principale (racine).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function public.enforce_organization_integration_root_org() owner to postgres;
revoke all on function public.enforce_organization_integration_root_org() from public, anon, authenticated;

create trigger trg_enforce_organization_integration_root_org
  before insert or update of organization_id on public.organization_integrations
  for each row execute function public.enforce_organization_integration_root_org();

-- Le test de connexion vaut pour une configuration donnée :
--   • modifier les paramètres l'invalide (le résultat ne décrit plus rien) ;
--   • activer exige un test réussi sur la configuration en place — c'est la
--     règle de Clara (`canActivate`), tenue ici par la base et non par l'écran.
-- Le service role (fonction integration-test) écrit le résultat du test.
create or replace function public.guard_organization_integration_test() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' and new.settings is distinct from old.settings then
    new.last_tested_at := null;
    new.last_test_ok := null;
    new.last_test_error := null;
  end if;
  if new.is_active
     and (tg_op = 'INSERT' or not old.is_active)
     and new.last_test_ok is not true then
    raise exception 'Testez la connexion avec succès avant d''activer l''intégration.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function public.guard_organization_integration_test() owner to postgres;
revoke all on function public.guard_organization_integration_test() from public, anon, authenticated;

create trigger trg_guard_organization_integration_test
  before insert or update on public.organization_integrations
  for each row execute function public.guard_organization_integration_test();

alter table public.organization_integrations enable row level security;

-- Super administrateur seul, en lecture comme en écriture : c'est la règle de
-- Clara (verrou du 2026-07-23). Un administrateur de collectivité ne voit pas
-- cette table — encore moins celle d'une autre collectivité.
create policy "super admin organization_integrations" on public.organization_integrations
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- --------------------------------------------------------------------------
-- 4. Secrets — illisibles par tout client
-- --------------------------------------------------------------------------
create table public.organization_integration_secrets (
  organization_integration_id uuid primary key
    references public.organization_integrations(id) on delete cascade,
  secrets    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint organization_integration_secrets_object check (jsonb_typeof(secrets) = 'object')
);

comment on table public.organization_integration_secrets is
  'Secrets d''une intégration (clé → valeur). Aucune policy, privilèges révoqués : lisible par le service role seul. Écriture par set_organization_integration_secrets ; présence par organization_integration_secret_keys.';

create trigger set_organization_integration_secrets_updated_at
  before update on public.organization_integration_secrets
  for each row execute function public.set_updated_at();

alter table public.organization_integration_secrets enable row level security;
-- RLS sans policy suffit à tout refuser ; on retire AUSSI les privilèges, pour
-- que l'erreur soit franche (42501) plutôt qu'un résultat vide trompeur.
revoke all on table public.organization_integration_secrets from anon, authenticated;

-- Écrit un CORRECTIF de secrets : valeur non vide = remplace, chaîne vide =
-- conserve (un champ secret n'est jamais prérempli, le laisser vide ne doit
-- rien effacer), `null` = efface. Le test précédent est invalidé dès qu'une
-- valeur change.
create or replace function public.set_organization_integration_secrets(
  p_organization_integration_id uuid,
  p_patch jsonb
) returns void
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
  current_secrets jsonb;
  next_secrets jsonb;
  entry record;
begin
  if not public.is_super_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Correctif de secrets invalide.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organization_integrations where id = p_organization_integration_id) then
    raise exception 'Intégration introuvable.' using errcode = 'P0002';
  end if;

  select secrets into current_secrets
  from public.organization_integration_secrets
  where organization_integration_id = p_organization_integration_id;
  next_secrets := coalesce(current_secrets, '{}'::jsonb);

  for entry in select key, value from jsonb_each(p_patch) loop
    if entry.key !~ '^[a-z][a-z0-9_]{0,63}$' then
      raise exception 'Clé de secret invalide.' using errcode = '22023';
    end if;
    if jsonb_typeof(entry.value) = 'null' then
      next_secrets := next_secrets - entry.key;
    elsif jsonb_typeof(entry.value) = 'string' then
      if char_length(entry.value #>> '{}') > 4096 then
        raise exception 'Secret trop long.' using errcode = '22023';
      end if;
      if entry.value #>> '{}' <> '' then
        next_secrets := jsonb_set(next_secrets, array[entry.key], entry.value);
      end if;
    else
      raise exception 'Un secret est une chaîne.' using errcode = '22023';
    end if;
  end loop;

  if next_secrets is distinct from coalesce(current_secrets, '{}'::jsonb) then
    insert into public.organization_integration_secrets (organization_integration_id, secrets)
    values (p_organization_integration_id, next_secrets)
    on conflict (organization_integration_id) do update set secrets = excluded.secrets;

    update public.organization_integrations
    set last_tested_at = null, last_test_ok = null, last_test_error = null
    where id = p_organization_integration_id;
  end if;
end;
$$;

alter function public.set_organization_integration_secrets(uuid, jsonb) owner to postgres;
revoke all on function public.set_organization_integration_secrets(uuid, jsonb) from public, anon;
grant execute on function public.set_organization_integration_secrets(uuid, jsonb) to authenticated;

-- La PRÉSENCE des secrets d'une collectivité, jamais leur valeur : de quoi
-- dire « renseigné — laisser vide pour conserver » et calculer le statut.
create or replace function public.organization_integration_secret_keys(p_organization_id uuid)
returns table (organization_integration_id uuid, secret_keys text[])
    language plpgsql stable security definer
    set search_path to 'public'
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  return query
    select s.organization_integration_id,
           coalesce(
             array(
               select k from jsonb_each_text(s.secrets) as e(k, v)
               where v <> '' order by k
             ),
             '{}'::text[]
           )
    from public.organization_integration_secrets s
    join public.organization_integrations oi on oi.id = s.organization_integration_id
    where oi.organization_id = p_organization_id;
end;
$$;

alter function public.organization_integration_secret_keys(uuid) owner to postgres;
revoke all on function public.organization_integration_secret_keys(uuid) from public, anon;
grant execute on function public.organization_integration_secret_keys(uuid) to authenticated;
