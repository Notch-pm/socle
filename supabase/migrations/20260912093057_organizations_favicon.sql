-- Favicon de la collectivité : cinquième élément de la charte graphique.
--
-- C'est l'icône que le navigateur affiche dans l'onglet du site de démarches,
-- et dans les favoris. Elle vit avec les logos plutôt que dans le thème du
-- portail : c'est une IMAGE DE LA COLLECTIVITÉ, pas une façon de peindre — le
-- thème dit comment peindre, la charte dit avec quoi. Elle hérite donc comme
-- les quatre autres éléments : une sous-organisation qui tient son propre
-- guichet reçoit le favicon de sa collectivité sans rien avoir à saisir.
--
-- Comme les logos, c'est une URL libre : le Socle enregistre et publie, il
-- n'héberge pas le fichier. Aucun CHECK — la forme acceptable est affaire de
-- rendu, et c'est le consommateur (Nora) qui écarte ce qu'il ne peut pas
-- peindre, comme il le fait déjà des logos servis en clair.

alter table public.organizations add column if not exists favicon_url text;

comment on column public.organizations.favicon_url is
  'Charte graphique : favicon (URL) — icone affichee par le navigateur dans l''onglet du site de demarches. Gouvernee par branding_inherit_parent, comme les logos.';

-- Les deux fonctions de charte changent de TYPE DE RETOUR : `create or replace`
-- ne suffit pas, il faut les déposer. `parent_branding` d'abord — elle appelle
-- l'autre. Les droits sont reposés à l'identique derrière (motif de la
-- migration `organizations_charte_graphique`, dont elles sont issues).
--
-- ⚠️ Reposés à l'identique, c'est-à-dire **insuffisamment** : ces deux lignes de
-- `revoke ... from public` ont rendu `resolve_branding` appelable par `anon`,
-- ce que la migration suivante (`branding_functions_revoke_execute_bis`) a
-- corrigé dans la minute. Laissé tel quel ici : c'est ce qui a été appliqué.
drop function if exists public.parent_branding(uuid);
drop function if exists public.resolve_branding(uuid);

-- Charte applicable : premier ancêtre (l'organisation comprise) qui n'hérite pas.
create or replace function public.resolve_branding(p_org_id uuid)
returns table (
  source_organization_id uuid,
  logo_url text,
  logo_white_url text,
  favicon_url text,
  primary_color text,
  secondary_color text
)
    language sql stable
    set search_path to 'public'
as $$
  with recursive chain as (
    select o.id, o.parent_id, o.branding_inherit_parent,
           o.logo_url, o.logo_white_url, o.favicon_url,
           o.primary_color, o.secondary_color, 0 as depth
    from public.organizations o
    where o.id = p_org_id
    union all
    select o.id, o.parent_id, o.branding_inherit_parent,
           o.logo_url, o.logo_white_url, o.favicon_url,
           o.primary_color, o.secondary_color, c.depth + 1
    from public.organizations o
    join chain c on o.id = c.parent_id
    where c.branding_inherit_parent
      and c.depth < 20 -- garde-fou (10 niveaux max, cycles bloqués par enforce_org_depth)
  )
  select c.id, c.logo_url, c.logo_white_url, c.favicon_url, c.primary_color, c.secondary_color
  from chain c
  where not c.branding_inherit_parent
  order by c.depth
  limit 1;
$$;

alter function public.resolve_branding(uuid) owner to postgres;
revoke all on function public.resolve_branding(uuid) from public;
grant execute on function public.resolve_branding(uuid) to service_role;

-- Aperçu pour l'interface : la charte dont cette organisation **hérite**,
-- c'est-à-dire celle applicable à son PARENT.
--
-- ⚠️ `configured` compte désormais CINQ éléments. L'oublier ferait passer pour
-- « rien au-dessus » une collectivité qui n'aurait déposé que son favicon.
create or replace function public.parent_branding(p_org_id uuid)
returns table (
  source_organization_id uuid,
  source_organization_name text,
  configured boolean,
  logo_url text,
  logo_white_url text,
  favicon_url text,
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
      or coalesce(btrim(b.favicon_url), '') <> ''
      or b.primary_color is not null
      or b.secondary_color is not null),
    b.logo_url,
    b.logo_white_url,
    b.favicon_url,
    b.primary_color,
    b.secondary_color
  from public.resolve_branding(parent) b
  join public.organizations o on o.id = b.source_organization_id;
end;
$$;

alter function public.parent_branding(uuid) owner to postgres;
revoke execute on function public.parent_branding(uuid) from public, anon;
grant execute on function public.parent_branding(uuid) to authenticated, service_role;
