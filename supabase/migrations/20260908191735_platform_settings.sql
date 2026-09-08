-- Réglages de plateforme : UNE ligne, posée une fois par l'éditeur.
--
-- Ce qui vaut pour tous les clients à la fois, et qu'aucune collectivité ne
-- règle elle-même : la zone des sous-domaines fournis au portail usagers, la
-- cible CNAME d'un domaine personnalisé, le plafond IA posé à toute nouvelle
-- collectivité. Jusqu'ici ces valeurs n'existaient nulle part — le sous-domaine
-- était tapé à la main, le plafond absent (donc illimité), la cible DNS
-- inconnue de l'écran qui la demandait.
--
-- ⚠️ AUCUN SECRET N'Y VIT, et c'est ce qui autorise la lecture par tout
-- utilisateur authentifié : l'écran des domaines d'une collectivité doit
-- pouvoir afficher la cible CNAME. Le jour où un réglage sensible devrait y
-- entrer, il passe par une RPC, pas par une colonne de cette table.
--
-- Une ligne unique : `id boolean default true` + CHECK (id) — la forme la plus
-- simple qui interdise une seconde ligne sans séquence ni verrou.

create table public.platform_settings (
  id                        boolean primary key default true,
  portal_domain_suffix      text,
  portal_cname_target       text,
  default_ai_monthly_tokens bigint,
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.users(id) on delete set null,
  constraint platform_settings_singleton check (id),
  -- Même forme que `organization_domains_hostname_check` : le suffixe devient
  -- la fin d'un nom d'hôte, il doit en être un lui-même (deux labels au moins).
  constraint platform_settings_portal_domain_suffix_check check (
    portal_domain_suffix is null or (
      length(portal_domain_suffix) between 4 and 253
      and portal_domain_suffix ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    )
  ),
  constraint platform_settings_portal_cname_target_check check (
    portal_cname_target is null or (
      length(portal_cname_target) between 4 and 253
      and portal_cname_target ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    )
  ),
  constraint platform_settings_default_ai_monthly_tokens_check check (
    default_ai_monthly_tokens is null or default_ai_monthly_tokens > 0
  )
);

comment on table public.platform_settings is
  'Réglages de plateforme (ligne unique) : zone des sous-domaines fournis au portail, cible CNAME des domaines personnalisés, plafond IA par défaut d''une nouvelle collectivité. Aucun secret.';
comment on column public.platform_settings.portal_domain_suffix is
  'Zone DNS des sous-domaines fournis : une racine créée reçoit <slug>.<suffixe>. NULL = aucun sous-domaine attribué automatiquement.';
comment on column public.platform_settings.portal_cname_target is
  'Nom d''hôte vers lequel un domaine personnalisé doit pointer (CNAME). Affiché dans l''écran des domaines ; le Socle ne configure aucun DNS.';
comment on column public.platform_settings.default_ai_monthly_tokens is
  'Plafond mensuel de jetons posé à toute nouvelle racine (provision_root). NULL = aucun plafond posé, la collectivité reste « non décidée » jusqu''au geste du super administrateur.';

-- Même normalisation que les domaines : ce qu'on compare doit avoir la forme
-- qu'on stocke. `nullif` : une case vidée à l'écran vaut « pas de réglage ».
create or replace function public.normalize_platform_settings() returns trigger
    language plpgsql
    set search_path to 'public'
as $$
begin
  new.portal_domain_suffix := nullif(rtrim(lower(btrim(coalesce(new.portal_domain_suffix, ''))), '.'), '');
  new.portal_cname_target  := nullif(rtrim(lower(btrim(coalesce(new.portal_cname_target, ''))), '.'), '');
  return new;
end;
$$;

revoke all on function public.normalize_platform_settings() from public, anon, authenticated;

create trigger trg_normalize_platform_settings
  before insert or update on public.platform_settings
  for each row execute function public.normalize_platform_settings();

create trigger set_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- La ligne existe dès la migration : les lecteurs n'ont pas à gérer « pas
-- encore de réglages », seulement des colonnes nulles.
insert into public.platform_settings default values
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

create policy "read platform_settings" on public.platform_settings
  for select to authenticated using (true);

-- Pas d'INSERT ni de DELETE client : la ligne est née avec la migration et ne
-- disparaît pas. Seul le super administrateur la modifie.
create policy "update platform_settings" on public.platform_settings
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
