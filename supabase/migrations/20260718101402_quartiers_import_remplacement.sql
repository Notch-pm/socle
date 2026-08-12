-- Import GeoJSON en mode « remplacement » : le nouveau découpage remplace
-- l'ancien dans la MÊME transaction (jamais d'état intermédiaire sans quartiers).

-- Supprimer un quartier met `contacts.quartier_id` à NULL (FK ON DELETE SET NULL).
-- Pour un rattachement MANUEL (quartier_auto = false), la cible n'existe plus et
-- `recalculate_contact_quartiers` ignore ces lignes : le contact resterait sans
-- quartier pour toujours. On les repasse donc en automatique.
-- SECURITY DEFINER car `contacts` n'a aucune policy d'écriture côté client
-- (même motif que `recalculate_contact_quartiers`, garde interne identique).
create or replace function public.reset_orphan_manual_quartiers(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (
    public.is_org_admin(p_org_id)
    or coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
  ) then
    raise exception 'Acces refuse';
  end if;

  update public.contacts c
  set quartier_auto = true
  where c.organization_id = p_org_id
    and c.quartier_auto = false
    and c.quartier_id is null;
end;
$function$;

revoke execute on function public.reset_orphan_manual_quartiers(uuid) from public, anon;
grant execute on function public.reset_orphan_manual_quartiers(uuid) to authenticated, service_role;

-- Ajouter un paramètre à défaut créerait une surcharge ambiguë pour un appel
-- à 2 arguments : on remplace l'ancienne signature.
drop function if exists public.create_quartiers_batch(uuid, jsonb);

create or replace function public.create_quartiers_batch(
  p_org_id uuid,
  p_items jsonb,
  p_replace boolean default false
)
returns table(quartier_id uuid, quartier_name text)
language plpgsql
set search_path to 'public', 'extensions'
as $function$
declare
  item jsonb;
  v_geom geometry;
  v_name text;
  v_final_name text;
  v_suffix int;
  v_new_id uuid;
begin
  if p_replace then
    -- Remplacer par un lot vide viderait le découpage sans rien recréer :
    -- c'est une suppression, qui a son propre chemin (bouton par quartier).
    if p_items is null or jsonb_array_length(p_items) = 0 then
      raise exception 'Import vide : le remplacement exige au moins un quartier';
    end if;

    -- RLS (is_org_admin) autorise la suppression : fonction SECURITY INVOKER.
    delete from public.quartiers q where q.organization_id = p_org_id;
    perform public.reset_orphan_manual_quartiers(p_org_id);
  end if;

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
$function$;

revoke execute on function public.create_quartiers_batch(uuid, jsonb, boolean) from public, anon;
grant execute on function public.create_quartiers_batch(uuid, jsonb, boolean) to authenticated, service_role;
