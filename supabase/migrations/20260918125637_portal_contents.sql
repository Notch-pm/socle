-- Contenus du site de démarches — les pages de TEXTE qu'une collectivité écrit
-- pour son portail, à côté de la page d'accueil composée. Première d'entre
-- elles : la DÉCLARATION D'ACCESSIBILITÉ (RGAA, article 47 de la loi du
-- 11 février 2005), vers laquelle mène la mention du pied de page.
--
-- ⚠️ CE N'EST PAS UNE `portal_pages` DE PLUS. Une page du portail est une
-- COMPOSITION — une liste de blocs, un schéma versionné que `parsePortalPage`
-- refuse s'il ne le reconnaît pas. Un contenu est UN TEXTE long (Markdown).
-- Les loger dans la même table ferait coexister deux formes de JSON sous une
-- même colonne, et un parseur qui lirait la mauvaise ferait retomber une page
-- d'accueil sur ses défauts.
--
-- ⚠️ NI UNE CLÉ DU THÈME : le thème dit comment peindre, il est fait de valeurs
-- énumérées. La MENTION d'accessibilité (une phrase, un interrupteur, un lien)
-- y reste — c'est ce qui s'affiche au pied de chaque page ; la DÉCLARATION
-- elle-même, qui peut faire trois écrans, vit ici.
--
-- Deux colonnes, même discipline que `portal_pages` et `portal_themes` :
-- `draft` est ce que l'éditeur enregistre automatiquement, `published` ce que
-- le portail sert, et il ne bouge QUE sur un geste explicite (« Publier »,
-- qui publie le site entier : composition, thème ET contenus).
--
-- `slug` désigne le contenu : `accessibilite` aujourd'hui. La base en valide
-- la FORME, pas la liste — motif `enabled_languages` : le catalogue des
-- contenus vit dans le code (`src/features/portal/portalContent.ts`), et un
-- contenu de plus (mentions légales…) ne doit pas demander une migration.
--
-- Rattachement à une organisation principale uniquement, comme les deux autres
-- tables du portail : c'est le site de la collectivité.

-- 1. Table
create table public.portal_contents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  -- Contenu en cours d'édition. Jamais nul : un contenu existe (vide), ou
  -- n'existe pas.
  draft jsonb not null,
  -- Dernier contenu publié. Nul tant que rien n'a été publié : le portail
  -- n'a alors rien à servir (404), et la mention ne porte pas de lien.
  published jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint portal_contents_slug_form check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 64
  ),
  constraint portal_contents_draft_object check (jsonb_typeof(draft) = 'object'),
  constraint portal_contents_published_object check (
    published is null or jsonb_typeof(published) = 'object'
  ),
  -- Un garde-fou de taille, pas une règle métier : le parseur borne le texte à
  -- 50 000 caractères ; la base refuse ce qu'aucun écran ne peut produire.
  constraint portal_contents_draft_size check (length(draft::text) <= 200000),
  constraint portal_contents_published_size check (
    published is null or length(published::text) <= 200000
  ),
  -- Une publication porte toujours sa date, et réciproquement.
  constraint portal_contents_published_consistent check (
    (published is null) = (published_at is null)
  )
);

-- Un contenu de chaque sorte par collectivité.
create unique index portal_contents_org_slug_unique
  on public.portal_contents (organization_id, slug);

create trigger set_portal_contents_updated_at
  before update on public.portal_contents
  for each row execute function public.set_updated_at();

-- 2. Rattachement à une racine uniquement (motif enforce_portal_theme_root_org).
create or replace function public.enforce_portal_content_root_org()
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
    raise exception 'Un contenu de portail doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

-- Les trois rôles, pas seulement `public` : Supabase pose des DEFAULT PRIVILEGES
-- qui accordent EXECUTE nommément à anon/authenticated (cf. migration
-- branding_functions_revoke_execute). Sans effet sur le déclenchement du trigger.
revoke execute on function public.enforce_portal_content_root_org()
  from public, anon, authenticated;

create trigger trg_enforce_portal_content_root_org
  before insert or update on public.portal_contents
  for each row execute function public.enforce_portal_content_root_org();

-- 3. RLS : calqué sur `portal_themes`. Lecture pour les membres de la racine,
--    écriture pour les admins d'org (is_org_admin court-circuite déjà le super
--    admin). Le portail lit `published` par l'API publique, en service role
--    hors RLS, borné au périmètre de la clé.
alter table public.portal_contents enable row level security;

create policy "read portal_contents" on public.portal_contents
  for select to authenticated using (has_org_access(organization_id));

create policy "write portal_contents" on public.portal_contents
  for all to authenticated
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

comment on table public.portal_contents is
  'Contenus textuels du site de demarches d''une collectivite (declaration d''accessibilite...), un par slug. draft = en cours d''edition (sauvegarde automatique), published = servi par le portail (geste explicite, publie avec la page et le theme). Contrat JSON { body: Markdown } : src/features/portal/portalContent.ts.';
comment on column public.portal_contents.slug is
  'Quel contenu : ''accessibilite'' (declaration d''accessibilite). La base valide la forme, la liste vit dans le code.';
comment on column public.portal_contents.draft is
  'Contenu en cours d''edition. Ecrit automatiquement par l''editeur ; jamais servi au public.';
comment on column public.portal_contents.published is
  'Contenu publie, tel que le portail le sert (GET /v1/portal/content). Nul tant que rien n''a ete publie.';
