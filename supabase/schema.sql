


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."assign_contact_quartier"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.quartier_auto then
    if new.address_lat is null or new.address_lon is null then
      new.quartier_id := null;
    elsif tg_op = 'INSERT' then
      new.quartier_id := public.quartier_for_point(new.organization_id, new.address_lon, new.address_lat);
    elsif new.address_lat is distinct from old.address_lat
       or new.address_lon is distinct from old.address_lon
       or not old.quartier_auto
       or new.quartier_id is null then
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


ALTER FUNCTION "public"."assign_contact_quartier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contacts_outside_quartiers"("p_org_id" "uuid") RETURNS TABLE("id" "uuid", "display_name" "text", "address_lat" double precision, "address_lon" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."contacts_outside_quartiers"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_quartier_from_geojson"("p_org_id" "uuid", "p_name" "text", "p_color" "text", "p_geojson" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."create_quartier_from_geojson"("p_org_id" "uuid", "p_name" "text", "p_color" "text", "p_geojson" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_quartiers_batch"("p_org_id" "uuid", "p_items" "jsonb", "p_replace" boolean DEFAULT false) RETURNS TABLE("quartier_id" "uuid", "quartier_name" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
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
$$;


ALTER FUNCTION "public"."create_quartiers_batch"("p_org_id" "uuid", "p_items" "jsonb", "p_replace" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_api_key_root_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  parent uuid;
begin
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Une cle API doit etre rattachee a une organisation principale (racine)';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_api_key_root_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_contact_role_root_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  parent uuid;
begin
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Un role de contact doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_contact_role_root_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_contact_role_same_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  contact_org uuid;
  role_org uuid;
begin
  select organization_id into contact_org from public.contacts where id = new.contact_id;
  select organization_id into role_org from public.contact_roles where id = new.role_id;
  if contact_org is null or role_org is null or contact_org <> role_org then
    raise exception 'Le contact et le role doivent appartenir a la meme organisation';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_contact_role_same_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_contact_root_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  parent uuid;
begin
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Un contact doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_contact_root_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_document_type_root_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  parent uuid;
begin
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Un type de piece justificative doit etre rattache a une organisation principale (racine)';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_document_type_root_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_org_depth"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  depth int  := 1;      -- the row itself counts as level 1
  cur   uuid := new.parent_id;
begin
  while cur is not null loop
    depth := depth + 1;
    if cur = new.id then
      raise exception 'Cycle detecte dans la hierarchie des organisations';
    end if;
    if depth > 10 then
      raise exception 'Profondeur maximale de 10 niveaux depassee';
    end if;
    select parent_id into cur from public.organizations where id = cur;
  end loop;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_org_depth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_procedure_root_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  parent uuid;
begin
  if new.organization_id is null then
    return new;
  end if;
  select parent_id into parent from public.organizations where id = new.organization_id;
  if parent is not null then
    raise exception 'Une demarche doit etre rattachee a une organisation principale (racine)';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_procedure_root_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_quartier_root_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."enforce_quartier_root_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.users (id, email, global_role)
  values (
    new.id,
    new.email,
    case when (select count(*) from public.users) = 0 then 'super_admin' else 'consultant' end
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_org_access"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return exists (
    select 1 from public.user_organizations uo
    where uo.user_id = auth.uid()
    and uo.organization_id = org_id
  )
  or is_super_admin();
end;
$$;


ALTER FUNCTION "public"."has_org_access"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."immutable_unaccent"("value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;


ALTER FUNCTION "public"."immutable_unaccent"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin_of_self_or_ancestor"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  cur   uuid := org_id;
  guard int  := 0;
begin
  if public.is_super_admin() then
    return true;
  end if;

  while cur is not null and guard < 100 loop
    if exists (
      select 1 from public.user_organizations uo
      where uo.user_id = auth.uid()
        and uo.organization_id = cur
        and uo.role = 'admin'
    ) then
      return true;
    end if;
    select parent_id into cur from public.organizations where id = cur;
    guard := guard + 1;
  end loop;

  return false;
end;
$$;


ALTER FUNCTION "public"."is_admin_of_self_or_ancestor"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return exists (
    select 1 from public.user_organizations uo
    where uo.user_id = auth.uid()
    and uo.organization_id = org_id
    and uo.role = 'admin'
  )
  or is_super_admin();
end;
$$;


ALTER FUNCTION "public"."is_org_admin"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return exists (
    select 1 from public.users u
    where u.id = auth.uid()
    and u.global_role = 'super_admin'
  );
end;
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_quartiers_geojson"("p_org_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "color" "text", "geojson" json)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select id, name, color, ST_AsGeoJSON(geom)::json
  from public.quartiers
  where organization_id = p_org_id
  order by name;
$$;


ALTER FUNCTION "public"."list_quartiers_geojson"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_contacts"("p_org_id" "uuid", "p_contact_type" "text" DEFAULT NULL::"text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text", "p_usage_name" "text" DEFAULT NULL::"text", "p_legal_name" "text" DEFAULT NULL::"text", "p_siret" "text" DEFAULT NULL::"text", "p_birth_date" "date" DEFAULT NULL::"date", "p_email" "text" DEFAULT NULL::"text", "p_phones" "text"[] DEFAULT NULL::"text"[], "p_status" "text" DEFAULT 'active'::"text", "p_exclude_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_limit" integer DEFAULT 5) RETURNS TABLE("contact_id" "uuid", "score" integer, "reasons" "text"[])
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  q_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  q_siret text := nullif(regexp_replace(coalesce(p_siret, ''), '[^0-9]', '', 'g'), '');
  q_first text := public.normalize_name(p_first_name);
  -- Noms complets côté requête — uniquement si la composante famille existe
  -- (un prénom seul ne rapproche rien).
  q_last_full text := case when public.normalize_name(p_last_name) is not null
    then public.match_full_name(p_last_name, p_first_name) end;
  q_usage_full text := case when public.normalize_name(p_usage_name) is not null
    then public.match_full_name(p_usage_name, p_first_name) end;
  q_legal text := public.normalize_name(p_legal_name);
  q_phones text[];
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 20);
begin
  select array_agg(distinct x.n) into q_phones
  from unnest(coalesce(p_phones, array[]::text[])) as p(raw)
  cross join lateral (select public.normalize_phone(p.raw) as n) x
  where x.n is not null;

  -- Seuil du préfiltre trigram (opérateur %) — explicite pour ne pas dépendre
  -- du défaut de session ; le seuil métier (0.5) est appliqué au score exact.
  perform set_config('pg_trgm.similarity_threshold', '0.3', true);

  return query
  with candidate as (
    select c.id,
      coalesce(q_email is not null and lower(c.email) = q_email, false) as m_email,
      coalesce(q_phones is not null
        and (c.mobile_phone_normalized = any (q_phones)
          or c.landline_phone_normalized = any (q_phones)), false) as m_phone,
      coalesce(q_siret is not null and c.siret = q_siret, false) as m_siret,
      coalesce(p_birth_date is not null and c.birth_date = p_birth_date, false) as m_birth,
      public.match_full_name(c.last_name, c.first_name) as c_last_full,
      public.match_full_name(c.usage_name, c.first_name) as c_usage_full,
      public.normalize_name(c.legal_name) as c_legal,
      public.normalize_name(c.first_name) as c_first,
      c.display_name as c_display_name
    from public.contacts c
    where c.organization_id = p_org_id
      and (p_status is null or c.status = p_status)
      and (p_contact_type is null or c.contact_type = p_contact_type)
      and (p_exclude_ids is null or not (c.id = any (p_exclude_ids)))
      and (
        (q_email is not null and lower(c.email) = q_email)
        or (q_phones is not null
          and (c.mobile_phone_normalized = any (q_phones)
            or c.landline_phone_normalized = any (q_phones)))
        or (q_siret is not null and c.siret = q_siret)
        or (q_last_full is not null
          and (public.match_full_name(c.last_name, c.first_name) operator(extensions.%) q_last_full
            or public.match_full_name(c.usage_name, c.first_name) operator(extensions.%) q_last_full))
        or (q_usage_full is not null
          and (public.match_full_name(c.last_name, c.first_name) operator(extensions.%) q_usage_full
            or public.match_full_name(c.usage_name, c.first_name) operator(extensions.%) q_usage_full))
        or (q_legal is not null
          and public.normalize_name(c.legal_name) operator(extensions.%) q_legal)
      )
  ), named as (
    select cd.*,
      greatest(
        case when q_last_full is not null and cd.c_last_full is not null
          then extensions.similarity(q_last_full, cd.c_last_full) else 0 end,
        case when q_last_full is not null and cd.c_usage_full is not null
          then extensions.similarity(q_last_full, cd.c_usage_full) else 0 end,
        case when q_usage_full is not null and cd.c_last_full is not null
          then extensions.similarity(q_usage_full, cd.c_last_full) else 0 end,
        case when q_usage_full is not null and cd.c_usage_full is not null
          then extensions.similarity(q_usage_full, cd.c_usage_full) else 0 end,
        case when q_legal is not null and cd.c_legal is not null
          then extensions.similarity(q_legal, cd.c_legal) else 0 end
      ) as name_sim,
      coalesce(
        (q_last_full is not null and q_last_full in (cd.c_last_full, cd.c_usage_full))
        or (q_usage_full is not null and q_usage_full in (cd.c_last_full, cd.c_usage_full))
        or (q_legal is not null and q_legal = cd.c_legal), false) as m_name_exact,
      (q_first is null or cd.c_first is null
        or extensions.similarity(q_first, cd.c_first) >= 0.1) as first_ok
    from candidate cd
  ), scored as (
    select n.id,
      n.m_email, n.m_phone, n.m_siret, n.m_birth, n.m_name_exact,
      (not n.m_name_exact and n.name_sim >= 0.5 and n.first_ok) as m_name_similar,
      n.name_sim, n.c_display_name
    from named n
  )
  select s.id,
    ( (case when s.m_email then 100 else 0 end)
    + (case when s.m_phone then 80 else 0 end)
    + (case when s.m_siret then 120 else 0 end)
    + (case when s.m_name_exact then 60 else 0 end)
    + (case when s.m_name_similar then round(40 * s.name_sim)::integer else 0 end)
    + (case when s.m_birth then 20 else 0 end) )::integer,
    array_remove(array[
      case when s.m_email then 'email' end,
      case when s.m_phone then 'phone' end,
      case when s.m_siret then 'siret' end,
      case when s.m_name_exact then 'name_exact' end,
      case when s.m_name_similar then 'name_similar' end,
      case when s.m_birth then 'birth_date' end
    ], null)
  from scored s
  where s.m_email or s.m_phone or s.m_siret or s.m_name_exact or s.m_name_similar
  order by 2 desc, s.c_display_name asc nulls last
  limit v_limit;
end;
$$;


ALTER FUNCTION "public"."match_contacts"("p_org_id" "uuid", "p_contact_type" "text", "p_first_name" "text", "p_last_name" "text", "p_usage_name" "text", "p_legal_name" "text", "p_siret" "text", "p_birth_date" "date", "p_email" "text", "p_phones" "text"[], "p_status" "text", "p_exclude_ids" "uuid"[], "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_contacts"("p_org_id" "uuid", "p_contact_type" "text", "p_first_name" "text", "p_last_name" "text", "p_usage_name" "text", "p_legal_name" "text", "p_siret" "text", "p_birth_date" "date", "p_email" "text", "p_phones" "text"[], "p_status" "text", "p_exclude_ids" "uuid"[], "p_limit" integer) IS 'Rapprochement d''identités (détection de doublons) — appelée par l''edge function contacts-api (POST /v1/contacts/match), bornée à l''organisation de la clé API.';



CREATE OR REPLACE FUNCTION "public"."match_full_name"("family" "text", "given" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  select nullif(
    btrim(coalesce(public.normalize_name(family), '') || ' ' || coalesce(public.normalize_name(given), '')),
    ''
  )
$$;


ALTER FUNCTION "public"."match_full_name"("family" "text", "given" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_name"("value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  select nullif(
    btrim(regexp_replace(lower(public.immutable_unaccent(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g')),
    ''
  )
$$;


ALTER FUNCTION "public"."normalize_name"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone"("raw" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
declare
  digits text := regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g');
begin
  if length(digits) = 13 and digits like '0033%' then
    digits := substr(digits, 5);
  elsif length(digits) = 11 and digits like '33%' then
    digits := substr(digits, 3);
  end if;
  if length(digits) = 10 and digits like '0%' then
    digits := substr(digits, 2);
  end if;
  return nullif(digits, '');
end;
$$;


ALTER FUNCTION "public"."normalize_phone"("raw" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."normalize_phone"("raw" "text") IS 'Numéro de téléphone réduit aux chiffres significatifs (indicatif France et 0 initial retirés) — alimente les colonnes générées *_phone_normalized de contacts.';



CREATE OR REPLACE FUNCTION "public"."org_subtree_ids"("root" "uuid") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with recursive sub as (
    select id from public.organizations where id = root
    union all
    select o.id from public.organizations o join sub on o.parent_id = sub.id
  )
  select coalesce(array_agg(id), '{}')::uuid[] from sub;
$$;


ALTER FUNCTION "public"."org_subtree_ids"("root" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quartier_for_point"("p_org_id" "uuid", "p_lon" double precision, "p_lat" double precision) RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select id from public.quartiers
  where organization_id = p_org_id
    and ST_Contains(geom, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326))
  limit 1;
$$;


ALTER FUNCTION "public"."quartier_for_point"("p_org_id" "uuid", "p_lon" double precision, "p_lat" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_contact_quartiers"("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."recalculate_contact_quartiers"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_orphan_manual_quartiers"("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."reset_orphan_manual_quartiers"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stats_contacts_by_quartier"("p_org_id" "uuid") RETURNS TABLE("quartier_id" "uuid", "quartier_name" "text", "color" "text", "count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."stats_contacts_by_quartier"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_contact_external_ref_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  select organization_id into new.organization_id from public.contacts where id = new.contact_id;
  if new.organization_id is null then
    raise exception 'Contact introuvable pour la reference externe';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_contact_external_ref_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_contact_relation_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  related_org uuid;
  related_type text;
  role_org uuid;
begin
  select organization_id into new.organization_id from public.contacts where id = new.contact_id;
  select organization_id, contact_type into related_org, related_type from public.contacts where id = new.related_contact_id;
  select organization_id into role_org from public.contact_roles where id = new.role_id;
  if new.organization_id is null or related_org is null or role_org is null
     or new.organization_id <> related_org or new.organization_id <> role_org then
    raise exception 'Les deux contacts et le role doivent appartenir a la meme organisation';
  end if;
  if related_type = 'personne' then
    raise exception 'Une relation ne peut pas cibler une personne physique';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_contact_relation_org"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "scopes" "text"[] DEFAULT '{read}'::"text"[] NOT NULL,
    "last_used_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


COMMENT ON COLUMN "public"."api_keys"."organization_id" IS 'Organisation (racine) liée à la clé. NULL = clé PLATEFORME : périmètre = toutes les organisations, toutes racines confondues (liaison unique Socle↔Clara). Pour contacts-api, une clé plateforme exige l''en-tête X-Organization-Id (le référentiel servi est la racine de cette organisation).';



CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "icon" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_external_references" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_external_references_external_id_check" CHECK (("btrim"("external_id") <> ''::"text")),
    CONSTRAINT "contact_external_references_source_check" CHECK (("btrim"("source") <> ''::"text"))
);


ALTER TABLE "public"."contact_external_references" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_external_references" IS 'Identifiants d''un contact dans les logiciels tiers (portail citoyen, logiciel population, état civil…). Un identifiant par système et par contact ; dans une organisation, un identifiant externe pointe vers au plus un contact.';



COMMENT ON COLUMN "public"."contact_external_references"."organization_id" IS 'Copie de contacts.organization_id, posée automatiquement par trigger — support de l''unicité (organization_id, source, external_id).';



COMMENT ON COLUMN "public"."contact_external_references"."source" IS 'Code libre du système tiers (ex. portail_citoyen, logiciel_population, etat_civil).';



CREATE TABLE IF NOT EXISTS "public"."contact_relations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "related_contact_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_relations_not_self" CHECK (("contact_id" <> "related_contact_id"))
);


ALTER TABLE "public"."contact_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_role_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_role_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_role_assignments" IS 'Rôles portés par un contact (n-n). Le contact et le rôle doivent appartenir à la même organisation racine (trigger).';



CREATE TABLE IF NOT EXISTS "public"."contact_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_roles" IS 'Catalogue des rôles de contact (Habitant, Élu, Agent…), propre à chaque organisation racine, extensible sans migration. Même motif que document_types.';



CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "contact_type" "text" NOT NULL,
    "civility" "text",
    "first_name" "text",
    "last_name" "text",
    "usage_name" "text",
    "birth_date" "date",
    "legal_name" "text",
    "siret" "text",
    "email" "text",
    "mobile_phone" "text",
    "landline_phone" "text",
    "address_line1" "text",
    "address_line2" "text",
    "postal_code" "text",
    "city" "text",
    "country" "text" DEFAULT 'France'::"text" NOT NULL,
    "preferred_channel" "text",
    "consent_email" boolean DEFAULT false NOT NULL,
    "consent_sms" boolean DEFAULT false NOT NULL,
    "internal_notes" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "display_name" "text" GENERATED ALWAYS AS (
CASE
    WHEN ("contact_type" = 'personne'::"text") THEN NULLIF("btrim"(((COALESCE("usage_name", "last_name", ''::"text") || ' '::"text") || COALESCE("first_name", ''::"text"))), ''::"text")
    ELSE "legal_name"
END) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "address_lat" double precision,
    "address_lon" double precision,
    "quartier_id" "uuid",
    "quartier_auto" boolean DEFAULT true NOT NULL,
    "mobile_phone_normalized" "text" GENERATED ALWAYS AS ("public"."normalize_phone"("mobile_phone")) STORED,
    "landline_phone_normalized" "text" GENERATED ALWAYS AS ("public"."normalize_phone"("landline_phone")) STORED,
    CONSTRAINT "contacts_civility_by_type" CHECK ((("contact_type" = 'personne'::"text") = ("civility" IS NOT NULL))),
    CONSTRAINT "contacts_civility_check" CHECK (("civility" = ANY (ARRAY['madame'::"text", 'monsieur'::"text"]))),
    CONSTRAINT "contacts_legal_name_by_type" CHECK ((("contact_type" <> 'personne'::"text") = ("legal_name" IS NOT NULL))),
    CONSTRAINT "contacts_person_fields_by_type" CHECK ((("contact_type" = 'personne'::"text") OR (("first_name" IS NULL) AND ("last_name" IS NULL) AND ("usage_name" IS NULL) AND ("birth_date" IS NULL)))),
    CONSTRAINT "contacts_preferred_channel_check" CHECK (("preferred_channel" = ANY (ARRAY['email'::"text", 'telephone'::"text", 'courrier'::"text"]))),
    CONSTRAINT "contacts_siret_by_type" CHECK ((("contact_type" <> 'personne'::"text") OR ("siret" IS NULL))),
    CONSTRAINT "contacts_siret_format" CHECK ((("siret" IS NULL) OR ("siret" ~ '^[0-9]{14}$'::"text"))),
    CONSTRAINT "contacts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"]))),
    CONSTRAINT "contacts_type_check" CHECK (("contact_type" = ANY (ARRAY['personne'::"text", 'entreprise'::"text", 'association'::"text", 'administration'::"text"])))
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."contacts" IS 'Référentiel des usagers, partagé par toute la gamme (Ariane, Clara, Iris, portail citoyen). Un contact est rattaché à une organisation principale (racine) : les sous-organisations partagent le même référentiel. Écriture via API dédiée (service role), lecture par les membres de l''organisation.';



COMMENT ON COLUMN "public"."contacts"."contact_type" IS 'Type de contact : personne | entreprise | association | administration. Gouverne les invariants (civilité obligatoire pour une personne, raison sociale obligatoire pour une structure).';



COMMENT ON COLUMN "public"."contacts"."civility" IS 'Civilité (madame | monsieur). Obligatoire pour une personne physique : participe à l''identité pivot utilisée par les collectivités.';



COMMENT ON COLUMN "public"."contacts"."usage_name" IS 'Nom d''usage (facultatif) ; last_name = nom de naissance.';



COMMENT ON COLUMN "public"."contacts"."legal_name" IS 'Raison sociale — obligatoire pour entreprise / association / administration, interdite pour une personne.';



COMMENT ON COLUMN "public"."contacts"."siret" IS 'SIRET (14 chiffres), facultatif, unique par organisation quand renseigné. Interdit pour une personne physique.';



COMMENT ON COLUMN "public"."contacts"."preferred_channel" IS 'Canal de contact préféré : email | telephone | courrier.';



COMMENT ON COLUMN "public"."contacts"."internal_notes" IS 'Note interne visible uniquement par les agents. Ne doit jamais être exposée au portail citoyen ni sérialisée dans l''API publique.';



COMMENT ON COLUMN "public"."contacts"."status" IS 'active | archived — retrait réversible d''une fiche sans suppression (les applications aval référencent ces ids).';



COMMENT ON COLUMN "public"."contacts"."display_name" IS 'Nom d''affichage généré : nom d''usage/nom + prénom pour une personne, raison sociale sinon. Contrat de tri/recherche uniforme pour les applications consommatrices.';



COMMENT ON COLUMN "public"."contacts"."mobile_phone_normalized" IS 'Mobile normalisé (chiffres significatifs) — généré, pour recherche/rapprochement.';



COMMENT ON COLUMN "public"."contacts"."landline_phone_normalized" IS 'Fixe normalisé (chiffres significatifs) — généré, pour recherche/rapprochement.';



CREATE TABLE IF NOT EXISTS "public"."document_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."document_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_procedures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "procedure_id" "uuid",
    "is_enabled" boolean DEFAULT true,
    "custom_order" integer,
    "custom_name" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."organization_procedures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "slug" "text",
    "type" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "logo_url" "text",
    "address" "text",
    "phone" "text",
    "email" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "email_sender_override" boolean DEFAULT false NOT NULL,
    "email_sender_name" "text",
    CONSTRAINT "organizations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'obsolete'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."email_sender_override" IS 'Si vrai, utiliser email_sender_name comme nom d''expéditeur propre à l''organisation.';



COMMENT ON COLUMN "public"."organizations"."email_sender_name" IS 'Nom d''expéditeur spécifique à l''organisation (utilisé si email_sender_override).';



CREATE TABLE IF NOT EXISTS "public"."procedures" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "order_index" integer DEFAULT 0,
    "translations" "jsonb" DEFAULT '{}'::"jsonb",
    "keywords" "text"[],
    "agent_description" "text",
    "user_description" "text",
    "is_active_global" boolean DEFAULT true,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "type" "text" DEFAULT 'externe'::"text" NOT NULL,
    "short_description" "text",
    "input_duration_minutes" integer,
    "requester_config" "jsonb",
    "form_schema" "jsonb",
    "knowledge_base" "jsonb",
    CONSTRAINT "procedures_input_duration_check" CHECK ((("input_duration_minutes" IS NULL) OR ("input_duration_minutes" >= 0))),
    CONSTRAINT "procedures_type_check" CHECK (("type" = ANY (ARRAY['interne'::"text", 'externe'::"text"])))
);


ALTER TABLE "public"."procedures" OWNER TO "postgres";


COMMENT ON COLUMN "public"."procedures"."requester_config" IS 'Étape « Informations demandeur » : données demandées au requérant, par public (citoyen/entreprise/association) et par champ (obligatoire/visible/masque). Écriture soumise aux policies RLS existantes de procedures.';



COMMENT ON COLUMN "public"."procedures"."form_schema" IS 'Étape « Formulaire » : définition du formulaire de la démarche (sections, champs, conditions, pièces jointes typées). Schéma JSON possédé par Socle, contrat public consommé en aval. Écriture soumise aux policies RLS existantes de procedures.';



COMMENT ON COLUMN "public"."procedures"."knowledge_base" IS 'Base de connaissances à destination de l''agent et de son assistant LLM (texte d''aide, procédures, liens, FAQ, garde-fous, documents à venir). Contrat possédé, consommé en aval.';



CREATE TABLE IF NOT EXISTS "public"."quartiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text",
    "geom" "extensions"."geometry"(MultiPolygon,4326) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."quartiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."smtp_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "host" "text" DEFAULT ''::"text" NOT NULL,
    "port" integer DEFAULT 587 NOT NULL,
    "username" "text" DEFAULT ''::"text" NOT NULL,
    "password" "text" DEFAULT ''::"text" NOT NULL,
    "from_email" "text" DEFAULT ''::"text" NOT NULL,
    "from_name" "text" DEFAULT ''::"text" NOT NULL,
    "use_tls" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."smtp_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "organization_id" "uuid",
    "role" "text" NOT NULL
);


ALTER TABLE "public"."user_organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "global_role" "text" NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_external_references"
    ADD CONSTRAINT "contact_external_references_contact_source_unique" UNIQUE ("contact_id", "source");



ALTER TABLE ONLY "public"."contact_external_references"
    ADD CONSTRAINT "contact_external_references_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_relations"
    ADD CONSTRAINT "contact_relations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_relations"
    ADD CONSTRAINT "contact_relations_unique" UNIQUE ("contact_id", "related_contact_id", "role_id");



ALTER TABLE ONLY "public"."contact_role_assignments"
    ADD CONSTRAINT "contact_role_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_role_assignments"
    ADD CONSTRAINT "contact_role_assignments_unique" UNIQUE ("contact_id", "role_id");



ALTER TABLE ONLY "public"."contact_roles"
    ADD CONSTRAINT "contact_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_types"
    ADD CONSTRAINT "document_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_procedures"
    ADD CONSTRAINT "organization_procedures_organization_id_procedure_id_key" UNIQUE ("organization_id", "procedure_id");



ALTER TABLE ONLY "public"."organization_procedures"
    ADD CONSTRAINT "organization_procedures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."procedures"
    ADD CONSTRAINT "procedures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quartiers"
    ADD CONSTRAINT "quartiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."smtp_settings"
    ADD CONSTRAINT "smtp_settings_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."smtp_settings"
    ADD CONSTRAINT "smtp_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_user_id_organization_id_key" UNIQUE ("user_id", "organization_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "api_keys_organization_id_idx" ON "public"."api_keys" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "contact_external_refs_org_source_ext_unique" ON "public"."contact_external_references" USING "btree" ("organization_id", "source", "external_id");



COMMENT ON INDEX "public"."contact_external_refs_org_source_ext_unique" IS 'Dans une organisation, un identifiant externe (source + id) ne peut référencer qu''un seul contact.';



CREATE INDEX "contact_role_assignments_role_id_idx" ON "public"."contact_role_assignments" USING "btree" ("role_id");



CREATE UNIQUE INDEX "contact_roles_org_name_unique" ON "public"."contact_roles" USING "btree" ("organization_id", "lower"("name"));



COMMENT ON INDEX "public"."contact_roles_org_name_unique" IS 'Nom de rôle unique par organisation, insensible à la casse.';



CREATE INDEX "contacts_email_lower_idx" ON "public"."contacts" USING "btree" ("organization_id", "lower"("email")) WHERE ("email" IS NOT NULL);



CREATE INDEX "contacts_landline_phone_norm_idx" ON "public"."contacts" USING "btree" ("organization_id", "landline_phone_normalized") WHERE ("landline_phone_normalized" IS NOT NULL);



CREATE INDEX "contacts_last_name_trgm_idx" ON "public"."contacts" USING "gin" ("public"."match_full_name"("last_name", "first_name") "extensions"."gin_trgm_ops");



CREATE INDEX "contacts_legal_name_trgm_idx" ON "public"."contacts" USING "gin" ("public"."normalize_name"("legal_name") "extensions"."gin_trgm_ops");



CREATE INDEX "contacts_mobile_phone_norm_idx" ON "public"."contacts" USING "btree" ("organization_id", "mobile_phone_normalized") WHERE ("mobile_phone_normalized" IS NOT NULL);



CREATE INDEX "contacts_org_display_name_idx" ON "public"."contacts" USING "btree" ("organization_id", "lower"("display_name"));



CREATE UNIQUE INDEX "contacts_org_siret_unique" ON "public"."contacts" USING "btree" ("organization_id", "siret") WHERE ("siret" IS NOT NULL);



COMMENT ON INDEX "public"."contacts_org_siret_unique" IS 'Un même SIRET ne peut exister qu''une fois par organisation (doublon certain).';



CREATE INDEX "contacts_organization_id_idx" ON "public"."contacts" USING "btree" ("organization_id");



CREATE INDEX "contacts_usage_name_trgm_idx" ON "public"."contacts" USING "gin" ("public"."match_full_name"("usage_name", "first_name") "extensions"."gin_trgm_ops");



CREATE UNIQUE INDEX "document_types_org_name_unique" ON "public"."document_types" USING "btree" ("organization_id", "lower"("name"));



CREATE INDEX "document_types_organization_id_idx" ON "public"."document_types" USING "btree" ("organization_id");



CREATE INDEX "idx_contact_relations_contact" ON "public"."contact_relations" USING "btree" ("contact_id");



CREATE INDEX "idx_contact_relations_org" ON "public"."contact_relations" USING "btree" ("organization_id");



CREATE INDEX "idx_contact_relations_related" ON "public"."contact_relations" USING "btree" ("related_contact_id");



CREATE INDEX "idx_contacts_quartier" ON "public"."contacts" USING "btree" ("quartier_id");



CREATE INDEX "idx_quartiers_geom" ON "public"."quartiers" USING "gist" ("geom");



CREATE INDEX "idx_quartiers_org" ON "public"."quartiers" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "quartiers_org_name_unique" ON "public"."quartiers" USING "btree" ("organization_id", "lower"("name"));



CREATE OR REPLACE TRIGGER "contact_relations_sync_org" BEFORE INSERT OR UPDATE ON "public"."contact_relations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_contact_relation_org"();



CREATE OR REPLACE TRIGGER "enforce_document_type_root_org" BEFORE INSERT OR UPDATE ON "public"."document_types" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_document_type_root_org"();



CREATE OR REPLACE TRIGGER "set_contact_external_references_updated_at" BEFORE UPDATE ON "public"."contact_external_references" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_contacts_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_quartiers_updated_at" BEFORE UPDATE ON "public"."quartiers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_smtp_settings_updated_at" BEFORE UPDATE ON "public"."smtp_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assign_contact_quartier" BEFORE INSERT OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."assign_contact_quartier"();



CREATE OR REPLACE TRIGGER "trg_enforce_api_key_root_org" BEFORE INSERT OR UPDATE OF "organization_id" ON "public"."api_keys" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_api_key_root_org"();



CREATE OR REPLACE TRIGGER "trg_enforce_contact_role_root_org" BEFORE INSERT OR UPDATE ON "public"."contact_roles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_contact_role_root_org"();



CREATE OR REPLACE TRIGGER "trg_enforce_contact_role_same_org" BEFORE INSERT OR UPDATE ON "public"."contact_role_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_contact_role_same_org"();



CREATE OR REPLACE TRIGGER "trg_enforce_contact_root_org" BEFORE INSERT OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_contact_root_org"();



CREATE OR REPLACE TRIGGER "trg_enforce_org_depth" BEFORE INSERT OR UPDATE OF "parent_id" ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_org_depth"();



CREATE OR REPLACE TRIGGER "trg_enforce_procedure_root_org" BEFORE INSERT OR UPDATE OF "organization_id" ON "public"."procedures" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_procedure_root_org"();



CREATE OR REPLACE TRIGGER "trg_enforce_quartier_root_org" BEFORE INSERT OR UPDATE ON "public"."quartiers" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_quartier_root_org"();



CREATE OR REPLACE TRIGGER "trg_sync_contact_external_ref_org" BEFORE INSERT OR UPDATE ON "public"."contact_external_references" FOR EACH ROW EXECUTE FUNCTION "public"."sync_contact_external_ref_org"();



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_external_references"
    ADD CONSTRAINT "contact_external_references_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_external_references"
    ADD CONSTRAINT "contact_external_references_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_relations"
    ADD CONSTRAINT "contact_relations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_relations"
    ADD CONSTRAINT "contact_relations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_relations"
    ADD CONSTRAINT "contact_relations_related_contact_id_fkey" FOREIGN KEY ("related_contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_relations"
    ADD CONSTRAINT "contact_relations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."contact_roles"("id");



ALTER TABLE ONLY "public"."contact_role_assignments"
    ADD CONSTRAINT "contact_role_assignments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_role_assignments"
    ADD CONSTRAINT "contact_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."contact_roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_roles"
    ADD CONSTRAINT "contact_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_quartier_id_fkey" FOREIGN KEY ("quartier_id") REFERENCES "public"."quartiers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_types"
    ADD CONSTRAINT "document_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_procedures"
    ADD CONSTRAINT "organization_procedures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_procedures"
    ADD CONSTRAINT "organization_procedures_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."procedures"
    ADD CONSTRAINT "procedures_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id");



ALTER TABLE ONLY "public"."procedures"
    ADD CONSTRAINT "procedures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quartiers"
    ADD CONSTRAINT "quartiers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."smtp_settings"
    ADD CONSTRAINT "smtp_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_organizations"
    ADD CONSTRAINT "user_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "admin can assign users to orgs" ON "public"."user_organizations" FOR INSERT WITH CHECK (("public"."is_super_admin"() OR "public"."is_org_admin"("organization_id")));



CREATE POLICY "admin can remove users from orgs" ON "public"."user_organizations" FOR DELETE USING (("public"."is_super_admin"() OR "public"."is_org_admin"("organization_id")));



ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "api_keys super admin all" ON "public"."api_keys" USING ("public"."is_super_admin"()) WITH CHECK ("public"."is_super_admin"());



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_external_references" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_relations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_relations_select" ON "public"."contact_relations" FOR SELECT USING ("public"."has_org_access"("organization_id"));



ALTER TABLE "public"."contact_role_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "create org" ON "public"."organizations" FOR INSERT WITH CHECK (("public"."is_super_admin"() OR (("parent_id" IS NOT NULL) AND "public"."is_admin_of_self_or_ancestor"("parent_id"))));



CREATE POLICY "create procedures" ON "public"."procedures" FOR INSERT WITH CHECK (("public"."is_org_admin"("organization_id") OR "public"."is_super_admin"()));



CREATE POLICY "delete org" ON "public"."organizations" FOR DELETE USING (("public"."is_super_admin"() AND ("parent_id" IS NOT NULL)));



CREATE POLICY "delete procedures" ON "public"."procedures" FOR DELETE USING (("public"."is_super_admin"() OR "public"."is_org_admin"("organization_id")));



CREATE POLICY "disable procedure" ON "public"."organization_procedures" FOR DELETE USING ("public"."is_admin_of_self_or_ancestor"("organization_id"));



ALTER TABLE "public"."document_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "enable procedure in org" ON "public"."organization_procedures" FOR INSERT WITH CHECK ("public"."is_admin_of_self_or_ancestor"("organization_id"));



CREATE POLICY "org admins can read member profiles" ON "public"."users" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "users"."id") AND "public"."is_org_admin"("uo"."organization_id")))));



CREATE POLICY "org admins can read org memberships" ON "public"."user_organizations" FOR SELECT USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "org admins can read smtp settings" ON "public"."smtp_settings" FOR SELECT USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "org admins can update member profiles" ON "public"."users" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "users"."id") AND "public"."is_org_admin"("uo"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_organizations" "uo"
  WHERE (("uo"."user_id" = "users"."id") AND "public"."is_org_admin"("uo"."organization_id")))));



CREATE POLICY "org admins can write smtp settings" ON "public"."smtp_settings" USING ("public"."is_org_admin"("organization_id")) WITH CHECK ("public"."is_org_admin"("organization_id"));



ALTER TABLE "public"."organization_procedures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."procedures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quartiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read categories" ON "public"."categories" FOR SELECT USING ("public"."has_org_access"("organization_id"));



CREATE POLICY "read contact_external_references" ON "public"."contact_external_references" FOR SELECT TO "authenticated" USING ("public"."has_org_access"("organization_id"));



CREATE POLICY "read contact_role_assignments" ON "public"."contact_role_assignments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."contacts" "c"
  WHERE (("c"."id" = "contact_role_assignments"."contact_id") AND "public"."has_org_access"("c"."organization_id")))));



CREATE POLICY "read contact_roles" ON "public"."contact_roles" FOR SELECT TO "authenticated" USING ("public"."has_org_access"("organization_id"));



CREATE POLICY "read contacts" ON "public"."contacts" FOR SELECT TO "authenticated" USING ("public"."has_org_access"("organization_id"));



CREATE POLICY "read document_types" ON "public"."document_types" FOR SELECT USING ("public"."has_org_access"("organization_id"));



CREATE POLICY "read org procedure bindings" ON "public"."organization_procedures" FOR SELECT USING (("public"."has_org_access"("organization_id") OR "public"."is_admin_of_self_or_ancestor"("organization_id")));



CREATE POLICY "read organizations if member" ON "public"."organizations" FOR SELECT USING (("public"."has_org_access"("id") OR "public"."is_admin_of_self_or_ancestor"("id")));



CREATE POLICY "read own org memberships" ON "public"."user_organizations" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "read procedures" ON "public"."procedures" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND (("u"."global_role" = 'super_admin'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."user_organizations" "uo"
          WHERE (("uo"."user_id" = "u"."id") AND ("uo"."organization_id" = "procedures"."organization_id")))))))));



CREATE POLICY "read procedures via activation" ON "public"."procedures" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_procedures" "op"
  WHERE (("op"."procedure_id" = "procedures"."id") AND "public"."has_org_access"("op"."organization_id")))));



CREATE POLICY "read quartiers" ON "public"."quartiers" FOR SELECT TO "authenticated" USING ("public"."has_org_access"("organization_id"));



ALTER TABLE "public"."smtp_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update org" ON "public"."organizations" FOR UPDATE USING ("public"."is_admin_of_self_or_ancestor"("id")) WITH CHECK ("public"."is_admin_of_self_or_ancestor"("id"));



CREATE POLICY "update org procedure" ON "public"."organization_procedures" FOR UPDATE USING ("public"."is_admin_of_self_or_ancestor"("organization_id")) WITH CHECK ("public"."is_admin_of_self_or_ancestor"("organization_id"));



CREATE POLICY "update procedures" ON "public"."procedures" FOR UPDATE USING (("public"."is_org_admin"("organization_id") OR "public"."is_super_admin"())) WITH CHECK (("public"."is_org_admin"("organization_id") OR "public"."is_super_admin"()));



ALTER TABLE "public"."user_organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can read own profile" ON "public"."users" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_super_admin"()));



CREATE POLICY "users can update own profile" ON "public"."users" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "write categories" ON "public"."categories" USING ("public"."is_org_admin"("organization_id")) WITH CHECK ("public"."is_org_admin"("organization_id"));



CREATE POLICY "write contact_roles" ON "public"."contact_roles" TO "authenticated" USING ("public"."is_org_admin"("organization_id")) WITH CHECK ("public"."is_org_admin"("organization_id"));



CREATE POLICY "write document_types" ON "public"."document_types" USING ("public"."is_org_admin"("organization_id")) WITH CHECK ("public"."is_org_admin"("organization_id"));



CREATE POLICY "write quartiers" ON "public"."quartiers" TO "authenticated" USING ("public"."is_org_admin"("organization_id")) WITH CHECK ("public"."is_org_admin"("organization_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
























































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."assign_contact_quartier"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_contact_quartier"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."contacts_outside_quartiers"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."contacts_outside_quartiers"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contacts_outside_quartiers"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_quartier_from_geojson"("p_org_id" "uuid", "p_name" "text", "p_color" "text", "p_geojson" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_quartier_from_geojson"("p_org_id" "uuid", "p_name" "text", "p_color" "text", "p_geojson" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_quartier_from_geojson"("p_org_id" "uuid", "p_name" "text", "p_color" "text", "p_geojson" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_quartiers_batch"("p_org_id" "uuid", "p_items" "jsonb", "p_replace" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_quartiers_batch"("p_org_id" "uuid", "p_items" "jsonb", "p_replace" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_quartiers_batch"("p_org_id" "uuid", "p_items" "jsonb", "p_replace" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_api_key_root_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_api_key_root_org"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_contact_role_root_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_contact_role_root_org"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_contact_role_same_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_contact_role_same_org"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_contact_root_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_contact_root_org"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_document_type_root_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_document_type_root_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_org_depth"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_org_depth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_org_depth"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_procedure_root_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_procedure_root_org"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_quartier_root_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_quartier_root_org"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_org_access"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_org_access"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_org_access"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."immutable_unaccent"("value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."immutable_unaccent"("value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."immutable_unaccent"("value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_of_self_or_ancestor"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_of_self_or_ancestor"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_of_self_or_ancestor"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_quartiers_geojson"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_quartiers_geojson"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_quartiers_geojson"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_contacts"("p_org_id" "uuid", "p_contact_type" "text", "p_first_name" "text", "p_last_name" "text", "p_usage_name" "text", "p_legal_name" "text", "p_siret" "text", "p_birth_date" "date", "p_email" "text", "p_phones" "text"[], "p_status" "text", "p_exclude_ids" "uuid"[], "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_contacts"("p_org_id" "uuid", "p_contact_type" "text", "p_first_name" "text", "p_last_name" "text", "p_usage_name" "text", "p_legal_name" "text", "p_siret" "text", "p_birth_date" "date", "p_email" "text", "p_phones" "text"[], "p_status" "text", "p_exclude_ids" "uuid"[], "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."match_full_name"("family" "text", "given" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."match_full_name"("family" "text", "given" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_full_name"("family" "text", "given" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_name"("value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_name"("value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_name"("value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_phone"("raw" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone"("raw" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone"("raw" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."org_subtree_ids"("root" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."org_subtree_ids"("root" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."quartier_for_point"("p_org_id" "uuid", "p_lon" double precision, "p_lat" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."quartier_for_point"("p_org_id" "uuid", "p_lon" double precision, "p_lat" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."quartier_for_point"("p_org_id" "uuid", "p_lon" double precision, "p_lat" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."recalculate_contact_quartiers"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_contact_quartiers"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_contact_quartiers"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reset_orphan_manual_quartiers"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_orphan_manual_quartiers"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_orphan_manual_quartiers"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."stats_contacts_by_quartier"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."stats_contacts_by_quartier"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stats_contacts_by_quartier"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_contact_external_ref_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_contact_external_ref_org"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_contact_relation_org"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_contact_relation_org"() TO "service_role";

















































































GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."contact_external_references" TO "anon";
GRANT ALL ON TABLE "public"."contact_external_references" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_external_references" TO "service_role";



GRANT ALL ON TABLE "public"."contact_relations" TO "anon";
GRANT ALL ON TABLE "public"."contact_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_relations" TO "service_role";



GRANT ALL ON TABLE "public"."contact_role_assignments" TO "anon";
GRANT ALL ON TABLE "public"."contact_role_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_role_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."contact_roles" TO "anon";
GRANT ALL ON TABLE "public"."contact_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_roles" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."document_types" TO "anon";
GRANT ALL ON TABLE "public"."document_types" TO "authenticated";
GRANT ALL ON TABLE "public"."document_types" TO "service_role";



GRANT ALL ON TABLE "public"."organization_procedures" TO "anon";
GRANT ALL ON TABLE "public"."organization_procedures" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_procedures" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."procedures" TO "anon";
GRANT ALL ON TABLE "public"."procedures" TO "authenticated";
GRANT ALL ON TABLE "public"."procedures" TO "service_role";



GRANT ALL ON TABLE "public"."quartiers" TO "anon";
GRANT ALL ON TABLE "public"."quartiers" TO "authenticated";
GRANT ALL ON TABLE "public"."quartiers" TO "service_role";



GRANT ALL ON TABLE "public"."smtp_settings" TO "anon";
GRANT ALL ON TABLE "public"."smtp_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."smtp_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_organizations" TO "anon";
GRANT ALL ON TABLE "public"."user_organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_organizations" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































