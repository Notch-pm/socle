-- Pages du portail usagers — la composition que chaque collectivité fait de
-- son site de démarches (page d'accueil pour commencer).
--
-- Une page est une liste ordonnée de sections typées (recherche, grille de
-- démarches, espace usager, bandeau texte…), stockée en JSONB comme les autres
-- schémas possédés du Socle (`form_schema`, `communication_config`) : le
-- contrat est défini par `src/features/portal/portalPage.ts`, consommé en aval
-- par le portail.
--
-- Deux colonnes, pas une table de versions : `draft` est ce que l'éditeur
-- manipule et enregistre automatiquement à chaque modification ; `published`
-- est ce que le portail servira, et il ne bouge QUE sur un geste explicite de
-- publication. Sauvegarder n'est pas publier — la séparation est structurelle,
-- pas une option de l'interface.
--
-- `slug` dès maintenant : la maquette annonce d'autres pages. Une ligne par
-- (organisation, page) évite une reprise le jour venu. Seule `accueil` existe.
--
-- Rattachement à une organisation principale uniquement, comme `procedures`,
-- `quartiers` et `document_templates` : le catalogue que la page épingle est
-- celui de la racine.

-- 1. Table
create table public.portal_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null default 'accueil',
  -- Composition en cours d'édition. Jamais nulle : une page existe avec sa
  -- composition par défaut, ou n'existe pas.
  draft jsonb not null,
  -- Dernière composition publiée. Nulle tant que la collectivité n'a rien
  -- publié : le portail n'a alors rien à afficher de plus que son défaut.
  published jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Identifiant d'URL : minuscules, chiffres et tirets, comme un chemin.
  constraint portal_pages_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Une publication porte toujours sa date, et réciproquement.
  constraint portal_pages_published_consistent check (
    (published is null) = (published_at is null)
  )
);

-- Une seule page par (organisation, adresse).
create unique index portal_pages_org_slug_unique
  on public.portal_pages (organization_id, slug);

create trigger set_portal_pages_updated_at
  before update on public.portal_pages
  for each row execute function public.set_updated_at();

-- 2. Rattachement à une racine uniquement (motif enforce_document_template_root_org).
create or replace function public.enforce_portal_page_root_org()
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
    raise exception 'Une page du portail doit etre rattachee a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

-- Les trois rôles, pas seulement `public` : Supabase pose des DEFAULT PRIVILEGES
-- qui accordent EXECUTE nommément à anon/authenticated (cf. migration
-- branding_functions_revoke_execute). Sans effet sur le déclenchement du trigger.
revoke execute on function public.enforce_portal_page_root_org()
  from public, anon, authenticated;

create trigger trg_enforce_portal_page_root_org
  before insert or update on public.portal_pages
  for each row execute function public.enforce_portal_page_root_org();

-- 3. RLS : lecture pour les membres de la racine, écriture pour les admins d'org
--    (is_org_admin court-circuite déjà le super admin) — calqué sur
--    document_templates. Le portail lira `published` par l'API publique, en
--    service role hors RLS, borné au périmètre de la clé.
alter table public.portal_pages enable row level security;

create policy "read portal_pages" on public.portal_pages
  for select to authenticated using (has_org_access(organization_id));

create policy "write portal_pages" on public.portal_pages
  for all to authenticated
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));

comment on table public.portal_pages is
  'Pages du portail usagers, composees par la collectivite. draft = en cours d''edition (sauvegarde automatique), published = servie par le portail (geste explicite). Contrat JSON : src/features/portal/portalPage.ts.';
comment on column public.portal_pages.slug is
  'Adresse de la page dans le portail (accueil, ...). Unique par organisation.';
comment on column public.portal_pages.draft is
  'Composition en cours d''edition. Ecrite automatiquement par l''editeur ; jamais servie au public.';
comment on column public.portal_pages.published is
  'Composition publiee, telle que le portail la sert. Ne change que par une publication explicite. Nulle tant que rien n''a ete publie.';
