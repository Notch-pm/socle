-- Rapprochement d'identités (détection de doublons) pour contacts-api :
-- normalisation des téléphones et des noms + RPC match_contacts.
--
-- Conçu pour tenir à 10^5 contacts : colonnes générées + index b-tree pour les
-- égalités (téléphone, email), index GIN trigram pour la similarité de noms.

-- ---------------------------------------------------------------------------
-- Téléphone normalisé : chiffres seuls, indicatif France (+33 / 0033) et 0
-- initial retirés → « +33 6 12 34 56 78 », « 0033612345678 » et
-- « 06 12 34 56 78 » donnent tous « 612345678 ». Les numéros étrangers
-- restent en chiffres bruts (comparés tels quels, best-effort).
create or replace function public.normalize_phone(raw text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
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
comment on function public.normalize_phone(text) is
  'Numéro de téléphone réduit aux chiffres significatifs (indicatif France et 0 initial retirés) — alimente les colonnes générées *_phone_normalized de contacts.';

-- unaccent() est STABLE (le dictionnaire est un paramètre de session) : ce
-- wrapper fige le dictionnaire standard pour obtenir une fonction IMMUTABLE,
-- utilisable dans des index d''expression. Motif documenté par PostgreSQL.
create or replace function public.immutable_unaccent(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

-- Nom normalisé pour rapprochement : sans accent, en minuscules, ponctuation
-- et espaces multiples repliés en espace simple ; vide → null.
create or replace function public.normalize_name(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    btrim(regexp_replace(lower(public.immutable_unaccent(coalesce(value, ''))), '[^a-z0-9]+', ' ', 'g')),
    ''
  )
$$;

-- Nom complet « famille prénom » normalisé (l''un des deux peut manquer).
create or replace function public.match_full_name(family text, given text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    btrim(coalesce(public.normalize_name(family), '') || ' ' || coalesce(public.normalize_name(given), '')),
    ''
  )
$$;

-- ---------------------------------------------------------------------------
-- Colonnes générées + index.
alter table public.contacts
  add column if not exists mobile_phone_normalized text
    generated always as (public.normalize_phone(mobile_phone)) stored,
  add column if not exists landline_phone_normalized text
    generated always as (public.normalize_phone(landline_phone)) stored;

comment on column public.contacts.mobile_phone_normalized is
  'Mobile normalisé (chiffres significatifs) — généré, pour recherche/rapprochement.';
comment on column public.contacts.landline_phone_normalized is
  'Fixe normalisé (chiffres significatifs) — généré, pour recherche/rapprochement.';

create index if not exists contacts_mobile_phone_norm_idx
  on public.contacts (organization_id, mobile_phone_normalized)
  where mobile_phone_normalized is not null;
create index if not exists contacts_landline_phone_norm_idx
  on public.contacts (organization_id, landline_phone_normalized)
  where landline_phone_normalized is not null;
create index if not exists contacts_email_lower_idx
  on public.contacts (organization_id, lower(email))
  where email is not null;

-- Index trigram (GIN) sur les noms normalisés — candidats de similarité.
create index if not exists contacts_last_name_trgm_idx
  on public.contacts using gin ((public.match_full_name(last_name, first_name)) extensions.gin_trgm_ops);
create index if not exists contacts_usage_name_trgm_idx
  on public.contacts using gin ((public.match_full_name(usage_name, first_name)) extensions.gin_trgm_ops);
create index if not exists contacts_legal_name_trgm_idx
  on public.contacts using gin ((public.normalize_name(legal_name)) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- RPC de rapprochement. SECURITY INVOKER ; EXECUTE réservé à service_role
-- (motif org_subtree_ids) : seule l''edge function contacts-api l''appelle, en
-- bornant p_org_id à l''organisation de la clé API.
--
-- Motifs (`reasons`) : email, phone, siret (égalités normalisées),
-- name_exact (nom complet normalisé identique), name_similar (similarité
-- trigram >= 0.5 sur le nom complet, avec garde-fou prénom : similarité
-- prénom >= 0.1 quand les deux prénoms sont connus — un homonyme de nom de
-- famille seul n''est pas un doublon), birth_date (jamais suffisant seul,
-- renforce un autre motif). Les noms de naissance ET d''usage sont comparés
-- des deux côtés.
--
-- Score (classement uniquement) : email +100 · phone +80 · siret +120 ·
-- name_exact +60 · name_similar +arrondi(40 × similarité) · birth_date +20.
create or replace function public.match_contacts(
  p_org_id uuid,
  p_contact_type text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_usage_name text default null,
  p_legal_name text default null,
  p_siret text default null,
  p_birth_date date default null,
  p_email text default null,
  p_phones text[] default null,
  p_status text default 'active',
  p_exclude_ids uuid[] default null,
  p_limit integer default 5
)
returns table (contact_id uuid, score integer, reasons text[])
language plpgsql
set search_path = ''
as $$
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

comment on function public.match_contacts is
  'Rapprochement d''identités (détection de doublons) — appelée par l''edge function contacts-api (POST /v1/contacts/match), bornée à l''organisation de la clé API.';

revoke execute on function public.match_contacts(uuid, text, text, text, text, text, text, date, text, text[], text, uuid[], integer)
  from public, anon, authenticated;
grant execute on function public.match_contacts(uuid, text, text, text, text, text, text, date, text, text[], text, uuid[], integer)
  to service_role;
