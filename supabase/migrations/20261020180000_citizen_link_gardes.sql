-- ============================================================================
-- `citizen_contact_link` : deux gardes qui ne gardaient rien (tests de la
-- partie usagers, 2026-10-20).
--
-- S2 — `normalize_name('')` rend NULL, pas '' : la garde `v_last = ''` valait
-- NULL, donc FAUX, et un nom blanc créait une fiche au prénom vide.
-- Inatteignable par HTTP (contacts-api refuse un nom blanc en amont), mais la
-- fonction ne doit pas compter sur son appelant.
--
-- S1 — une date impossible (« 1990-02-31 ») levait 22008 à la conversion, que
-- contacts-api rendait en 500. Elle est désormais refusée comme une saisie
-- invalide (22023, comme les autres champs).
--
-- Le reste est inchangé (voir 20261020120000_contacts_citizen.sql).
-- ============================================================================

create or replace function public.citizen_contact_link(
  p_organization_id uuid,
  p_account_id text,
  p_fields jsonb
)
returns table (contact_id uuid, outcome text)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_existing uuid;
  v_email text := lower(btrim(p_fields->>'email'));
  v_last text := coalesce(public.normalize_name(p_fields->>'last_name'), '');
  v_first text := coalesce(public.normalize_name(p_fields->>'first_name'), '');
  v_postal text := replace(coalesce(p_fields->>'postal_code', ''), ' ', '');
  v_birth date;
  v_candidates uuid[];
  v_id uuid;
begin
  if v_email is null or v_email = '' or v_last = '' or v_first = '' or v_postal = '' then
    raise exception 'Identité incomplète : adresse, nom, prénom et code postal sont requis.' using errcode = '22023';
  end if;
  begin
    v_birth := nullif(p_fields->>'birth_date', '')::date;
  exception when others then
    raise exception 'Date de naissance invalide.' using errcode = '22023';
  end;

  -- Déjà rattaché : la même fiche, toujours.
  select r.contact_id into v_existing
    from public.contact_external_references r
   where r.organization_id = p_organization_id and r.source = 'portail_citoyen' and r.external_id = p_account_id;
  if v_existing is not null then
    return query select v_existing, 'already_linked'::text;
    return;
  end if;

  -- Deux rattachements concurrents de la même adresse ne créent pas deux fiches.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || v_email, 0));

  select array_agg(c.id) into v_candidates
    from public.contacts c
   where c.organization_id = p_organization_id
     and c.status = 'active'
     and c.contact_type = 'personne'
     and lower(c.email) = v_email
     and public.normalize_name(c.first_name) = v_first
     and (public.normalize_name(c.last_name) = v_last or public.normalize_name(c.usage_name) = v_last)
     and replace(coalesce(c.postal_code, ''), ' ', '') = v_postal
     and (c.birth_date is null or c.birth_date = v_birth)
     and not exists (
       select 1 from public.contact_external_references r
        where r.contact_id = c.id and r.source = 'portail_citoyen'
     );

  if coalesce(array_length(v_candidates, 1), 0) = 1 then
    v_id := v_candidates[1];
    insert into public.contact_external_references (contact_id, source, external_id)
    values (v_id, 'portail_citoyen', p_account_id);
    return query select v_id, 'existing'::text;
    return;
  end if;

  insert into public.contacts (
    organization_id, contact_type, civility, first_name, last_name, usage_name, birth_date,
    email, mobile_phone, landline_phone, address_line1, address_line2, postal_code, city, country
  ) values (
    p_organization_id, 'personne',
    nullif(p_fields->>'civility', ''),
    btrim(p_fields->>'first_name'),
    btrim(p_fields->>'last_name'),
    nullif(btrim(coalesce(p_fields->>'usage_name', '')), ''),
    v_birth,
    v_email,
    nullif(btrim(coalesce(p_fields->>'mobile_phone', '')), ''),
    nullif(btrim(coalesce(p_fields->>'landline_phone', '')), ''),
    nullif(btrim(coalesce(p_fields->>'address_line1', '')), ''),
    nullif(btrim(coalesce(p_fields->>'address_line2', '')), ''),
    nullif(btrim(coalesce(p_fields->>'postal_code', '')), ''),
    nullif(btrim(coalesce(p_fields->>'city', '')), ''),
    coalesce(nullif(btrim(coalesce(p_fields->>'country', '')), ''), 'France')
  )
  returning id into v_id;
  insert into public.contact_external_references (contact_id, source, external_id)
  values (v_id, 'portail_citoyen', p_account_id);
  return query select v_id, 'created'::text;
end;
$fn$;

revoke execute on function public.citizen_contact_link(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.citizen_contact_link(uuid, text, jsonb) to service_role;
