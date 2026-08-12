-- Portage de la gestion des quartiers de Clara vers le Socle
-- (référence : references/clara-quartiers/). Table quartiers (polygones par
-- organisation principale), rattachement des contacts (quartier_id /
-- quartier_auto + coordonnées géocodées), RPC d'import GeoJSON, recalcul de
-- masse et statistiques. Phase sans API : écriture des quartiers côté client
-- (admins d'org) ; l'assignation des contacts passe par trigger + RPC.

-- 1. PostGIS (types et fonctions géométriques), dans le schéma extensions
create extension if not exists postgis with schema extensions;

-- 2. Table quartiers — un découpage par organisation principale (racine),
--    partagé par tout le sous-arbre comme le référentiel des contacts.
create table public.quartiers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

-- Unicité du nom par organisation, insensible à la casse (convention document_types)
create unique index quartiers_org_name_unique on public.quartiers (organization_id, lower(name));
create index idx_quartiers_org on public.quartiers (organization_id);
create index idx_quartiers_geom on public.quartiers using gist (geom);

create trigger set_quartiers_updated_at
  before update on public.quartiers
  for each row execute function public.set_updated_at();

-- Rattachement à une racine uniquement (motif enforce_contact_root_org)
create or replace function public.enforce_quartier_root_org()
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
    raise exception 'Un quartier doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_quartier_root_org() from public, anon, authenticated;

create trigger trg_enforce_quartier_root_org
  before insert or update on public.quartiers
  for each row execute function public.enforce_quartier_root_org();

-- RLS : lecture pour les membres de la racine, écriture pour les admins d'org
alter table public.quartiers enable row level security;

create policy "read quartiers" on public.quartiers
  for select to authenticated
  using (public.has_org_access(organization_id));

create policy "write quartiers" on public.quartiers
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- 3. Rattachement des contacts : coordonnées géocodées (BAN, phase API) +
--    quartier. quartier_auto = false dès qu'une valeur est forcée manuellement,
--    pour ne pas l'écraser lors d'un recalcul de masse.
alter table public.contacts
  add column address_lat double precision,
  add column address_lon double precision,
  add column quartier_id uuid references public.quartiers(id) on delete set null,
  add column quartier_auto boolean not null default true;

create index idx_contacts_quartier on public.contacts (quartier_id);

-- 4. Fonctions ---------------------------------------------------------------

-- Quartier contenant un point donné (assignation auto + recalcul de masse)
create or replace function public.quartier_for_point(p_org_id uuid, p_lon double precision, p_lat double precision)
returns uuid
language sql stable security invoker
set search_path = public, extensions
as $$
  select id from public.quartiers
  where organization_id = p_org_id
    and ST_Contains(geom, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326))
  limit 1;
$$;

-- Assignation automatique du quartier d'un contact. En mode manuel
-- (quartier_auto = false, API future), seule la cohérence tenant est vérifiée.
-- Lors du recalcul de masse, les coordonnées ne changent pas : le trigger
-- laisse passer la valeur posée par l'UPDATE.
create or replace function public.assign_contact_quartier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.quartier_auto then
    if new.address_lat is null or new.address_lon is null then
      new.quartier_id := null;
    elsif tg_op = 'INSERT' then
      new.quartier_id := public.quartier_for_point(new.organization_id, new.address_lon, new.address_lat);
    elsif new.address_lat is distinct from old.address_lat
       or new.address_lon is distinct from old.address_lon
       or not old.quartier_auto then
      new.quartier_id := public.quartier_for_point(new.organization_id, new.address_lon, new.address_lat);
    end if;
  elsif new.quartier_id is not null and not exists (
    select 1 from public.quartiers q
    where q.id = new.quartier_id and q.organization_id = new.organization_id
  ) then
    raise exception 'Le quartier doit appartenir a la meme organisation que le contact';
  end if;
  return new;
end;
$$;

revoke execute on function public.assign_contact_quartier() from public, anon, authenticated;

create trigger trg_assign_contact_quartier
  before insert or update on public.contacts
  for each row execute function public.assign_contact_quartier();

-- Création d'un quartier depuis un GeoJSON (Polygon ou MultiPolygon), avec
-- dédoublonnage automatique du nom (suffixe « (n) », insensible à la casse).
-- ST_MakeValid répare les polygones auto-intersectants (exports QGIS/opendata).
create or replace function public.create_quartier_from_geojson(
  p_org_id  uuid,
  p_name    text,
  p_color   text,
  p_geojson jsonb
)
returns uuid
language plpgsql security invoker
set search_path = public, extensions
as $$
declare
  v_geom geometry;
  v_final_name text;
  v_suffix int := 1;
  v_id uuid;
begin
  v_geom := ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326));
  if GeometryType(v_geom) = 'POLYGON' then
    v_geom := ST_Multi(v_geom);
  end if;

  v_final_name := p_name;
  while exists (
    select 1 from public.quartiers q
    where q.organization_id = p_org_id and lower(q.name) = lower(v_final_name)
  ) loop
    v_suffix := v_suffix + 1;
    v_final_name := p_name || ' (' || v_suffix || ')';
  end loop;

  insert into public.quartiers (organization_id, name, color, geom, created_by)
  values (p_org_id, v_final_name, p_color, v_geom, auth.uid())
  returning quartiers.id into v_id;

  return v_id;
end;
$$;

-- Import en lot : un seul appel = une seule transaction Postgres — si un
-- élément échoue (géométrie invalide…), tout le lot est annulé.
create or replace function public.create_quartiers_batch(p_org_id uuid, p_items jsonb)
returns table (quartier_id uuid, quartier_name text)
language plpgsql security invoker
set search_path = public, extensions
as $$
declare
  item jsonb;
  v_geom geometry;
  v_name text;
  v_final_name text;
  v_suffix int;
  v_new_id uuid;
begin
  for item in select * from jsonb_array_elements(p_items) loop
    v_geom := ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON((item->'geometry')::text), 4326));
    if GeometryType(v_geom) = 'POLYGON' then
      v_geom := ST_Multi(v_geom);
    end if;

    v_name := item->>'name';
    v_final_name := v_name;
    v_suffix := 1;
    while exists (
      select 1 from public.quartiers q
      where q.organization_id = p_org_id and lower(q.name) = lower(v_final_name)
    ) loop
      v_suffix := v_suffix + 1;
      v_final_name := v_name || ' (' || v_suffix || ')';
    end loop;

    insert into public.quartiers (organization_id, name, color, geom, created_by)
    values (p_org_id, v_final_name, item->>'color', v_geom, auth.uid())
    returning quartiers.id into v_new_id;

    quartier_id := v_new_id;
    quartier_name := v_final_name;
    return next;
  end loop;
  return;
end;
$$;

-- Lecture des quartiers en GeoJSON (pour le composant <GeoJSON> de react-leaflet).
-- PostGIS stocke en geometry binaire : sans ce cast côté serveur, le client
-- recevrait du WKB illisible par Leaflet.
create or replace function public.list_quartiers_geojson(p_org_id uuid)
returns table (id uuid, name text, color text, geojson json)
language sql stable security invoker
set search_path = public, extensions
as $$
  select id, name, color, ST_AsGeoJSON(geom)::json
  from public.quartiers
  where organization_id = p_org_id
  order by name;
$$;

-- Réapplique quartier_for_point à tous les contacts en assignation automatique
-- (utile après import/édition d'un polygone). SECURITY DEFINER : les contacts
-- n'ont aucune policy d'écriture client (écriture via contacts-api uniquement),
-- l'accès est donc contrôlé explicitement (admin d'org, ou service_role pour
-- l'API future).
create or replace function public.recalculate_contact_quartiers(p_org_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not (
    public.is_org_admin(p_org_id)
    or coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
  ) then
    raise exception 'Acces refuse';
  end if;

  update public.contacts c
  set quartier_id = public.quartier_for_point(p_org_id, c.address_lon, c.address_lat)
  where c.organization_id = p_org_id
    and c.quartier_auto = true
    and c.address_lat is not null
    and c.address_lon is not null;
end;
$$;

-- Statistiques : nombre de contacts par quartier, + ligne « Sans quartier »
create or replace function public.stats_contacts_by_quartier(p_org_id uuid)
returns table (quartier_id uuid, quartier_name text, color text, count bigint)
language sql stable security invoker
set search_path = public
as $$
  select q.id, q.name, q.color, count(c.id)::bigint
  from public.quartiers q
  left join public.contacts c on c.quartier_id = q.id and c.organization_id = p_org_id
  where q.organization_id = p_org_id
  group by q.id, q.name, q.color
  union all
  select null::uuid, 'Sans quartier', null::text, count(*)::bigint
  from public.contacts
  where organization_id = p_org_id and quartier_id is null
  order by count desc;
$$;

-- Substitut pragmatique à « rues hors quartiers » : contacts géolocalisés ne
-- tombant dans aucun polygone (aucune donnée de voirie externe).
create or replace function public.contacts_outside_quartiers(p_org_id uuid)
returns table (id uuid, display_name text, address_lat double precision, address_lon double precision)
language sql stable security invoker
set search_path = public, extensions
as $$
  select c.id, c.display_name, c.address_lat, c.address_lon
  from public.contacts c
  where c.organization_id = p_org_id
    and c.address_lat is not null and c.address_lon is not null
    and not exists (
      select 1 from public.quartiers q
      where q.organization_id = p_org_id
        and ST_Contains(q.geom, ST_SetSRID(ST_MakePoint(c.address_lon, c.address_lat), 4326))
    );
$$;

-- 5. Droits d'exécution : membres authentifiés + service_role (API future) ;
--    rien pour anon.
revoke execute on function public.quartier_for_point(uuid, double precision, double precision) from public, anon;
revoke execute on function public.create_quartier_from_geojson(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.create_quartiers_batch(uuid, jsonb) from public, anon;
revoke execute on function public.list_quartiers_geojson(uuid) from public, anon;
revoke execute on function public.recalculate_contact_quartiers(uuid) from public, anon;
revoke execute on function public.stats_contacts_by_quartier(uuid) from public, anon;
revoke execute on function public.contacts_outside_quartiers(uuid) from public, anon;

grant execute on function public.quartier_for_point(uuid, double precision, double precision) to authenticated, service_role;
grant execute on function public.create_quartier_from_geojson(uuid, text, text, jsonb) to authenticated, service_role;
grant execute on function public.create_quartiers_batch(uuid, jsonb) to authenticated, service_role;
grant execute on function public.list_quartiers_geojson(uuid) to authenticated, service_role;
grant execute on function public.recalculate_contact_quartiers(uuid) to authenticated, service_role;
grant execute on function public.stats_contacts_by_quartier(uuid) to authenticated, service_role;
grant execute on function public.contacts_outside_quartiers(uuid) to authenticated, service_role;
