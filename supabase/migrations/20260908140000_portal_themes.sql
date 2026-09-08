-- Thème du site de démarches — l'apparence que chaque collectivité donne à son
-- portail : typographie, formes, densité, en-tête, accessibilité.
--
-- Table à part de `portal_pages`, et non une clé de plus dans la composition :
-- le thème vaut pour TOUT LE SITE (« appliqué à toutes les pages »), alors
-- qu'une page est une ligne `(organisation, slug)`. Le loger dans la page
-- d'accueil serait un mensonge le jour où « Contact » et « Mentions légales »
-- arriveront — et les déloger alors casserait un contrat public déjà servi.
--
-- Deux colonnes, même discipline que `portal_pages` : `draft` est ce que
-- l'éditeur enregistre automatiquement, `published` est ce que le portail sert,
-- et il ne bouge QUE sur un geste explicite. Sauvegarder n'est pas publier.
--
-- Pas de `slug` : il n'y a qu'un thème par collectivité, c'est tout son objet.
--
-- Le contrat JSON est défini par `src/features/portal/portalTheme.ts`. Il ne
-- porte AUCUNE couleur : celles-ci vivent dans la charte graphique
-- (`organizations.primary_color` / `secondary_color`) et n'ont pas à exister
-- deux fois.
--
-- Rattachement à une organisation principale uniquement, comme `portal_pages` :
-- c'est le site de la collectivité, pas celui d'un de ses services.

-- 1. Table
create table public.portal_themes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Thème en cours d'édition. Jamais nul : un thème existe avec ses défauts, ou
  -- n'existe pas.
  draft jsonb not null,
  -- Dernier thème publié. Nul tant que la collectivité n'a rien publié : le
  -- portail applique alors les défauts, qu'il connaît.
  published jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Une publication porte toujours sa date, et réciproquement.
  constraint portal_themes_published_consistent check (
    (published is null) = (published_at is null)
  )
);

-- Un seul thème par collectivité.
create unique index portal_themes_org_unique
  on public.portal_themes (organization_id);

create trigger set_portal_themes_updated_at
  before update on public.portal_themes
  for each row execute function public.set_updated_at();

-- 2. Rattachement à une racine uniquement (motif enforce_portal_page_root_org).
create or replace function public.enforce_portal_theme_root_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent uuid;
begin
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Un theme de portail doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

-- Les trois rôles, pas seulement `public` : Supabase pose des DEFAULT PRIVILEGES
-- qui accordent EXECUTE nommément à anon/authenticated (cf. migration
-- branding_functions_revoke_execute). Sans effet sur le déclenchement du trigger.
revoke execute on function public.enforce_portal_theme_root_org()
  from public, anon, authenticated;

create trigger trg_enforce_portal_theme_root_org
  before insert or update on public.portal_themes
  for each row execute function public.enforce_portal_theme_root_org();

-- 3. RLS : calqué sur `portal_pages`. Lecture pour les membres de la racine,
--    écriture pour les admins d'org (is_org_admin court-circuite déjà le super
--    admin). Le portail lira `published` par l'API publique, en service role
--    hors RLS, borné au périmètre de la clé.
alter table public.portal_themes enable row level security;

create policy "read portal_themes" on public.portal_themes
  for select to authenticated using (has_org_access(organization_id));

create policy "write portal_themes" on public.portal_themes
  for all to authenticated
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

comment on table public.portal_themes is
  'Theme du site de demarches d''une collectivite (typographie, formes, densite, en-tete, accessibilite). draft = en cours d''edition (sauvegarde automatique), published = servi par le portail (geste explicite). Ne porte aucune couleur : celles-ci vivent dans la charte graphique de l''organisation. Contrat JSON : src/features/portal/portalTheme.ts.';
comment on column public.portal_themes.draft is
  'Theme en cours d''edition. Ecrit automatiquement par l''editeur ; jamais servi au public.';
comment on column public.portal_themes.published is
  'Theme publie, tel que le portail le sert. Ne change que par une publication explicite. Nul tant que rien n''a ete publie : le portail applique alors ses defauts.';
