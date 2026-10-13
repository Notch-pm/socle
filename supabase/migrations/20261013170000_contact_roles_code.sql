-- Rôles de contact : un CODE stable, et le rôle « Interne ».
--
-- Le catalogue `contact_roles` est libre (nom saisi, propre à chaque racine) :
-- un consommateur ne peut ni s'y fier par identifiant (un par racine) ni par
-- nom (renommable, accentué). Clara a besoin de reconnaître deux catégories de
-- contacts — les ÉLUS et les contacts INTERNES (agents de la collectivité) —
-- pour les proposer comme destinataires d'un courrier reçu ou d'une tâche, et
-- comme expéditeurs d'un courrier sortant. D'où une colonne `code`, NULL pour
-- les rôles ordinaires, posée sur les rôles que la gamme reconnaît :
--   • `elu`      — le rôle « Élu » déjà seedé ;
--   • `interne`  — un rôle « Interne », créé ici. « Agent » N'EST PAS repris :
--     il sert aux relations (« agent de la Préfecture »), qui ne désignent pas
--     le personnel de la collectivité.
--
-- Le code est IMMUABLE une fois posé (trigger) ; le nom reste renommable — c'est
-- précisément ce que le code rend sans danger. La suppression reste permise
-- (la cascade depuis `organizations` doit passer) ; `provision_root` recrée.
-- Rejouable.

-- --------------------------------------------------------------------------
-- 1. La colonne
-- --------------------------------------------------------------------------
alter table public.contact_roles add column if not exists code text;

alter table public.contact_roles drop constraint if exists contact_roles_code_format;
alter table public.contact_roles add constraint contact_roles_code_format
  check (code is null or code ~ '^[a-z][a-z0-9_]*$');

create unique index if not exists contact_roles_org_code_unique
  on public.contact_roles (organization_id, code) where code is not null;

comment on column public.contact_roles.code is
  'Code machine stable d''un rôle reconnu par la gamme (elu, interne), NULL pour un rôle ordinaire. Immuable une fois posé ; le nom, lui, se renomme.';

-- --------------------------------------------------------------------------
-- 2. Code posé d'office à la création, immuable ensuite
-- --------------------------------------------------------------------------
-- Un rôle nommé « Élu » ou « Interne » (casse et accents indifférents) reçoit
-- son code à l'insertion s'il n'en porte pas : ainsi `provision_root` n'a rien
-- de plus à savoir, et une racine qui crée elle-même « Interne » est reconnue.
create or replace function public.contact_role_code_guard() returns trigger
    language plpgsql
    set search_path to 'public'
as $$
declare
  v_norm text;
begin
  if tg_op = 'INSERT' then
    if new.code is null then
      v_norm := lower(public.immutable_unaccent(btrim(new.name)));
      if v_norm = 'elu' then
        new.code := 'elu';
      elsif v_norm = 'interne' then
        new.code := 'interne';
      end if;
      -- Un code déjà pris dans la racine : le rôle naît ordinaire.
      if new.code is not null and exists (
        select 1 from public.contact_roles r
        where r.organization_id = new.organization_id and r.code = new.code
      ) then
        new.code := null;
      end if;
    end if;
    return new;
  end if;
  -- UPDATE : on peut poser un code sur un rôle qui n'en a pas, jamais le changer.
  if old.code is not null and new.code is distinct from old.code then
    raise exception 'Le code d''un rôle de contact (%) ne se modifie pas.', old.code
      using errcode = '22023';
  end if;
  return new;
end;
$$;

comment on function public.contact_role_code_guard() is
  'Pose le code elu/interne d''après le nom à la création ; interdit de changer un code posé.';

drop trigger if exists trg_contact_role_code_guard on public.contact_roles;
create trigger trg_contact_role_code_guard
  before insert or update on public.contact_roles
  for each row execute function public.contact_role_code_guard();

-- --------------------------------------------------------------------------
-- 3. Rattrapage de l'existant
-- --------------------------------------------------------------------------
update public.contact_roles r
set code = 'elu'
where r.code is null
  and lower(public.immutable_unaccent(btrim(r.name))) = 'elu'
  and not exists (
    select 1 from public.contact_roles x
    where x.organization_id = r.organization_id and x.code = 'elu'
  );

update public.contact_roles r
set code = 'interne'
where r.code is null
  and lower(public.immutable_unaccent(btrim(r.name))) = 'interne'
  and not exists (
    select 1 from public.contact_roles x
    where x.organization_id = r.organization_id and x.code = 'interne'
  );

-- « Interne » pour toute racine qui ne l'a pas (le trigger pose le code).
insert into public.contact_roles (organization_id, name)
select o.id, 'Interne'
from public.organizations o
where o.parent_id is null
  and not exists (
    select 1 from public.contact_roles r
    where r.organization_id = o.id and r.code = 'interne'
  )
on conflict (organization_id, lower(name)) do nothing;

-- --------------------------------------------------------------------------
-- 4. provision_root : « Interne » rejoint la liste
-- --------------------------------------------------------------------------
-- Corps repris à l'identique de 20260908191840_provision_root_organization.sql
-- (vérifié contre la définition en base le 2026-10-13) ; seule la liste (a)
-- change.
create or replace function public.provision_root(p_org_id uuid) returns jsonb
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
  v_org      public.organizations%rowtype;
  v_settings public.platform_settings%rowtype;
  v_roles    int := 0;
  v_count    int := 0;
  v_quota    boolean := false;
  v_domain   text := null;
  v_label    text;
  v_hostname text;
begin
  select * into v_org from public.organizations where id = p_org_id;
  if not found then
    raise exception 'Organisation introuvable.' using errcode = '23503';
  end if;
  if v_org.parent_id is not null then
    raise exception 'Seule une organisation principale (racine) se provisionne.' using errcode = '22023';
  end if;
  select * into v_settings from public.platform_settings where id = true;

  -- (a) Les rôles de contact — le seed du 2026-07-15, plus « Interne »
  -- (2026-10-13). Les codes elu/interne sont posés par trg_contact_role_code_guard.
  insert into public.contact_roles (organization_id, name)
  select v_org.id, r.name
  from (values
    ('Habitant'),
    ('Représentant d''entreprise'),
    ('Président d''association'),
    ('Élu'),
    ('Interne'),
    ('Agent'),
    ('Propriétaire'),
    ('Demandeur'),
    ('Bénéficiaire')
  ) as r(name)
  on conflict (organization_id, lower(name)) do nothing;
  get diagnostics v_roles = row_count;

  -- (b) Le plafond IA par défaut — seulement si la plateforme en a fixé un.
  if v_settings.default_ai_monthly_tokens is not null then
    insert into public.ai_usage_quotas (organization_id, monthly_limit_tokens)
    values (v_org.id, v_settings.default_ai_monthly_tokens)
    on conflict (organization_id, provider) do nothing;
    get diagnostics v_count = row_count;
    v_quota := v_count > 0;
  end if;

  -- (c) Le sous-domaine fourni — seulement si une zone est réglée et que le
  -- slug donne un label. Un hostname déjà pris (autre collectivité) ou refusé
  -- par la contrainte n'est pas une erreur : on avertit, on continue.
  if v_settings.portal_domain_suffix is not null then
    v_label := public.dns_label_from_slug(v_org.slug);
    if v_label is not null then
      v_hostname := v_label || '.' || v_settings.portal_domain_suffix;
      begin
        insert into public.organization_domains (organization_id, hostname, is_primary)
        values (
          v_org.id,
          v_hostname,
          not exists (
            select 1 from public.organization_domains d
            where d.organization_id = v_org.id and d.is_primary
          )
        )
        on conflict (hostname) do nothing;
        get diagnostics v_count = row_count;
        if v_count > 0 then v_domain := v_hostname; end if;
      exception when check_violation or unique_violation or string_data_right_truncation then
        raise warning 'provision_root : sous-domaine % non attribué à % (%)', v_hostname, v_org.id, sqlerrm;
      end;
    end if;
  end if;

  return jsonb_build_object('roles', v_roles, 'quota', v_quota, 'domain', v_domain);
end;
$$;

alter function public.provision_root(uuid) owner to postgres;
revoke all on function public.provision_root(uuid) from public, anon, authenticated;
