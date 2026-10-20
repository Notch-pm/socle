-- ============================================================================
-- Scope `citizen` — la fiche d'un usager vue par SON compte du portail (Nora).
--
-- Projet Sceaux (AO 26AS02), espace usager lot L3b. Le compte citoyen vit dans
-- le projet Nora ; la personne vit ici, dans `contacts`. Le lien est une
-- référence externe `portail_citoyen` dont l'identifiant est celui du compte
-- (roadmap « Portail usagers », étape 4 : « le compte est une référence
-- externe du contact, pas une seconde fiche »).
--
-- Le scope `contacts` ouvre le référentiel ENTIER d'une collectivité, notes
-- internes comprises : jamais pour le portail. `citizen` n'ouvre qu'UNE fiche,
-- désignée par le compte, et seulement ses champs d'usager (contacts-api
-- `/v1/citizen/*`, liste blanche `_shared/citizen.ts`).
--
-- Rattachement STRICT (décision PO du 2026-10-19, garde-fou de « Mes
-- demandes ») : le compte rejoint une fiche existante seulement si elle est
-- UNIQUE à porter la même adresse — vérifiée par Nora — ET le même nom et le
-- même prénom (normalisés), et qu'aucun autre compte ne la tient déjà. Sinon,
-- une fiche neuve : un doublon vaut mieux que les demandes d'un homonyme.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Le scope
--
-- ⚠️ La liste reprend TOUS les scopes existants : en oublier un rendrait
-- invalides, à la prochaine écriture, les clés qui le portent.
-- ----------------------------------------------------------------------------

alter table public.api_keys drop constraint api_keys_scopes_known;
alter table public.api_keys
  add constraint api_keys_scopes_known
  check (scopes <@ array['read', 'contacts', 'smtp', 'ai', 'audience', 'integrations', 'citizen']::text[]);

-- ----------------------------------------------------------------------------
-- 2. Le rattachement
-- ----------------------------------------------------------------------------

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
  v_last text := public.normalize_name(p_fields->>'last_name');
  v_first text := public.normalize_name(p_fields->>'first_name');
  v_candidates uuid[];
  v_id uuid;
begin
  if v_email is null or v_email = '' or v_last = '' or v_first = '' then
    raise exception 'Identité incomplète : adresse, nom et prénom sont requis.' using errcode = '22023';
  end if;

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
    nullif(p_fields->>'birth_date', '')::date,
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

comment on function public.citizen_contact_link(uuid, text, jsonb) is
  'Rattache un compte du portail (Nora) à une fiche usager : la fiche UNIQUE de même adresse, même nom et même prénom non tenue par un autre compte, sinon une fiche neuve. Référence externe portail_citoyen. service_role uniquement (contacts-api, scope citizen).';
revoke execute on function public.citizen_contact_link(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.citizen_contact_link(uuid, text, jsonb) to service_role;
