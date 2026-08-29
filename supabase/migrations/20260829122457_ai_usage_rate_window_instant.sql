-- Correctif de la fenêtre de débit : un INSTANT, pas un horodatage recalé.
--
-- ⚠️ LE PIÈGE, POUR NE PAS LE REFAIRE. `now() at time zone 'utc'` produit un
-- `timestamp` SANS fuseau. L'affecter à une variable `timestamptz` le recale
-- ensuite selon le fuseau de la SESSION : la valeur de fenêtre stockée
-- dépendrait donc de qui appelle, et deux appelants aux fuseaux différents
-- tomberaient dans deux seaux distincts à la même seconde.
--
-- `date_trunc('minute', now())` reste un `timestamptz` de bout en bout, et la
-- troncature à la minute est indépendante du fuseau — aucun décalage moderne
-- n'est fractionnaire en minutes. Même correction dans la purge, qui comparait
-- `window_start` (timestamptz) à un `timestamp` recalé.
--
-- Repéré à la relecture, avant toute mise en service : la table venait d'être
-- créée et ne contenait aucune ligne.

create or replace function public.purge_ai_usage_rate(p_keep_minutes int default 60)
returns int
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_count int;
begin
  delete from public.ai_usage_rate
   where window_start < now() - make_interval(mins => greatest(coalesce(p_keep_minutes, 60), 1));
  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

alter function public.purge_ai_usage_rate(int) owner to postgres;
-- ⚠️ Le `CREATE OR REPLACE` re-grante PUBLIC : REVOKE à re-poser ici.
revoke all on function public.purge_ai_usage_rate(int) from public, anon, authenticated;

-- `reserve_ai_usage` est remplacée à l'identique, à la seule ligne `v_window`
-- près. Le corps complet vit dans `20260829122250_ai_usage_rate_gate.sql` ;
-- c'est le fichier à lire pour comprendre les deux portes.
create or replace function public.reserve_ai_usage(
  p_org_id            uuid,
  p_provider          text,
  p_resource_type     text,
  p_estimated_tokens  bigint,
  p_consumer          text,
  p_api_key_id        uuid default null,
  p_feature           text default null,
  p_external_ref_kind text default null,
  p_external_ref_id   uuid default null,
  p_external_actor_id uuid default null
) returns table (
  event_id        uuid,
  allowed         boolean,
  reason          text,
  limit_tokens    bigint,
  used_tokens     bigint,
  reserved_tokens bigint,
  usage_period    text,
  renews_at       date
)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  c_max_actor    constant int := 20;
  c_max_consumer constant int := 120;

  v_kind      text;
  v_subject   text;
  v_max       int;
  -- ⚠️ Un INSTANT tronqué à la minute, jamais un `timestamp` recalé par le
  -- fuseau de session. C'est TOUT l'objet de cette migration.
  v_window    timestamptz := date_trunc('minute', now());

  v_period    text := to_char((now() at time zone 'utc'), 'YYYY-MM');
  v_renews    date := (date_trunc('month', (now() at time zone 'utc')) + interval '1 month')::date;
  v_estimate  bigint := greatest(coalesce(p_estimated_tokens, 0), 0);
  v_quota     public.ai_usage_quotas%rowtype;
  v_event     uuid;
  v_rows      int;
  v_used      bigint;
  v_reserved  bigint;
begin
  if coalesce(btrim(p_consumer), '') = '' then
    raise exception 'Consommateur manquant : la depense doit etre imputable.' using errcode = '22023';
  end if;

  -- ── PORTE 1 : LE DÉBIT (tentatives, refus compris) ─────────────────────
  if p_external_actor_id is not null then
    v_kind := 'actor';
    v_subject := p_external_actor_id::text;
    v_max := c_max_actor;
  else
    v_kind := 'consumer';
    v_subject := btrim(p_consumer);
    v_max := c_max_consumer;
  end if;

  insert into public.ai_usage_rate (organization_id, subject_kind, subject, window_start)
       values (p_org_id, v_kind, v_subject, v_window)
  on conflict (organization_id, subject_kind, subject, window_start) do nothing;

  update public.ai_usage_rate r
     set attempts = r.attempts + 1
   where r.organization_id = p_org_id
     and r.subject_kind    = v_kind
     and r.subject         = v_subject
     and r.window_start    = v_window
     and r.attempts + 1   <= v_max;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return query select null::uuid, false, 'rate_limited'::text,
                        null::bigint, null::bigint, null::bigint, v_period, v_renews;
    return;
  end if;

  -- ── PORTE 2 : LE PLAFOND ───────────────────────────────────────────────
  select q.* into v_quota
    from public.ai_usage_quotas q
   where q.organization_id = p_org_id
     and q.provider in (p_provider, '__global__')
     and q.is_active
   order by (q.provider = p_provider) desc
   limit 1;

  if v_quota.id is null then
    insert into public.ai_usage_events (
      organization_id, provider, counter_provider, consumer, api_key_id, feature,
      resource_type, status, estimated_tokens, period,
      external_ref_kind, external_ref_id, external_actor_id
    ) values (
      p_org_id, p_provider, null, p_consumer, p_api_key_id, p_feature,
      p_resource_type, 'reserved', v_estimate, v_period,
      p_external_ref_kind, p_external_ref_id, p_external_actor_id
    ) returning id into v_event;
    return query select v_event, true, 'no_quota_configured'::text,
                        null::bigint, null::bigint, null::bigint, v_period, v_renews;
    return;
  end if;

  insert into public.ai_usage_counters (organization_id, provider, period)
       values (p_org_id, v_quota.provider, v_period)
  on conflict (organization_id, provider, period) do nothing;

  update public.ai_usage_counters c
     set reserved_tokens = c.reserved_tokens + v_estimate,
         updated_at      = now()
   where c.organization_id = p_org_id
     and c.provider        = v_quota.provider
     and c.period          = v_period
     and (c.used_tokens + c.reserved_tokens + v_estimate) <= v_quota.monthly_limit_tokens;
  get diagnostics v_rows = row_count;

  select c.used_tokens, c.reserved_tokens into v_used, v_reserved
    from public.ai_usage_counters c
   where c.organization_id = p_org_id
     and c.provider        = v_quota.provider
     and c.period          = v_period;

  if v_rows = 0 then
    return query select null::uuid, false, 'quota_exceeded'::text,
                        v_quota.monthly_limit_tokens, v_used, v_reserved, v_period, v_renews;
    return;
  end if;

  insert into public.ai_usage_events (
    organization_id, provider, counter_provider, consumer, api_key_id, feature,
    resource_type, status, estimated_tokens, period,
    external_ref_kind, external_ref_id, external_actor_id
  ) values (
    p_org_id, p_provider, v_quota.provider, p_consumer, p_api_key_id, p_feature,
    p_resource_type, 'reserved', v_estimate, v_period,
    p_external_ref_kind, p_external_ref_id, p_external_actor_id
  ) returning id into v_event;

  return query select v_event, true, 'ok'::text,
                      v_quota.monthly_limit_tokens, v_used, v_reserved, v_period, v_renews;
end $fn$;

alter function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  owner to postgres;
revoke execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid, text, text, bigint, text, uuid, text, text, uuid, uuid)
  to service_role;
