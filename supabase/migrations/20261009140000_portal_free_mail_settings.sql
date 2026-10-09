-- Courrier libre (site Nora) — l'INTERRUPTEUR. Un usager peut-il, depuis le
-- site de démarches, écrire à cet organisme un courrier qui ne relève d'aucune
-- démarche ? Le courrier arrive dans Clara (gestion du courrier), qui le
-- reçoit et l'instruit ; le Socle n'en tient que la décision de l'OUVRIR et le
-- titre du lien. Le portail sert la page à `/<slug-organisme>/courrier`.
--
-- Doctrine « un réglage = sa table » (motif `portal_assistant_settings`) : UNE
-- TABLE, PAS UNE COLONNE d'`organizations`, que la liste des organisations lit
-- en `select("*")` partout et que ses administrateurs modifient.
--
-- ⚠️ LE RÉGLAGE GOUVERNE L'USAGE, PAS LA DONNÉE (motif `email_sender_name`) :
-- couper `enabled` CONSERVE le titre. Ligne absente = courrier libre fermé.
--
-- ⚠️ SUR TOUTE ORGANISATION, pas seulement une racine : chaque organisme
-- affiché au portail a sa page, et c'est à lui qu'on écrit. Pas d'héritage —
-- ouvrir le courrier libre de la mairie n'ouvre pas celui de ses services.
--
-- ⚠️ L'ABONNEMENT N'EST PAS VÉRIFIÉ ICI, mais à la FRONTIÈRE : `public-api`
-- ne sert `free_mail.enabled = true` que si la racine est abonnée à Clara
-- (sans Clara, personne ne recevrait le courrier). Résilier Clara referme donc
-- le courrier libre partout, sans toucher aux lignes — et le réabonnement rend
-- le réglage tel qu'il était. L'écran, lui, ne propose la bascule qu'à une
-- collectivité abonnée à Nora ET à Clara (`organization_root_applications`).
--
-- Écriture : l'administrateur de l'organisme ou de n'importe quel ancêtre
-- (motif `organization_attributions`) — ce n'est pas une dépense de crédit
-- comme l'assistant, c'est l'ouverture d'un guichet que la collectivité
-- instruit elle-même dans Clara.

-- 1. Table
create table public.portal_free_mail_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- Le portail propose d'écrire un courrier libre à cet organisme.
  enabled boolean not null default false,
  -- Titre du lien et de la page ; `null` = libellé par défaut du portail
  -- (traduit par Nora). Conservé quand `enabled` est coupé.
  title text null
    constraint portal_free_mail_settings_title_length
    check (title is null or char_length(btrim(title)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create trigger set_portal_free_mail_settings_updated_at
  before update on public.portal_free_mail_settings
  for each row execute function public.set_updated_at();

-- 2. RLS : lecture pour les membres de l'organisme et les administrateurs d'un
--    ancêtre (qui doivent relire ce qu'ils règlent), écriture pour
--    l'administrateur de l'organisme ou d'un ancêtre — super admin compris
--    (`is_admin_of_self_or_ancestor` le court-circuite ; on le nomme quand
--    même, la policy se lit sans aller voir le helper). Pas de suppression
--    cliente : fermer, c'est `enabled = false`. L'API lit en service role.
alter table public.portal_free_mail_settings enable row level security;

create policy "read portal_free_mail_settings" on public.portal_free_mail_settings
  for select to authenticated
  using (public.has_org_access(organization_id) or public.is_admin_of_self_or_ancestor(organization_id));

create policy "insert portal_free_mail_settings" on public.portal_free_mail_settings
  for insert to authenticated
  with check (public.is_super_admin() or public.is_admin_of_self_or_ancestor(organization_id));

create policy "update portal_free_mail_settings" on public.portal_free_mail_settings
  for update to authenticated
  using (public.is_super_admin() or public.is_admin_of_self_or_ancestor(organization_id))
  with check (public.is_super_admin() or public.is_admin_of_self_or_ancestor(organization_id));

comment on table public.portal_free_mail_settings is
  'Courrier libre du portail usagers (Nora -> Clara), une ligne par organisation (toute organisation, pas d''heritage). Aucune ligne = ferme. Servi par GET /v1/portal/organizations (champ free_mail), enabled seulement si la racine est abonnee a Clara.';
comment on column public.portal_free_mail_settings.enabled is
  'Le portail propose d''ecrire un courrier libre a cet organisme. L''API publique sert false si la racine n''est pas abonnee a Clara.';
comment on column public.portal_free_mail_settings.title is
  'Titre du lien et de la page (80 caracteres au plus, trime). NULL = libelle par defaut du portail. Conserve quand enabled est coupe.';

-- 3. Racine d'une organisation — la remontée faite une fois ici (motif
--    `resolve_portal_assistant`). Service role seulement : `public-api` s'en
--    sert pour lire l'abonnement de la collectivité d'un `tenant_id` qui peut
--    désigner une sous-organisation.
create or replace function public.organization_root_id(p_org_id uuid)
returns uuid
language sql
stable
set search_path to 'public'
as $$
  with recursive chain as (
    select o.id, o.parent_id, 0 as depth
    from public.organizations o
    where o.id = p_org_id
    union all
    select o.id, o.parent_id, c.depth + 1
    from public.organizations o
    join chain c on o.id = c.parent_id
    where c.depth < 20 -- garde-fou (10 niveaux max, cycles bloqués par enforce_org_depth)
  )
  select c.id from chain c where c.parent_id is null limit 1;
$$;

comment on function public.organization_root_id(uuid) is
  'Organisation principale (racine) d''une organisation, ou NULL si elle n''existe pas. Service role.';

revoke all on function public.organization_root_id(uuid) from public, anon, authenticated;
grant execute on function public.organization_root_id(uuid) to service_role;

-- 4. Applications auxquelles la RACINE d'une organisation est abonnée — pour
--    l'écran : l'administrateur d'une sous-organisation n'a pas accès à la
--    ligne `organization_applications` de sa racine (RLS), mais doit savoir
--    pourquoi le courrier libre lui est indisponible. SECURITY DEFINER, borné :
--    un appelant qui n'a pas accès à l'organisation reçoit une liste vide. On
--    ne livre que des identifiants d'application (`nora`, `clara`…), jamais
--    d'autre donnée de la racine.
create or replace function public.organization_root_applications(p_org_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not (public.has_org_access(p_org_id) or public.is_admin_of_self_or_ancestor(p_org_id)) then
    return '{}';
  end if;
  return coalesce(
    (
      select array_agg(oa.application_id::text order by oa.application_id)
      from public.organization_applications oa
      where oa.organization_id = public.organization_root_id(p_org_id)
    ),
    '{}'
  );
end;
$$;

comment on function public.organization_root_applications(uuid) is
  'Identifiants des applications auxquelles la racine de cette organisation est abonnee. Liste vide si l''appelant n''a pas acces a l''organisation.';

-- Les trois rôles, pas seulement `public` : Supabase pose des DEFAULT
-- PRIVILEGES qui accordent EXECUTE nommément à anon/authenticated.
revoke all on function public.organization_root_applications(uuid) from public, anon, authenticated;
grant execute on function public.organization_root_applications(uuid) to authenticated, service_role;

-- 5. `courrier` rejoint les mots réservés d'un slug d'organisation : le portail
--    sert `/<slug-organisme>/courrier`, et la collectivité elle-même son
--    courrier libre à `/courrier`. Un organisme de ce slug aurait la même
--    adresse (`/<slug>` ouvre la page de l'organisme). Même motif que
--    `assistant` (migration `organization_slug_reserve_assistant`) : le réserver
--    coûte une ligne ; le récupérer plus tard demanderait de renommer
--    l'adresse d'un organisme déjà communiquée.
--
--    Aucun organisme ne porte ce slug — vérifié le 2026-10-09 avant d'écrire
--    cette migration, et revérifié ici : la contrainte ne se pose pas sur une
--    ligne qui la viole, autant le dire en clair. Miroir : `SLUG_RESERVED` dans
--    `src/features/organizations/organizationSlug.ts`.
do $$
begin
  if exists (select 1 from public.organizations where slug = 'courrier') then
    raise exception 'Un organisme porte déjà le slug « courrier » : renommez-le avant de réserver ce mot.';
  end if;
end;
$$;

alter table public.organizations
  drop constraint if exists organizations_slug_url_form;

alter table public.organizations
  add constraint organizations_slug_url_form check (
    slug is null
    or (
      slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and length(slug) >= 4
      and slug not in ('demarches', 'accueil', 'contact', 'mentions-legales', 'accessibilite', 'assistant', 'courrier')
    )
  );
