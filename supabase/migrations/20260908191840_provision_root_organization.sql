-- Provisioning d'une organisation principale (racine) : ce que le Socle pose
-- de lui-même quand un client arrive.
--
-- Jusqu'ici, créer une racine laissait trois choses à faire à la main, et
-- rien ne le disait :
--   • les rôles de contact — seedés UNE fois le 2026-07-15 pour les racines
--     existantes, jamais rejoués : `contacts-api` refusait tout rôle à un
--     client récent, catalogue vide ;
--   • le plafond IA — absent, donc ILLIMITÉ, jusqu'au geste du super admin ;
--   • le sous-domaine du portail — tapé à la main, sans zone convenue.
--
-- Un trigger AFTER INSERT sur `organizations` fait les trois, quel que soit le
-- chemin de création (UI, SQL, import). Idempotent (`on conflict do nothing`)
-- et JAMAIS BLOQUANT : la création de l'organisation est l'acte principal, le
-- provisioning se rejoue depuis la page plateforme (`provision_existing_roots`).
--
-- ⚠️ Le plafond s'insère DIRECTEMENT, pas par `set_ai_usage_quota` : sa garde
-- `is_super_admin()` repose sur `auth.uid()`, nul dans un trigger ou une
-- migration. La fonction est SECURITY DEFINER, propriétaire postgres, donc
-- hors RLS (motif `recalculate_contact_quartiers`), EXECUTE révoqué.

-- --------------------------------------------------------------------------
-- 1. Un label DNS à partir d'un slug
-- --------------------------------------------------------------------------
-- Le slug n'est PAS sûr pour un nom d'hôte : « Sète » devient `s-te` dans le
-- dialogue, deux formulaires enregistrent la saisie brute, rien ne borne à 63
-- caractères. On dérive ici, et on ne fait jamais échouer l'insert de l'org
-- pour un slug inutilisable — on n'attribue simplement pas de sous-domaine.
-- Miroir TS : `dnsLabelFromSlug` (organizationDomains.ts), tests jumeaux.
create or replace function public.dns_label_from_slug(p_slug text) returns text
    language sql immutable
    set search_path to 'public'
as $$
  select nullif(
    btrim(
      left(
        btrim(
          regexp_replace(lower(public.immutable_unaccent(coalesce(p_slug, ''))), '[^a-z0-9]+', '-', 'g'),
          '-'
        ),
        63
      ),
      '-'
    ),
    ''
  );
$$;

comment on function public.dns_label_from_slug(text) is
  'Label DNS dérivé d''un slug : sans accents, minuscules, [a-z0-9-], 63 caractères max, NULL si rien ne reste.';

-- --------------------------------------------------------------------------
-- 2. Le provisioning d'une racine
-- --------------------------------------------------------------------------
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

  -- (a) Les rôles de contact — la même liste que le seed du 2026-07-15.
  insert into public.contact_roles (organization_id, name)
  select v_org.id, r.name
  from (values
    ('Habitant'),
    ('Représentant d''entreprise'),
    ('Président d''association'),
    ('Élu'),
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

comment on function public.provision_root(uuid) is
  'Pose sur une racine ce qu''un client attend d''emblée : rôles de contact, plafond IA par défaut, sous-domaine fourni. Idempotent. Appelée par trigger à la création et par provision_existing_roots.';

alter function public.provision_root(uuid) owner to postgres;
revoke all on function public.provision_root(uuid) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. Le trigger
-- --------------------------------------------------------------------------
-- `update of parent_id` : promouvoir un service en racine est une
-- réorganisation légitime (motif `enforce_internal_service_not_root`), et la
-- nouvelle racine a les mêmes besoins qu'une racine créée. Une racine qui
-- reste racine (même colonne réécrite) ne rejoue rien.
--
-- ⚠️ `exception when others` ICI, et nulle part ailleurs : l'insert de
-- l'organisation ne doit jamais échouer à cause du provisioning. L'avertissement
-- laisse une trace, et la page plateforme permet de rejouer.
create or replace function public.provision_root_organization() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
begin
  if new.parent_id is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.parent_id is null then
    return new;
  end if;
  begin
    perform public.provision_root(new.id);
  exception when others then
    raise warning 'provision_root_organization : provisioning de % reporté (%)', new.id, sqlerrm;
  end;
  return new;
end;
$$;

alter function public.provision_root_organization() owner to postgres;
revoke all on function public.provision_root_organization() from public, anon, authenticated;

drop trigger if exists provision_root_organization on public.organizations;
create trigger provision_root_organization
  after insert or update of parent_id on public.organizations
  for each row execute function public.provision_root_organization();

-- --------------------------------------------------------------------------
-- 4. Rejouer sur l'existant — depuis la page plateforme
-- --------------------------------------------------------------------------
-- Un backfill en migration serait un no-op : `platform_settings` naît vide.
-- C'est un bouton, pressé APRÈS avoir saisi la zone et le plafond par défaut.
-- Garde `is_super_admin()` dans la fonction (motif `set_ai_usage_quota`).
create or replace function public.provision_existing_roots() returns jsonb
    language plpgsql security definer
    set search_path to 'public'
as $$
declare
  r         record;
  v         jsonb;
  v_orgs    int := 0;
  v_roles   int := 0;
  v_quotas  int := 0;
  v_domains int := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Le provisioning des organisations est réservé au super administrateur.'
      using errcode = '42501';
  end if;
  for r in select id from public.organizations where parent_id is null order by created_at loop
    v := public.provision_root(r.id);
    v_orgs := v_orgs + 1;
    v_roles := v_roles + coalesce((v->>'roles')::int, 0);
    if coalesce((v->>'quota')::boolean, false) then v_quotas := v_quotas + 1; end if;
    if v->>'domain' is not null then v_domains := v_domains + 1; end if;
  end loop;
  return jsonb_build_object(
    'organizations', v_orgs, 'roles', v_roles, 'quotas', v_quotas, 'domains', v_domains
  );
end;
$$;

comment on function public.provision_existing_roots() is
  'Rejoue provision_root sur toutes les racines (idempotent). Super administrateur uniquement. Rend le nombre de rôles, plafonds et sous-domaines ajoutés.';

alter function public.provision_existing_roots() owner to postgres;
revoke all on function public.provision_existing_roots() from public, anon;
grant execute on function public.provision_existing_roots() to authenticated;

-- --------------------------------------------------------------------------
-- 5. Les racines existantes reçoivent au moins leurs rôles
-- --------------------------------------------------------------------------
-- Zone et plafond par défaut sont encore nuls : seul (a) agit. Les racines du
-- seed historique n'y gagnent rien (on conflict), celles créées depuis
-- retrouvent le même catalogue que les autres.
select public.provision_root(o.id) from public.organizations o where o.parent_id is null;
