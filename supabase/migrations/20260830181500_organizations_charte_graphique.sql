-- Charte graphique par organisation, héritée le long de la hiérarchie.
--
-- Quatre éléments : logo couleur, logo blanc (fonds sombres), couleur principale,
-- couleur secondaire. Ils sont portés par `organizations` plutôt que par une
-- table dédiée : ils décrivent l'organisation elle-même, au même titre que son
-- nom ou son adresse, et `logo_url` y vivait déjà.
--
-- Règle d'héritage, calquée sur le relais SMTP : une organisation utilise la
-- charte de l'ancêtre le plus proche (elle comprise) qui **n'hérite pas**. Rien
-- n'est recopié — modifier la charte d'un parent modifie de facto celle de toute
-- sa descendance non spécifique, et un retour en arrière est toujours possible
-- puisque les valeurs propres sont conservées (motif `email_sender_name`).

alter table public.organizations
  add column if not exists logo_white_url text,
  add column if not exists primary_color text,
  add column if not exists secondary_color text,
  add column if not exists branding_inherit_parent boolean not null default true;

comment on column public.organizations.logo_url is
  'Charte graphique : logo couleur (URL). Gouverne par branding_inherit_parent — une organisation qui herite garde ses valeurs propres, mais c''est celle de son ancetre qui s''applique.';
comment on column public.organizations.logo_white_url is
  'Charte graphique : logo blanc (URL), pour les fonds sombres.';
comment on column public.organizations.primary_color is
  'Charte graphique : couleur principale, notation hexadecimale #rrggbb.';
comment on column public.organizations.secondary_color is
  'Charte graphique : couleur secondaire, notation hexadecimale #rrggbb.';
comment on column public.organizations.branding_inherit_parent is
  'true = l''organisation utilise la charte de son ancetre le plus proche qui n''herite pas. Toujours false sur une organisation principale (racine), qui n''a personne au-dessus d''elle.';

-- Reprise de l'existant. Le défaut `true` a mis toutes les lignes en héritage :
-- il faut le défaire là où il changerait ce qui est affiché aujourd'hui.
--  • une racine n'hérite de personne ;
--  • une sous-organisation qui portait DÉJÀ un logo le porte encore — la basculer
--    en héritage lui substituerait silencieusement celui de son parent.
update public.organizations set branding_inherit_parent = false
  where parent_id is null or logo_url is not null;

alter table public.organizations drop constraint if exists organizations_branding_colors_hex;
alter table public.organizations add constraint organizations_branding_colors_hex check (
  (primary_color is null or primary_color ~* '^#[0-9a-f]{6}$')
  and (secondary_color is null or secondary_color ~* '^#[0-9a-f]{6}$')
);

alter table public.organizations drop constraint if exists organizations_branding_root_no_inherit;
alter table public.organizations add constraint organizations_branding_root_no_inherit check (
  branding_inherit_parent = false or parent_id is not null
);

-- Une organisation principale n'a personne de qui hériter. On **corrige** au lieu
-- de refuser (contrairement à `enforce_smtp_no_inherit_on_root`, où le client
-- pilote explicitement le commutateur) : la colonne vaut `true` par défaut, et
-- aucun appelant qui crée une racine — ni l'`OrganizationFormDialog`, ni un
-- futur consommateur — n'a à connaître cette subtilité pour ne pas être refusé.
-- Vaut aussi au rattachement : une sous-organisation promue racine cesse d'hériter.
create or replace function public.enforce_branding_root_no_inherit() returns trigger
    language plpgsql security definer
    set search_path to 'public'
as $$
begin
  if new.parent_id is null then
    new.branding_inherit_parent := false;
  end if;
  return new;
end;
$$;

alter function public.enforce_branding_root_no_inherit() owner to postgres;
revoke all on function public.enforce_branding_root_no_inherit() from anon, authenticated;

drop trigger if exists enforce_branding_root_no_inherit on public.organizations;
create trigger enforce_branding_root_no_inherit
  before insert or update on public.organizations
  for each row execute function public.enforce_branding_root_no_inherit();

-- Charte applicable : premier ancêtre (l'organisation comprise) qui n'hérite pas.
-- La remontée s'arrête d'elle-même sur ce nœud (`where c.branding_inherit_parent`).
-- SECURITY INVOKER réservée au service_role, motif `resolve_smtp_settings` : elle
-- traverse des organisations que l'appelant n'a pas le droit de lire.
create or replace function public.resolve_branding(p_org_id uuid)
returns table (
  source_organization_id uuid,
  logo_url text,
  logo_white_url text,
  primary_color text,
  secondary_color text
)
    language sql stable
    set search_path to 'public'
as $$
  with recursive chain as (
    select o.id, o.parent_id, o.branding_inherit_parent,
           o.logo_url, o.logo_white_url, o.primary_color, o.secondary_color, 0 as depth
    from public.organizations o
    where o.id = p_org_id
    union all
    select o.id, o.parent_id, o.branding_inherit_parent,
           o.logo_url, o.logo_white_url, o.primary_color, o.secondary_color, c.depth + 1
    from public.organizations o
    join chain c on o.id = c.parent_id
    where c.branding_inherit_parent
      and c.depth < 20 -- garde-fou (10 niveaux max, cycles bloqués par enforce_org_depth)
  )
  select c.id, c.logo_url, c.logo_white_url, c.primary_color, c.secondary_color
  from chain c
  where not c.branding_inherit_parent
  order by c.depth
  limit 1;
$$;

alter function public.resolve_branding(uuid) owner to postgres;
revoke all on function public.resolve_branding(uuid) from public;
grant execute on function public.resolve_branding(uuid) to service_role;

-- Aperçu pour l'interface : la charte dont cette organisation **hérite**,
-- c'est-à-dire celle applicable à son PARENT. Résoudre depuis l'organisation
-- elle-même donnerait un aperçu faux dès qu'on bascule le commutateur sans
-- enregistrer — on afficherait sa propre charte comme « héritée »
-- (l'erreur corrigée en son temps sur `effective_smtp_settings`).
--
-- SECURITY DEFINER : l'admin d'une sous-organisation n'a aucun droit de lecture
-- sur la ligne de son parent (`has_org_access` exige l'appartenance directe), il
-- doit pourtant voir ce dont il hérite. Rien de sensible ne descend ici : une
-- charte graphique est faite pour être vue.
create or replace function public.parent_branding(p_org_id uuid)
returns table (
  source_organization_id uuid,
  source_organization_name text,
  configured boolean,
  logo_url text,
  logo_white_url text,
  primary_color text,
  secondary_color text
)
    language plpgsql stable security definer
    set search_path to 'public'
as $$
declare
  parent uuid;
begin
  if not public.is_admin_of_self_or_ancestor(p_org_id) then
    raise exception 'Acces refuse';
  end if;

  select o.parent_id into parent from public.organizations o where o.id = p_org_id;
  if parent is null then
    return; -- organisation principale : personne au-dessus
  end if;

  return query
  select
    b.source_organization_id,
    o.name,
    (coalesce(btrim(b.logo_url), '') <> ''
      or coalesce(btrim(b.logo_white_url), '') <> ''
      or b.primary_color is not null
      or b.secondary_color is not null),
    b.logo_url,
    b.logo_white_url,
    b.primary_color,
    b.secondary_color
  from public.resolve_branding(parent) b
  join public.organizations o on o.id = b.source_organization_id;
end;
$$;

alter function public.parent_branding(uuid) owner to postgres;
revoke execute on function public.parent_branding(uuid) from public, anon;
grant execute on function public.parent_branding(uuid) to authenticated, service_role;
